import { NextRequest, NextResponse } from "next/server";
import {
  getPendingTier,
  getPendingUserId,
  getPendingEmail,
  getPendingName,
  setPaymentVerified,
} from "@/lib/payment-store";
import type { PurchaseTier } from "@/lib/payment-store";
import { setUserPaidServer, getUserIdByCheckoutId } from "@/lib/supabase-server";
import { sendSuccessEmail } from "@/lib/success-email";
import { incrementPaidCount } from "@/lib/pricing";
import { refreshCreditsAfterPayment } from "@/lib/credits";
import { addRefillCredits, getSuFromAmount } from "@/lib/refill";
import { syncPublicProfileIsPaid } from "@/lib/sync-public-profile-paid";
import { claimWebhookIdempotency } from "@/lib/webhook-idempotency";

const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;
/** Signature verification: set INTASEND_WEBHOOK_SECRET to the value IntaSend sends in x-intasend-signature (or Authorization). */
const WEBHOOK_SECRET = process.env.INTASEND_WEBHOOK_SECRET;
/** Optional: comma-separated IntaSend webhook IPs. If set, only these IPs are allowed (x-forwarded-for / x-real-ip). */
const WEBHOOK_IP_ALLOWLIST = process.env.INTASEND_WEBHOOK_IP_ALLOWLIST?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

type WebhookPayload = {
  event?: string;
  state?: string;
  api_ref?: string;
  invoice_id?: string;
  amount?: number | string;
  value?: number | string;
  net_amount?: number | string;
  invoice?: { state?: string; api_ref?: string; provider?: string; amount?: number | string; value?: number | string; net_amount?: number | string };
  [key: string]: unknown;
};

function getApiRefAndState(payload: WebhookPayload): { apiRef: string | undefined; state: string | undefined } {
  const state = payload?.state ?? payload?.invoice?.state;
  const apiRef = (payload?.api_ref ?? payload?.invoice?.api_ref) as string | undefined;
  return { apiRef, state };
}

/** Extract amount paid from IntaSend webhook (KES). Tries amount, value, net_amount. */
function getAmountPaid(payload: WebhookPayload): number | null {
  const raw =
    payload?.amount ??
    payload?.value ??
    payload?.net_amount ??
    payload?.invoice?.amount ??
    payload?.invoice?.value ??
    payload?.invoice?.net_amount;
  if (raw == null) return null;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * IntaSend webhook: when payment.cleared or state COMPLETE, unlock user (set is_paid in Supabase).
 * Payment Guard:
 * - Signature: INTASEND_WEBHOOK_SECRET must match x-intasend-signature or Authorization header (when set).
 * - IP allowlist: optional INTASEND_WEBHOOK_IP_ALLOWLIST (comma-separated) restricts to official IntaSend IPs.
 * - Replay: claimWebhookIdempotency(api_ref) ensures each checkout_id is processed only once; duplicate requests return 200 without applying credits.
 */
export async function POST(request: NextRequest) {
  if (!INTASEND_SECRET) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  if (WEBHOOK_SECRET) {
    const sentHeader = request.headers.get("x-intasend-signature") ?? request.headers.get("authorization");
    const received = sentHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!received || received !== WEBHOOK_SECRET) {
      return NextResponse.json({ message: "Invalid or missing webhook signature" }, { status: 401 });
    }
  } else {
    console.warn("[IntaSend Webhook] INTASEND_WEBHOOK_SECRET not set; webhook signature verification is disabled.");
  }

  if (WEBHOOK_IP_ALLOWLIST.length > 0) {
    const forwarded = request.headers.get("x-forwarded-for");
    const clientIp = (forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "").trim();
    if (!clientIp || !WEBHOOK_IP_ALLOWLIST.includes(clientIp)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
  }

  const rawBody = await request.text();
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const event = (payload?.event ?? "").toString().toLowerCase();
  const { apiRef, state } = getApiRefAndState(payload);

  const isComplete =
    state === "COMPLETE" ||
    event === "payment.cleared" ||
    event === "invoice.complete" ||
    event === "challenge.completed";

  if (!isComplete || !apiRef) {
    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  }

  const isFirstTime = await claimWebhookIdempotency(apiRef);
  if (!isFirstTime) {
    return NextResponse.json({ message: "Already processed" }, { status: 200 });
  }

  const tier = getPendingTier(apiRef);
  if (tier) {
    setPaymentVerified(apiRef, tier as PurchaseTier);
  }

  let userId = getPendingUserId(apiRef);
  if (!userId) {
    userId = await getUserIdByCheckoutId(apiRef);
  }
  const amountPaid = getAmountPaid(payload);
  const isRefillAmount = amountPaid != null && getSuFromAmount(amountPaid) > 0;
  const isRefillTier = tier === "refill_minor" || tier === "refill_standard" || tier === "refill_executive";
  const isExecutiveByAmount = tier == null && amountPaid != null && [999, 1499].includes(Math.round(Number(amountPaid)));

  if (userId) {
    if ((isRefillTier || isRefillAmount) && !isExecutiveByAmount) {
      const amount = amountPaid ?? (tier === "refill_minor" ? 299 : tier === "refill_standard" ? 999 : tier === "refill_executive" ? 2499 : 0);
      if (amount > 0) {
        try {
          await addRefillCredits(userId, amount);
        } catch (e) {
          console.warn("[IntaSend Webhook] addRefillCredits failed:", e);
        }
      }
    } else {
      // Executive Pass or single purchase: set is_paid (server-side, RLS-safe) and grant SUs
      if (tier !== "credits") {
        const paidResult = await setUserPaidServer(userId);
        if (!paidResult.ok) {
          console.warn("[IntaSend Webhook] setUserPaidServer failed:", paidResult.error);
        }
        try {
          await syncPublicProfileIsPaid(userId);
        } catch (e) {
          console.warn("[IntaSend Webhook] syncPublicProfileIsPaid failed (portfolio PDF unlock may require re-save):", e);
        }
      }
      const execAmount = amountPaid != null ? amountPaid : 999;
      const suToAdd = getSuFromAmount(execAmount);
      if (suToAdd > 0) {
        try {
          await addRefillCredits(userId, execAmount);
        } catch (e) {
          console.warn("[IntaSend Webhook] addRefillCredits failed:", e);
        }
      } else {
        try {
          await refreshCreditsAfterPayment(userId);
        } catch (e) {
          console.warn("[IntaSend Webhook] refreshCreditsAfterPayment failed:", e);
        }
      }
    }
  }

  if (tier !== "credits" && !isRefillTier) {
    try {
      await incrementPaidCount();
    } catch (e) {
      console.warn("[IntaSend Webhook] incrementPaidCount failed (payment still applied):", e);
    }
  }

  try {
    const toEmail = getPendingEmail(apiRef);
    const recipientName = getPendingName(apiRef) ?? "there";
    if (toEmail) {
      const result = await sendSuccessEmail(toEmail, recipientName);
      if (!result.ok) {
        console.warn("[IntaSend Webhook] Success email not sent:", result.error);
      }
    }
  } catch (err) {
    console.warn("[IntaSend Webhook] Success email error (payment already applied):", err);
  }

  return NextResponse.json({ message: "OK" }, { status: 200 });
}
