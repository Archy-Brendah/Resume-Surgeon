import { NextRequest, NextResponse } from "next/server";
import { setPaymentPending } from "@/lib/payment-store";
import { getUserIdFromRequest } from "@/lib/credits";
import { getLivePrice } from "@/lib/pricing";
import { recordPaymentAttempt } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE = process.env.INTASEND_PUBLISHABLE_KEY;
const INTASEND_BASE = process.env.INTASEND_API_BASE || "https://api.intasend.com";

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

  if (!checkRateLimit(authUserId, "checkout", 10)) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { method, tier, email, name, phone } = body as {
      method?: string;
      tier?: string;
      email?: string;
      name?: string;
      phone?: string;
    };

    if (tier !== "all_access") {
      return NextResponse.json(
        { error: "Use /api/checkout for payments. Only Executive Pass (all_access) is supported here." },
        { status: 400 }
      );
    }

    const live = await getLivePrice();
    const amount = Math.max(1, Math.round(Number(live?.price ?? 999)));
    const txRef = generateTxRef();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const redirectUrl = `${appUrl.replace(/\/$/, "")}?payment_ref=${encodeURIComponent(txRef)}`;

    setPaymentPending(txRef, "all_access", authUserId, email, name);
    const m = (method || "").toLowerCase();
    await recordPaymentAttempt(authUserId, {
      checkoutId: txRef,
      paymentMethod: m === "mpesa" ? "MPESA" : "CARD",
      paymentStatus: "pending",
    });

    if (m === "card") {
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
          currency: "KES",
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

    if (m === "mpesa") {
      const normalizedPhone = (phone || "").replace(/\D/g, "");
      const mpesaPhone = normalizedPhone.startsWith("254")
        ? normalizedPhone.slice(0, 12)
        : `254${normalizedPhone.replace(/^0/, "").slice(0, 9)}`;

      if (mpesaPhone.length < 12) {
        return NextResponse.json(
          { error: "Valid M-Pesa phone required (e.g. 254712345678)." },
          { status: 400 }
        );
      }

      const res = await fetch(`${INTASEND_BASE}/api/v1/payment/mpesa-stk-push/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTASEND_SECRET}`,
        },
        body: JSON.stringify({
          amount: String(amount),
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
    if (process.env.NODE_ENV === "development") {
      console.error("Payment initiate error:", e);
    }
    return NextResponse.json({ error: "Payment initiation failed." }, { status: 500 });
  }
}
