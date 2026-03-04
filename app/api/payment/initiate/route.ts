import { NextRequest, NextResponse } from "next/server";
import { setPaymentPending } from "@/lib/payment-store";
import { getUserIdFromRequest } from "@/lib/credits";

const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE = process.env.INTASEND_PUBLISHABLE_KEY;
const INTASEND_BASE = process.env.INTASEND_API_BASE || "https://api.intasend.com";

const TIER_AMOUNTS: Record<string, number> = {
  single: 19,
  career: 29,
  closer: 59,
  business: 99,
  all_access: 999,
  credits: 499,
  refill_minor: 299,    // 5 SUs
  refill_standard: 999, // 30 SUs (Best Value)
  refill_executive: 2499, // 100 SUs
};

export type PurchaseTier = "single" | "career" | "closer" | "business" | "all_access" | "credits" | "refill_minor" | "refill_standard" | "refill_executive";

function generateTxRef(): string {
  return `rs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function POST(request: NextRequest) {
  if (!INTASEND_SECRET) {
    return NextResponse.json(
      { error: "Payment is not configured. Set INTASEND_SECRET_KEY." },
      { status: 503 }
    );
  }

  const authUserId = await getUserIdFromRequest(request);
  if (!authUserId) {
    return NextResponse.json(
      { error: "Unauthorized. Sign in to start a payment." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { method, tier, email, name, phone } = body as {
      method: "card" | "mpesa";
      tier: PurchaseTier;
      email?: string;
      name?: string;
      phone?: string;
    };

    const amount = TIER_AMOUNTS[tier] ?? 19;
    const txRef = generateTxRef();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const redirectUrl = `${appUrl.replace(/\/$/, "")}?payment_ref=${encodeURIComponent(txRef)}`;

    setPaymentPending(txRef, tier, authUserId, email, name);

    if (method === "card") {
      if (!INTASEND_PUBLISHABLE) {
        return NextResponse.json(
          { error: "Card payment requires INTASEND_PUBLISHABLE_KEY." },
          { status: 503 }
        );
      }
      const [first = "Customer", ...rest] = (name || "Customer").trim().split(/\s+/);
      const last = rest.length > 0 ? rest.join(" ") : first;
      const res = await fetch(`${INTASEND_BASE}/api/v1/checkout/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTASEND_SECRET}`,
        },
        body: JSON.stringify({
          public_key: INTASEND_PUBLISHABLE,
          first_name: first,
          last_name: last,
          email: email || "customer@example.com",
          amount,
          currency: "USD",
          api_ref: txRef,
          redirect_url: redirectUrl,
          host: appUrl.replace(/\/$/, ""),
          method: "CARD-PAYMENT",
        }),
      });

      const data = await res.json();
      const url = data?.url ?? data?.invoice_url ?? data?.link;
      if (!url) {
        return NextResponse.json(
          { error: data?.detail || data?.message || "Failed to create checkout link" },
          { status: 400 }
        );
      }

      return NextResponse.json({
        method: "card",
        redirectUrl: url,
        transactionId: txRef,
      });
    }

    if (method === "mpesa") {
      const normalizedPhone = (phone || "").replace(/\D/g, "");
      const mpesaPhone = normalizedPhone.startsWith("254")
        ? normalizedPhone
        : `254${normalizedPhone.replace(/^0/, "")}`;

      const mpesaAmount =
        tier === "credits" ? 499
        : tier === "all_access" ? 999
        : tier === "refill_minor" ? 299
        : tier === "refill_standard" ? 999
        : tier === "refill_executive" ? 2499
        : amount;

      const res = await fetch(`${INTASEND_BASE}/api/v1/payment/mpesa-stk-push/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTASEND_SECRET}`,
        },
        body: JSON.stringify({
          amount: String(mpesaAmount),
          phone_number: mpesaPhone,
          api_ref: txRef,
        }),
      });

      const data = (await res.json()) as { detail?: string; message?: string; error?: string; [key: string]: unknown };
      if (!res.ok) {
        const raw = [data?.detail, data?.message, data?.error].find(Boolean);
        const msg = typeof raw === "string" ? raw : "Failed to initiate M-Pesa.";
        const lower = msg.toLowerCase();
        let userMessage = msg;
        if (lower.includes("invalid") && (lower.includes("phone") || lower.includes("number") || lower.includes("msisdn"))) {
          userMessage = "Invalid phone number. Use a valid M-Pesa number (e.g. 254712345678).";
        } else if (lower.includes("insufficient") || lower.includes("balance") || lower.includes("funds")) {
          userMessage = "Insufficient funds. Please ensure your M-Pesa balance covers the amount and try again.";
        }
        return NextResponse.json({ error: userMessage }, { status: 400 });
      }

      return NextResponse.json({
        method: "mpesa",
        transactionId: txRef,
        message: "Enter your M-Pesa PIN on your phone to complete payment.",
      });
    }

    return NextResponse.json({ error: "Invalid method. Use card or mpesa." }, { status: 400 });
  } catch (e) {
    console.error("Payment initiate error:", e);
    return NextResponse.json({ error: "Payment initiation failed." }, { status: 500 });
  }
}
