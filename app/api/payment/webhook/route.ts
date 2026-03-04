import { NextRequest, NextResponse } from "next/server";
import {
  getPendingTier,
  getPendingUserId,
  getPendingEmail,
  getPendingName,
  setPaymentVerified,
} from "@/lib/payment-store";
import type { PurchaseTier } from "@/lib/payment-store";
import { updatePaymentStatus } from "@/lib/supabase";
import { sendSuccessEmail } from "@/lib/success-email";
import { incrementPaidCount } from "@/lib/pricing";
import { refreshCreditsAfterPayment } from "@/lib/credits";

const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;
const WEBHOOK_SECRET = process.env.INTASEND_WEBHOOK_SECRET;

function isCardPayment(payload: { provider?: string; payment_method?: string; invoice?: { provider?: string } }): boolean {
  const provider = payload?.provider ?? payload?.invoice?.provider ?? "";
  const method = (payload?.payment_method ?? "").toLowerCase();
  return provider === "CARD-PAYMENT" || method === "card";
}

export async function POST(request: NextRequest) {
  if (!INTASEND_SECRET) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  if (WEBHOOK_SECRET) {
    const sentSecret = request.headers.get("x-intasend-signature") ?? request.headers.get("authorization");
    const expected = sentSecret?.replace(/^Bearer\s+/i, "").trim();
    if (expected !== WEBHOOK_SECRET) {
      return NextResponse.json({ message: "Invalid webhook secret" }, { status: 401 });
    }
  }

  const rawBody = await request.text();
  let payload: {
    state?: string;
    api_ref?: string;
    invoice_id?: string;
    provider?: string;
    payment_method?: string;
    invoice?: { state?: string; api_ref?: string; provider?: string };
    [key: string]: unknown;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const state = payload?.state ?? payload?.invoice?.state;
  const apiRef = (payload?.api_ref ?? payload?.invoice?.api_ref) as string | undefined;

  if (state !== "COMPLETE" || !apiRef) {
    return NextResponse.json({ message: "Ignored" }, { status: 200 });
  }

  const tier = getPendingTier(apiRef);
  if (tier) {
    setPaymentVerified(apiRef, tier as PurchaseTier);
  }

  const userId = getPendingUserId(apiRef);
  const tier = getPendingTier(apiRef);
  if (userId) {
    if (tier !== "credits") {
      await updatePaymentStatus(userId, {
        checkoutId: apiRef,
        receipt: typeof payload?.invoice_id === "string" ? payload.invoice_id : undefined,
        status: "completed",
      });
    }
    try {
      await refreshCreditsAfterPayment(userId);
    } catch (e) {
      console.warn("[Webhook] refreshCreditsAfterPayment failed:", e);
    }
  }

  if (tier !== "credits") {
    try {
      await incrementPaidCount();
    } catch (e) {
      console.warn("[Webhook] incrementPaidCount failed (payment already applied):", e);
    }
  }

  // Divine Success Email: send after payment is verified. Do not block or fail the webhook if email fails.
  try {
    const toEmail = getPendingEmail(apiRef);
    const recipientName = getPendingName(apiRef) ?? "there";
    if (toEmail) {
      const result = await sendSuccessEmail(toEmail, recipientName);
      if (!result.ok) {
        console.warn("[Webhook] Success email not sent:", result.error);
      }
    }
  } catch (err) {
    console.warn("[Webhook] Success email error (payment already applied):", err);
  }

  return NextResponse.json({ message: "OK" }, { status: 200 });
}
