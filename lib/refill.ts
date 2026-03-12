/**
 * Unified KES→credits mapping for all payments (initial pass + top-ups).
 *
 * Credits here are "Surgical Units" (ai_credits) in resume_surgeon.user_assets.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

// Configuration: Mapping KSH to Credit Values
export const CREDIT_MAPPING = {
  // Initial One-Time Full Access
  INITIAL_EARLY_BIRD: { price: 999, credits: 5000 }, // KSH 999
  INITIAL_STANDARD: { price: 1499, credits: 5000 }, // KSH 1499

  // Top-ups
  TOPUP_SMALL: { price: 299, credits: 1000 },
  TOPUP_MEDIUM: { price: 999, credits: 4000 },
  TOPUP_LARGE: { price: 2499, credits: 12000 },
} as const;

export type RefillTier = "refill_minor" | "refill_standard" | "refill_executive";

export const REFILL_TIERS: Record<RefillTier, { amount: number; su: number; label: string }> = {
  refill_minor: {
    amount: CREDIT_MAPPING.TOPUP_SMALL.price,
    su: CREDIT_MAPPING.TOPUP_SMALL.credits,
    label: "Just this task (1,000 SUs)",
  },
  refill_standard: {
    amount: CREDIT_MAPPING.TOPUP_MEDIUM.price,
    su: CREDIT_MAPPING.TOPUP_MEDIUM.credits,
    label: "Starter Pack (4,000 SUs)",
  },
  refill_executive: {
    amount: CREDIT_MAPPING.TOPUP_LARGE.price,
    su: CREDIT_MAPPING.TOPUP_LARGE.credits,
    label: "Executive Pack (12,000 SUs)",
  },
};

/**
 * Calculates how many credits to award after a successful payment.
 * @param paidAmount Amount received via M-Pesa/Card (KES)
 * @param currentPaidCount Total users who have paid so far (current_paid_count)
 * @param userLimit From pricing_config.user_limit; if omitted, 100 is used
 */
export function calculateCreditsToAward(
  paidAmount: number,
  currentPaidCount: number,
  userLimit: number = 100
): number {
  const rounded = Math.round(Number(paidAmount));

  // Executive Pass: 999 when current_paid_count < user_limit, else 1499
  if (currentPaidCount < userLimit && rounded === CREDIT_MAPPING.INITIAL_EARLY_BIRD.price) {
    return CREDIT_MAPPING.INITIAL_EARLY_BIRD.credits;
  }

  if (currentPaidCount >= userLimit && rounded === CREDIT_MAPPING.INITIAL_STANDARD.price) {
    return CREDIT_MAPPING.INITIAL_STANDARD.credits;
  }

  // Top-ups
  if (rounded === CREDIT_MAPPING.TOPUP_SMALL.price) return CREDIT_MAPPING.TOPUP_SMALL.credits;
  if (rounded === CREDIT_MAPPING.TOPUP_MEDIUM.price) return CREDIT_MAPPING.TOPUP_MEDIUM.credits;
  if (rounded === CREDIT_MAPPING.TOPUP_LARGE.price) return CREDIT_MAPPING.TOPUP_LARGE.credits;

  return 0; // Unknown payment amount
}

/**
 * Add credits to user and increment total_credits_purchased.
 * Uses atomic Postgres RPC add_su_balance(user_id, amount) to prevent race conditions.
 * Requires migration 20250315000000_resume_surgeon_is_executive_and_add_su_balance.sql.
 */
export async function addCreditsForPayment(
  userId: string,
  paidAmount: number,
  currentPaidCount: number,
  userLimit: number = 100
): Promise<{ ok: boolean; creditsAdded: number; error?: string }> {
  const creditsToAdd = calculateCreditsToAward(paidAmount, currentPaidCount, userLimit);
  if (creditsToAdd <= 0) {
    return { ok: false, creditsAdded: 0, error: "Unknown payment amount" };
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[refill] SUPABASE_SERVICE_ROLE_KEY not set.");
    return { ok: false, creditsAdded: 0, error: "Service role not configured" };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { data: newBalance, error: rpcErr } = await supabase
      .schema(schema)
      .rpc("add_su_balance", { p_user_id: userId, p_amount: creditsToAdd });
    if (rpcErr) {
      console.error("[refill] add_su_balance RPC error:", rpcErr);
      return { ok: false, creditsAdded: 0, error: rpcErr.message };
    }
    if (typeof newBalance === "number" && newBalance < 0) {
      return { ok: false, creditsAdded: 0, error: "User not found or invalid amount" };
    }
    return { ok: true, creditsAdded: creditsToAdd };
  } catch (e) {
    console.error("[refill] addCreditsForPayment exception:", e);
    return { ok: false, creditsAdded: 0, error: String(e) };
  }
}
