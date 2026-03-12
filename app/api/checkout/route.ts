import { NextRequest, NextResponse } from "next/server";
import { setPaymentPending, type PurchaseTier } from "@/lib/payment-store";
import { recordPaymentAttempt } from "@/lib/supabase";
import { getLivePrice } from "@/lib/pricing";
import { getUserIdFromRequest } from "@/lib/credits";
import { sanitizeShortField } from "@/lib/sanitize";
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
    const {
      method,
      phone,
      email,
      amount: bodyAmount,
      name,
      product,
      executivePrice,
    } = body as {
      method?: string;
      phone?: string;
      email?: string;
      amount?: number;
      name?: string;
      product?: string;
      /** User-chosen Executive Pass price: 999 (early bird) or 1499 (standard). */
      executivePrice?: number;
    };

    const ALLOWED_PRODUCTS = ["all_access", "credits", "surgical_refill"] as const;
    const productNorm = typeof product === "string" ? product.trim().toLowerCase() : undefined;
    if (productNorm != null && productNorm !== "" && !ALLOWED_PRODUCTS.includes(productNorm as typeof ALLOWED_PRODUCTS[number])) {
      return NextResponse.json(
        { error: "Invalid product. Use all_access, credits, or surgical_refill." },
        { status: 400 }
      );
    }

    const isSurgicalRefill = productNorm === "surgical_refill";
    const isCreditsOnly = productNorm === "credits";
    const live = await getLivePrice();
    const MAX_AMOUNT_KES = 500_000;
    const MIN_REFILL_KES = 100;

    let amount: number;
    let tier: PurchaseTier;
    if (isSurgicalRefill) {
      const raw = typeof bodyAmount === "number" && Number.isFinite(bodyAmount) ? bodyAmount : 500;
      amount = Math.min(MAX_AMOUNT_KES, Math.max(MIN_REFILL_KES, Math.round(Number(raw))));
      tier = "surgical_refill";
    } else if (isCreditsOnly) {
      amount = 499;
      tier = "credits";
    } else {
      // Executive Pass: allow user to choose 999 (early bird) or 1499 (standard)
      const chosen = typeof executivePrice === "number" && Number.isFinite(executivePrice) ? Math.round(executivePrice) : null;
      const earlyBirdPrice = 999;
      const standardPrice = 1499;
      if (chosen === earlyBirdPrice && (live.slotsRemaining ?? 0) > 0) {
        amount = earlyBirdPrice;
      } else if (chosen === standardPrice || chosen === earlyBirdPrice) {
        amount = standardPrice;
      } else {
        amount = Math.min(MAX_AMOUNT_KES, Math.max(1, Math.round(Number(live.price ?? 999))));
      }
      tier = "all_access";
    }

    const safeName = sanitizeShortField(name, 120);
    const safeEmail = typeof email === "string" ? sanitizeShortField(email, 254) : undefined;

    const m = (method || "").toUpperCase();
    if (m !== "MPESA" && m !== "CARD") {
      return NextResponse.json(
        { error: "Invalid method. Use MPESA or CARD." },
        { status: 400 }
      );
    }

    const txRef = generateTxRef();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const redirectUrl = `${appUrl.replace(/\/$/, "")}?payment_ref=${encodeURIComponent(txRef)}`;

    setPaymentPending(txRef, tier, authUserId, safeEmail || undefined, safeName || undefined);

    await recordPaymentAttempt(authUserId, {
      checkoutId: txRef,
      paymentMethod: m,
      paymentStatus: "pending",
    });

    if (m === "MPESA") {
      const raw = (phone || "").replace(/\D/g, "");
      const mpesaPhone = raw.startsWith("254")
        ? raw.slice(0, 12)
        : raw.startsWith("0")
          ? `254${raw.slice(1, 10)}`
          : `254${raw.slice(0, 9)}`;

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

      const invoiceId =
        (data?.invoice as { invoice_id?: string })?.invoice_id ??
        data?.invoice_id ??
        txRef;

      return NextResponse.json({
        method: "MPESA",
        invoice_id: invoiceId,
        transactionId: txRef,
        message: "Enter your M-Pesa PIN on your phone to complete payment.",
      });
    }

    if (m === "CARD") {
      if (!INTASEND_PUBLISHABLE) {
        return NextResponse.json(
          { error: "Card payment requires INTASEND_PUBLISHABLE_KEY." },
          { status: 503 }
        );
      }
      const [first = "Customer", ...rest] = (safeName || "Customer").trim().split(/\s+/);
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
          email: safeEmail || "customer@example.com",
          amount: Number(amount) || live.price,
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
          {
            error: data?.detail || data?.message || "Failed to create checkout link.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        method: "CARD",
        url,
        transactionId: txRef,
      });
    }

    return NextResponse.json({ error: "Invalid method." }, { status: 400 });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("Checkout error:", e);
    }
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
