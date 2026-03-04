import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

const CONFIG_ID = "default";

export type LivePriceResult = {
  price: number;
  isEarlyBird: boolean;
  slotsRemaining: number;
  userLimit: number;
  standardPrice: number;
  earlyBirdPrice: number;
  currentPaidCount: number;
};

/**
 * Fetches live price from resume_surgeon.pricing_config.
 * If current_paid_count < user_limit → early_bird_price (e.g. 999),
 * otherwise → standard_price (e.g. 2500).
 * You can change user_limit, early_bird_price, standard_price in Supabase Dashboard.
 */
export async function getLivePrice(): Promise<LivePriceResult> {
  const fallback: LivePriceResult = {
    price: 999,
    isEarlyBird: true,
    slotsRemaining: 100,
    userLimit: 100,
    standardPrice: 2500,
    earlyBirdPrice: 999,
    currentPaidCount: 0,
  };

  if (!supabaseUrl || !supabaseAnonKey) {
    return fallback;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase
      .schema(schema)
      .from("pricing_config")
      .select("user_limit, current_paid_count, early_bird_price, standard_price")
      .eq("id", CONFIG_ID)
      .maybeSingle();

    if (error || !data) {
      return fallback;
    }

    const userLimit = Number(data.user_limit) || 100;
    const currentPaidCount = Number(data.current_paid_count) || 0;
    const earlyBirdPrice = Number(data.early_bird_price) ?? 999;
    const standardPrice = Number(data.standard_price) ?? 2500;

    const isEarlyBird = currentPaidCount < userLimit;
    const price = isEarlyBird ? earlyBirdPrice : standardPrice;
    const slotsRemaining = Math.max(0, userLimit - currentPaidCount);

    return {
      price,
      isEarlyBird,
      slotsRemaining,
      userLimit,
      standardPrice,
      earlyBirdPrice,
      currentPaidCount,
    };
  } catch {
    return fallback;
  }
}

/**
 * Increments current_paid_count in pricing_config. Call from payment webhook after a successful payment.
 * Uses SUPABASE_SERVICE_ROLE_KEY to call the RPC (anon cannot update the table).
 */
export async function incrementPaidCount(): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[pricing] SUPABASE_SERVICE_ROLE_KEY not set; skipping increment of current_paid_count.");
    return { ok: false, error: "Service role not configured" };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { error } = await supabase.schema(schema).rpc("increment_pricing_paid_count");
    if (error) {
      console.error("[pricing] incrementPaidCount error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error("[pricing] incrementPaidCount exception:", e);
    return { ok: false };
  }
}
