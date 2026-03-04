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
 * Sets is_paid to true for a user. Use from payment webhook only (no user JWT in webhook).
 * RLS blocks anon updates by user_id; service role bypasses RLS so the webhook can update.
 */
export async function setUserPaidServer(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!userId?.trim()) return { ok: false, error: "Missing userId" };
  const supabase = await getServiceClient();
  if (!supabase) {
    console.warn("[supabase-server] SUPABASE_SERVICE_ROLE_KEY not set");
    return { ok: false, error: "Service role not configured" };
  }
  const { error } = await supabase
    .schema(schema)
    .from("user_assets")
    .update({ is_paid: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId.trim());
  if (error) {
    console.error("[supabase-server] setUserPaidServer error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
