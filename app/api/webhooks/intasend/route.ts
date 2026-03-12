import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

import {
  getPendingTier,
  getPendingUserId,
  getPendingEmail,
  getPendingName,
  setPaymentVerified,
} from "@/lib/payment-store";
import type { PurchaseTier } from "@/lib/payment-store";
import { setUserPaidServer, getUserIdByCheckoutId, logRefillHistory, handleSurgicalTopup } from "@/lib/supabase-server";
import { sendSuccessEmail } from "@/lib/success-email";
import { incrementPaidCount, getLivePrice } from "@/lib/pricing";
import { addCreditsForPayment, calculateCreditsToAward, CREDIT_MAPPING } from "@/lib/refill";
import { computeSuFromKsh } from "@/lib/surgical-refill-calc";
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
  const rawBody = await request.text();
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  /** IntaSend webhook verification: when challenge is present, return it immediately (before signature check). */
  const challenge = payload?.challenge;
  if (challenge != null && typeof challenge === "string") {
    return NextResponse.json({ challenge: challenge.trim() });
  }

  if (!INTASEND_SECRET) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { message: "Webhook signature not configured. Set INTASEND_WEBHOOK_SECRET in production." },
        { status: 503 }
      );
    }
    console.warn("[IntaSend Webhook] INTASEND_WEBHOOK_SECRET is not set. Set it in production to verify webhook authenticity.");
  } else {
    const sentHeader = request.headers.get("x-intasend-signature") ?? request.headers.get("authorization");
    const received = sentHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
    if (!received || received !== WEBHOOK_SECRET) {
      return NextResponse.json({ message: "Invalid or missing webhook signature" }, { status: 401 });
    }
  }

  if (WEBHOOK_IP_ALLOWLIST.length > 0) {
    const forwarded = request.headers.get("x-forwarded-for");
    const clientIp = (forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "").trim();
    if (!clientIp || !WEBHOOK_IP_ALLOWLIST.includes(clientIp)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
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

  const MIN_REFILL_KES = 100;
  const MAX_REFILL_KES = 500_000;

  if (userId && amountPaid != null) {
    const rounded = Math.round(Number(amountPaid));
    if (!Number.isFinite(rounded) || rounded < 0) {
      return NextResponse.json({ message: "Invalid amount" }, { status: 200 });
    }

    // Variable-amount Refill Balance (surgical_refill): use handle_surgical_topup
    if (tier === "surgical_refill") {
      if (rounded < MIN_REFILL_KES || rounded > MAX_REFILL_KES) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[IntaSend Webhook] surgical_refill amount out of range:", rounded);
        }
        return NextResponse.json({ message: "Amount out of range" }, { status: 200 });
      }
      try {
        await handleSurgicalTopup(userId, rounded);
        const creditsAdded = computeSuFromKsh(rounded);
        await logRefillHistory(userId, rounded, creditsAdded, "topup", apiRef);
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[IntaSend Webhook] handleSurgicalTopup failed:", e);
        }
      }
    } else {
      const livePricing = await getLivePrice();
      const currentPaidCount = livePricing.currentPaidCount;
      const userLimit = livePricing.userLimit;

      // Executive Pass: 999 when current_paid_count < user_limit, else 1499
      const isInitialEarlyBird = currentPaidCount < userLimit && rounded === CREDIT_MAPPING.INITIAL_EARLY_BIRD.price;
      const isInitialStandard = currentPaidCount >= userLimit && rounded === CREDIT_MAPPING.INITIAL_STANDARD.price;
      const isInitialFullAccess = isInitialEarlyBird || isInitialStandard;

      const creditsToAward = calculateCreditsToAward(amountPaid, currentPaidCount, userLimit);
      if (creditsToAward > 0) {
        try {
          await addCreditsForPayment(userId, amountPaid, currentPaidCount, userLimit);
          await logRefillHistory(
            userId,
            rounded,
            creditsToAward,
            isInitialFullAccess ? "executive" : "topup",
            apiRef
          );
        } catch (e) {
          console.warn("[IntaSend Webhook] addCreditsForPayment failed:", e);
        }
      }

      if (isInitialFullAccess && tier !== "credits") {
      const paidResult = await setUserPaidServer(userId);
      if (!paidResult.ok) {
        console.warn("[IntaSend Webhook] setUserPaidServer failed:", paidResult.error);
      }
      try {
        await syncPublicProfileIsPaid(userId);
      } catch (e) {
        console.warn("[IntaSend Webhook] syncPublicProfileIsPaid failed (portfolio PDF unlock may require re-save):", e);
      }
      try {
        await incrementPaidCount();
      } catch (e) {
        console.warn("[IntaSend Webhook] incrementPaidCount failed (payment still applied):", e);
      }
    }
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
