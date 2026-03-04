/**
 * Webhook idempotency: prevent double-crediting when IntaSend sends payment.cleared twice.
 * Uses resume_surgeon.processed_webhook_events with api_ref (checkout_id) as unique key.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

/**
 * Tries to claim this webhook as processed. Returns true if first time (proceed with logic),
 * false if already processed (skip and return 200).
 */
export async function claimWebhookIdempotency(idempotencyKey: string): Promise<boolean> {
  if (!idempotencyKey?.trim() || !supabaseUrl || !supabaseServiceKey) {
    return true; // no key or no DB: allow through (no double-credit risk from our side)
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { error } = await supabase
      .schema(schema)
      .from("processed_webhook_events")
      .insert({ idempotency_key: idempotencyKey.trim() });

    if (error) {
      if (error.code === "23505") {
        return false; // unique violation = already processed
      }
      console.warn("[webhook-idempotency] insert error:", error.message);
      return true; // other error: allow through to avoid blocking valid webhooks
    }
    return true;
  } catch (e) {
    console.warn("[webhook-idempotency] exception:", e);
    return true;
  }
}
