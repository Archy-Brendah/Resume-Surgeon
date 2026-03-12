import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Supabase client for browser. Uses cookies so the server can read the session.
 * Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel env vars.
 */
export const supabase: SupabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);

/** Global db_schema for Resume Surgeon — all app data uses this schema. */
export const db_schema = "resume_surgeon" as const;

export const DB_SCHEMA = db_schema;

/** Client scoped to the resume_surgeon schema (use this for all app table access). */
export function resumeSurgeonDb() {
  return supabase.schema(db_schema);
}

export type ProfileStatus = {
  is_paid: boolean;
  tier: string | null;
  ai_credits: number;
  /** Total Surgical Units ever purchased by this user (from payments). */
  total_credits_purchased?: number;
  /** When true, user has unlimited SU and bypasses credit modals (beta/admin). */
  is_beta_tester?: boolean;
};

/**
 * Fetches the current user's payment, tier, and ai_credits from resume_surgeon.user_assets.
 * RLS ensures only the owning user can read their row.
 */
export async function getProfileStatus(userId: string): Promise<ProfileStatus> {
  const { data, error } = await resumeSurgeonDb()
    .from("user_assets")
    .select("is_paid, tier, ai_credits, total_credits_purchased, is_beta_tester")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfileStatus error:", error);
    return { is_paid: false, tier: "free", ai_credits: 0, total_credits_purchased: 0, is_beta_tester: false };
  }

  if (!data) {
    return { is_paid: false, tier: "free", ai_credits: 0, total_credits_purchased: 0, is_beta_tester: false };
  }

  const ai_credits =
    typeof (data as { ai_credits?: unknown }).ai_credits === "number"
      ? Math.max(0, (data as { ai_credits: number }).ai_credits)
      : 0;

  const total_credits_purchased_raw = (data as { total_credits_purchased?: unknown }).total_credits_purchased;
  const total_credits_purchased =
    typeof total_credits_purchased_raw === "number"
      ? Math.max(0, total_credits_purchased_raw)
      : 0;

  const is_beta_tester = Boolean((data as { is_beta_tester?: unknown }).is_beta_tester);

  return {
    is_paid: Boolean(data.is_paid),
    tier: data.tier ?? "free",
    ai_credits,
    total_credits_purchased,
    is_beta_tester,
  };
}

/**
 * Creates a default 'free' row in resume_surgeon.user_assets for the user if one doesn't exist.
 * Safe to call on every login; RLS ensures users can only insert for themselves (via auth).
 */
export async function initializeUserAsset(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await resumeSurgeonDb()
    .from("user_assets")
    .upsert(
      { user_id: userId, is_paid: false, tier: "free" },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

  if (error) {
    console.error("initializeUserAsset error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type PaymentStatusPayload = {
  checkoutId?: string;
  receipt?: string;
  status: string;
};

const SUCCESS_STATUSES = ["completed", "success", "successful", "paid"];

/**
 * Records a transaction attempt in resume_surgeon.user_assets.
 * Requires user_assets to have columns: checkout_id, payment_method, payment_status.
 * Call when initiating checkout so we can track pending payments.
 * If the columns are missing, the update is skipped and we log (checkout still proceeds).
 */
export async function recordPaymentAttempt(
  userId: string,
  params: { checkoutId: string; paymentMethod: string; paymentStatus: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await resumeSurgeonDb()
      .from("user_assets")
      .update({
        checkout_id: params.checkoutId,
        payment_method: params.paymentMethod,
        payment_status: params.paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      console.warn("recordPaymentAttempt (add checkout_id, payment_method, payment_status to user_assets if needed):", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn("recordPaymentAttempt error:", e);
    return { ok: false };
  }
}

/**
 * Sets is_paid to true in resume_surgeon.user_assets when a payment is confirmed.
 * Call from your payment webhook after resolving userId from checkoutId/metadata.
 * RLS ensures only the owning user's row can be updated.
 */
export async function updatePaymentStatus(
  userId: string,
  payload: PaymentStatusPayload
): Promise<{ ok: boolean; error?: string }> {
  const isSuccess = SUCCESS_STATUSES.includes((payload.status || "").toLowerCase());
  if (!isSuccess) {
    return { ok: true };
  }

  const { error } = await resumeSurgeonDb()
    .from("user_assets")
    .update({ is_paid: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    console.error("updatePaymentStatus error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
