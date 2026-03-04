/**
 * Surgical Refill: map payment amount (KES) to SUs to add, and persist to DB.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

/** Amount paid (KES) → SUs to add. */
export const REFILL_AMOUNT_TO_SU: Record<number, number> = {
  299: 5,   // Minor Surgery
  999: 30,  // Standard Operation / Executive Pass early bird
  1499: 30, // Executive Pass standard price
  2499: 100, // Executive Overhaul
};

export type RefillTier = "refill_minor" | "refill_standard" | "refill_executive";

export const REFILL_TIERS: Record<RefillTier, { amount: number; su: number; label: string }> = {
  refill_minor: { amount: 299, su: 5, label: "Minor Surgery (5 SUs)" },
  refill_standard: { amount: 999, su: 30, label: "Standard Operation (30 SUs)" },
  refill_executive: { amount: 2499, su: 100, label: "Executive Overhaul (100 SUs)" },
};

/**
 * Resolve amount_paid (number, possibly from webhook) to SUs to add.
 * Handles 299, 999, 2499 (and rounded float variants).
 */
export function getSuFromAmount(amountPaid: number): number {
  const rounded = Math.round(Number(amountPaid));
  return REFILL_AMOUNT_TO_SU[rounded] ?? 0;
}

/**
 * Add SUs to user and increment total_credits_purchased. Call from webhook when refill payment clears.
 */
export async function addRefillCredits(
  userId: string,
  amountPaid: number
): Promise<{ ok: boolean; suAdded: number; error?: string }> {
  const suToAdd = getSuFromAmount(amountPaid);
  if (suToAdd <= 0) {
    return { ok: false, suAdded: 0, error: "Unknown refill amount" };
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[refill] SUPABASE_SERVICE_ROLE_KEY not set.");
    return { ok: false, suAdded: 0, error: "Service role not configured" };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { data: row, error: fetchErr } = await supabase
      .schema(schema)
      .from("user_assets")
      .select("ai_credits, total_credits_purchased")
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr || !row) {
      console.error("[refill] fetch error:", fetchErr);
      return { ok: false, suAdded: 0, error: fetchErr?.message ?? "User not found" };
    }
    const currentCredits = typeof (row as { ai_credits?: number }).ai_credits === "number" ? (row as { ai_credits: number }).ai_credits : 0;
    const currentTotal = typeof (row as { total_credits_purchased?: number }).total_credits_purchased === "number" ? (row as { total_credits_purchased: number }).total_credits_purchased : 0;
    const { error: updateErr } = await supabase
      .schema(schema)
      .from("user_assets")
      .update({
        ai_credits: currentCredits + suToAdd,
        total_credits_purchased: currentTotal + suToAdd,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (updateErr) {
      console.error("[refill] addRefillCredits error:", updateErr);
      return { ok: false, suAdded: 0, error: updateErr.message };
    }
    return { ok: true, suAdded: suToAdd };
  } catch (e) {
    console.error("[refill] addRefillCredits exception:", e);
    return { ok: false, suAdded: 0, error: String(e) };
  }
}
