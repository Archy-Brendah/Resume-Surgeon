/**
 * Syncs is_paid from user_assets to public_profiles so the live portfolio view
 * (/view/[username]) immediately shows "Download Official PDF" as available.
 * Call from payment webhook after setting is_paid in user_assets.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

export async function syncPublicProfileIsPaid(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!userId || !supabaseUrl || !supabaseServiceKey) {
    return { ok: false, error: "Missing userId or service role" };
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { error } = await supabase
      .schema(schema)
      .from("public_profiles")
      .update({ is_paid: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) {
      console.warn("[sync-public-profile-paid] update error (user may not have a public profile yet):", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[sync-public-profile-paid] exception:", e);
    return { ok: false, error: String(e) };
  }
}
