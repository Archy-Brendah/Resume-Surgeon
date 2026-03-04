import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = "resume_surgeon";

import { getCost as getSuCost, type SurgicalUnitAction } from "./su-costs";

const CREDITS_REFILL = 30;

export type { SurgicalUnitAction };
export { getCost } from "./su-costs";

export function useUnits(action: SurgicalUnitAction): number {
  return getSuCost(action);
}

/**
 * Credit Guard: ai_credits are NEVER trusted from the frontend.
 * All AI routes MUST use getCreditsFromRequest/requireUnits which read and deduct
 * directly from Supabase (resume_surgeon.user_assets). No client-supplied credit value is used.
 */

/**
 * Returns the current user's id from the request (Authorization Bearer token). Use for rate limiting.
 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error || !user ? null : user.id;
}

/**
 * Gets the current user and their ai_credits from the request (Authorization Bearer token).
 * Always reads from DB; never trusts client. Returns { userId, credits } or { userId: null, credits: 0 } if unauthenticated.
 */
export async function getCreditsFromRequest(request: Request): Promise<{ userId: string | null; credits: number }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return { userId: null, credits: 0 };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return { userId: null, credits: 0 };

  const { data, error } = await supabase.schema(schema).from("user_assets").select("ai_credits").eq("user_id", user.id).maybeSingle();
  if (error || data == null) return { userId: user.id, credits: 0 };
  const credits = typeof data.ai_credits === "number" ? Math.max(0, data.ai_credits) : 0;
  return { userId: user.id, credits };
}

/**
 * Deducts amount (SU) for the user identified by the request token.
 * Uses the RPC deduct_ai_credits(amount). Deduction happens in DB before AI runs (prevents double-click).
 * Returns the new balance, or -1 if insufficient / not allowed.
 */
export async function deductUnitsFromRequest(request: Request, amount: number): Promise<{ ok: boolean; creditsRemaining: number }> {
  if (amount <= 0) return { ok: false, creditsRemaining: -1 };
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return { ok: false, creditsRemaining: -1 };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.schema(schema).rpc("deduct_ai_credits", { amount });
  if (error) {
    return { ok: false, creditsRemaining: -1 };
  }
  const remaining = typeof data === "number" ? data : -1;
  return { ok: remaining >= 0, creditsRemaining: remaining };
}

const REFILL_PAYLOAD = {
  error: "Refill required",
  code: "CREDITS_REQUIRED" as const,
  message: "Insufficient Surgical Units. Top up your pass to continue the operation.",
};

/**
 * Global SU consumption: check ai_credits >= cost, deduct in DB, then proceed.
 * If credits < cost, returns 402 and Refill Modal should be shown on the client.
 * Use in API routes: if unitResponse is set, return it; else creditsRemaining is set and you may proceed.
 */
export async function consumeUnits(request: Request, cost: number): Promise<
  { unitResponse: NextResponse; creditsRemaining?: number } | { unitResponse?: never; creditsRemaining: number }
> {
  if (cost <= 0) return { creditsRemaining: 0 };
  const { userId, credits } = await getCreditsFromRequest(request);
  if (!userId) {
    return { unitResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (credits < cost) {
    return { unitResponse: NextResponse.json(REFILL_PAYLOAD, { status: 402 }) };
  }
  const { ok, creditsRemaining } = await deductUnitsFromRequest(request, cost);
  if (!ok || creditsRemaining < 0) {
    return { unitResponse: NextResponse.json(REFILL_PAYLOAD, { status: 402 }) };
  }
  return { creditsRemaining };
}

/**
 * Central SU check by action: uses SU cost menu (Sharpen 1, Match 2, High-Level 5).
 * Deduction happens *before* the AI call to prevent double-click bugs.
 */
export async function requireUnits(request: Request, action: SurgicalUnitAction): Promise<
  { unitResponse: NextResponse; creditsRemaining?: number } | { unitResponse?: never; creditsRemaining: number }
> {
  const cost = getSuCost(action);
  return consumeUnits(request, cost);
}

/**
 * Deducts one credit (legacy). Prefer requireUnits(request, action) for variable SU costs.
 * @deprecated Use requireUnits(req, 'SHARPEN') etc. instead.
 */
export async function deductCreditFromRequest(request: Request): Promise<{ ok: boolean; creditsRemaining: number }> {
  return deductUnitsFromRequest(request, 1);
}

/** Use in API routes: if creditResponse is set, return it; otherwise creditsRemaining is set. Wrapper for requireUnits(req, 'SHARPEN'). */
export async function requireCredits(request: Request): Promise<
  { creditResponse: NextResponse; creditsRemaining?: number } | { creditResponse?: never; creditsRemaining: number }
> {
  const result = await requireUnits(request, "SHARPEN");
  if ("unitResponse" in result) return { creditResponse: result.unitResponse };
  return { creditsRemaining: result.creditsRemaining };
}

/**
 * Refunds SUs to the user after an AI call fails (e.g. provider error).
 * Uses the request's JWT to call add_ai_credits(amount). Call in catch blocks after deducting.
 */
export async function refundUnits(request: Request, amount: number): Promise<{ ok: boolean }> {
  if (amount <= 0) return { ok: true };
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) return { ok: false };
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { error } = await supabase.schema(schema).rpc("add_ai_credits", { amount });
  if (error) {
    console.warn("[credits] refundUnits failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Sets ai_credits to 30 for the given user. Call from webhook after payment confirmation.
 * Uses service role so it works from the webhook (no user JWT).
 */
export async function refreshCreditsAfterPayment(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[credits] SUPABASE_SERVICE_ROLE_KEY not set; skipping ai_credits refresh.");
    return { ok: false, error: "Service role not configured" };
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { error } = await supabase.schema(schema).from("user_assets").update({ ai_credits: CREDITS_REFILL, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) {
      console.error("[credits] refreshCreditsAfterPayment error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error("[credits] refreshCreditsAfterPayment exception:", e);
    return { ok: false };
  }
}
