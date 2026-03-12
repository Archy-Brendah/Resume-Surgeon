/**
 * Server-only Supabase operations that require service role (e.g. webhook updates).
 * Never expose this client to the browser. Use only in API routes and server code.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

async function getServiceClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
}

/**
 * Resolves user_id from checkout_id (api_ref) when in-memory payment store was lost (e.g. server restart).
 * Use from webhook so payment can still be applied if pending record is missing.
 */
export async function getUserIdByCheckoutId(apiRef: string): Promise<string | null> {
  if (!apiRef?.trim()) return null;
  try {
    const supabase = await getServiceClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .schema(schema)
      .from("user_assets")
      .select("user_id")
      .eq("checkout_id", apiRef.trim())
      .maybeSingle();
    if (error || !data?.user_id) return null;
    return (data as { user_id: string }).user_id;
  } catch {
    return null;
  }
}

/**
 * Sets is_paid, is_executive, and tier='executive' for a user (Executive Pass).
 * Use from payment webhook only when 999 or 1499 KSH pass is purchased.
 */
export async function setUserPaidServer(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!userId?.trim()) return { ok: false, error: "Missing userId" };
  const supabase = await getServiceClient();
  if (!supabase) {
    console.warn("[supabase-server] SUPABASE_SERVICE_ROLE_KEY not set");
    return { ok: false, error: "Service role not configured" };
  }
  const updates: Record<string, unknown> = {
    is_paid: true,
    is_executive: true,
    tier: "executive",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .schema(schema)
    .from("user_assets")
    .update(updates)
    .eq("user_id", userId.trim());
  if (error) {
    console.error("[supabase-server] setUserPaidServer error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Logs a payment to refill_history (Executive Pass or top-up). Call from webhook after applying credits.
 */
export async function logRefillHistory(
  userId: string,
  amountKes: number,
  creditsAdded: number,
  refillType: "executive" | "topup",
  checkoutId?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!userId?.trim()) return { ok: false, error: "Missing userId" };
  const supabase = await getServiceClient();
  if (!supabase) return { ok: false, error: "Service role not configured" };
  const { error } = await supabase.schema(schema).from("refill_history").insert({
    user_id: userId.trim(),
    amount_kes: amountKes,
    credits_added: creditsAdded,
    refill_type: refillType,
    checkout_id: checkoutId ?? null,
  });
  if (error) {
    console.error("[supabase-server] logRefillHistory error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Variable-amount Surgical Unit top-up (Refill Balance). Calls handle_surgical_topup RPC.
 * Use from IntaSend webhook when tier === "surgical_refill".
 */
export async function handleSurgicalTopup(
  userId: string,
  amountKes: number
): Promise<{ ok: boolean; newBalance?: number; error?: string }> {
  if (!userId?.trim() || amountKes == null || amountKes <= 0) {
    return { ok: false, error: "Invalid user or amount" };
  }
  const supabase = await getServiceClient();
  if (!supabase) return { ok: false, error: "Service role not configured" };
  const { data, error } = await supabase.schema(schema).rpc("handle_surgical_topup", {
    p_user_id: userId.trim(),
    p_amount_kes: Math.round(Number(amountKes)),
  });
  if (error) {
    console.error("[supabase-server] handle_surgical_topup error:", error);
    return { ok: false, error: error.message };
  }
  const newBalance = typeof data === "number" ? data : undefined;
  return { ok: true, newBalance };
}
