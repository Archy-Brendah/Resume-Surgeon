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

  const { data, error } = await supabase.schema(schema).from("user_assets").select("ai_credits, is_beta_tester").eq("user_id", user.id).maybeSingle();
  if (error || data == null) return { userId: user.id, credits: 0 };
  const isBetaTester = Boolean((data as { is_beta_tester?: unknown }).is_beta_tester);
  if (isBetaTester) return { userId: user.id, credits: 999_999 };
  const credits = typeof data.ai_credits === "number" ? Math.max(0, data.ai_credits) : 0;
  return { userId: user.id, credits };
}

/**
 * Deducts amount (SU) for the user identified by the request token.
 * Uses the RPC deduct_ai_credits(amount). Deduction happens in DB before AI runs (prevents double-click).
 * Returns the new balance, or -1 if insufficient / not allowed.
 * Beta testers (is_beta_tester) bypass deduction and always get ok: true (so Recruiter's Eye etc. work).
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
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return { ok: false, creditsRemaining: -1 };

  const { data: asset } = await supabase
    .schema(schema)
    .from("user_assets")
    .select("is_beta_tester")
    .eq("user_id", user.id)
    .maybeSingle();
  const isBetaTester = Boolean((asset as { is_beta_tester?: boolean } | null)?.is_beta_tester);
  if (isBetaTester) return { ok: true, creditsRemaining: 999_999 };

  const { data, error } = await supabase.schema(schema).rpc("deduct_ai_credits", { amount });
  if (error) {
    return { ok: false, creditsRemaining: -1 };
  }
  const remaining = typeof data === "number" ? data : -1;
  return { ok: remaining >= 0, creditsRemaining: remaining };
}

/** Message returned when Gemini 429 (rate limit) — refund and show this. */
export const GEMINI_RATE_LIMIT_MESSAGE = "Try again in 60s";

/** Returns true if the error is a Gemini (or generic) 429 / rate limit. Use to decide whether to refund and show "Try again in 60s". */
export function isGeminiRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
    if (status === 429) return true;
    const msg = String((err as { message?: string }).message ?? "").toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("resource_exhausted") || msg.includes("quota")) return true;
  }
  return false;
}

/**
 * Global Guard: read global_api_limits and current daily count. If daily count is at or near the limit, block the call.
 * Use before deduct_surgical_units and the AI call.
 */
export async function checkGlobalGuard(request: Request): Promise<{ allowed: boolean; message?: string }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return { allowed: true };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.schema(schema).rpc("get_global_guard");
  if (error) return { allowed: true };
  const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const dailyCount = Number((row as { daily_count?: number } | null)?.daily_count ?? 0);
  const dailyLimit = Number((row as { daily_limit?: number } | null)?.daily_limit ?? 1500);
  if (dailyCount >= dailyLimit) {
    return {
      allowed: false,
      message: "Daily AI request limit reached. Please try again later.",
    };
  }
  return { allowed: true };
}

/**
 * Invoke deduct_surgical_units RPC with the required SU cost. Call before the AI request.
 * Returns { ok, creditsRemaining }; if !ok, do not call the AI and return 402.
 * Beta testers (is_beta_tester) bypass deduction and always get ok: true.
 */
export async function deductSurgicalUnits(
  request: Request,
  cost: number
): Promise<{ ok: boolean; creditsRemaining: number }> {
  if (cost <= 0) return { ok: true, creditsRemaining: 0 };
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return { ok: false, creditsRemaining: -1 };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return { ok: false, creditsRemaining: -1 };

  const { data: asset, error: assetError } = await supabase
    .schema(schema)
    .from("user_assets")
    .select("is_beta_tester")
    .eq("user_id", user.id)
    .maybeSingle();
  const isBetaTester = Boolean((asset as { is_beta_tester?: unknown } | null)?.is_beta_tester);
  if (isBetaTester) {
    return { ok: true, creditsRemaining: 999_999 };
  }

  const { data, error } = await supabase.schema(schema).rpc("deduct_surgical_units", { p_amount: cost });
  if (error) {
    return { ok: false, creditsRemaining: -1 };
  }
  const remaining = typeof data === "number" ? data : -1;
  return { ok: remaining >= 0, creditsRemaining: remaining };
}

export const REFILL_PAYLOAD = {
  error: "Refill required",
  code: "CREDITS_REQUIRED" as const,
  message: "Insufficient Surgical Units. Top up your pass to continue the operation.",
};

/**
 * Global SU consumption: check ai_credits >= cost, deduct in DB, then proceed.
 * If credits < cost, returns 402 and Refill Modal should be shown on the client.
 * Use in API routes: if unitResponse is set, return it; else creditsRemaining is set and you may proceed.
 */
export async function consumeUnits(
  request: Request,
  cost: number
): Promise<{ unitResponse: NextResponse; creditsRemaining?: number } | { unitResponse?: never; creditsRemaining: number }> {
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
export async function requireUnits(
  request: Request,
  action: SurgicalUnitAction
): Promise<{ unitResponse: NextResponse; creditsRemaining?: number } | { unitResponse?: never; creditsRemaining: number }> {
  const cost = getSuCost(action);
  return consumeUnits(request, cost);
}

/**
 * validateAndDeduct: Unified helper for feature-based SU consumption.
 *
 * - Applies base FEATURE_COST for the feature.
 * - Adds a 20% surcharge when humanize/stealth is enabled.
 * - Returns either a unitResponse (402/401) or the remaining balance + cost charged.
 */
export async function validateAndDeduct(
  request: Request,
  feature: SurgicalUnitAction,
  options?: { humanize?: boolean }
): Promise<
  | { unitResponse: NextResponse; cost?: number; creditsRemaining?: number }
  | { unitResponse?: never; cost: number; creditsRemaining: number }
> {
  const baseCost = getSuCost(feature);
  const cost = options?.humanize ? Math.ceil(baseCost * 1.2) : baseCost;
  const result = await consumeUnits(request, cost);
  if ("unitResponse" in result && result.unitResponse) {
    return { unitResponse: result.unitResponse, cost };
  }
  return { cost, creditsRemaining: result.creditsRemaining };
}

/** process_ai_usage RPC: -4 = user throttle (2/min), -3 = maintenance (1450 daily), -2 = global 15/min, -1 = insufficient */
const PROCESS_AI_RATE_LIMITED = -2;
const PROCESS_AI_MAINTENANCE = -3;
const PROCESS_AI_USER_THROTTLE = -4;
const PROCESS_AI_INSUFFICIENT = -1;

const MAINTENANCE_MESSAGE = "Maintenance: High Traffic. Please try again later. (Last 50 requests reserved for critical use.)";
const WAIT_JITTER_MS = 2000;
const WAIT_BASE_MS = 5000;
const MAX_WAIT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches global request counts (sliding window: last 1 min, last 1 day). Uses request JWT.
 */
export async function getGlobalRequestCounts(
  request: Request
): Promise<{ minuteCount: number; dailyCount: number } | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.schema(schema).rpc("get_global_request_counts");
  if (error) return null;
  const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const minuteCount = Number((row as { minute_count?: number } | null)?.minute_count ?? 0);
  const dailyCount = Number((row as { daily_count?: number } | null)?.daily_count ?? 0);
  return { minuteCount, dailyCount };
}

/**
 * processAiUsage: Invoke process_ai_usage RPC (no wait). Use processAiUsageWithWait in routes for wait logic.
 */
export async function processAiUsage(
  request: Request,
  cost: number
): Promise<
  | { unitResponse: NextResponse; creditsRemaining?: number }
  | { unitResponse?: never; creditsRemaining: number }
> {
  if (cost <= 0) return { creditsRemaining: 0 };
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return { unitResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.schema(schema).rpc("process_ai_usage", { p_amount: cost });
  if (error) {
    console.warn("[credits] process_ai_usage RPC error:", error.message);
    return { unitResponse: NextResponse.json(REFILL_PAYLOAD, { status: 402 }) };
  }
  const result = typeof data === "number" ? data : -1;
  if (result === PROCESS_AI_MAINTENANCE) {
    return {
      unitResponse: NextResponse.json(
        { error: MAINTENANCE_MESSAGE, code: "MAINTENANCE" },
        { status: 503 }
      ),
    };
  }
  if (result === PROCESS_AI_USER_THROTTLE) {
    return {
      unitResponse: NextResponse.json(
        { error: "Limit of 2 AI generations per minute. Please wait a moment.", code: "USER_THROTTLE" },
        { status: 429 }
      ),
    };
  }
  if (result === PROCESS_AI_RATE_LIMITED) {
    return {
      unitResponse: NextResponse.json(
        { error: "Too many AI requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
        { status: 429 }
      ),
    };
  }
  if (result === PROCESS_AI_INSUFFICIENT || result < 0) {
    return { unitResponse: NextResponse.json(REFILL_PAYLOAD, { status: 402 }) };
  }
  return { creditsRemaining: result };
}

/**
 * processAiUsageWithWait: Global safety + wait logic before calling Gemini/Groq.
 * - If global_daily_requests >= 1450 → 503 Maintenance.
 * - If global_minute_requests >= 14 → wait 5s + jitter (up to 2 retries), then call process_ai_usage.
 * - User throttle (2/min) and global 15/min enforced inside process_ai_usage.
 */
export async function processAiUsageWithWait(
  request: Request,
  cost: number
): Promise<
  | { unitResponse: NextResponse; creditsRemaining?: number }
  | { unitResponse?: never; creditsRemaining: number }
> {
  if (cost <= 0) return { creditsRemaining: 0 };

  for (let attempt = 0; attempt <= MAX_WAIT_RETRIES; attempt++) {
    const counts = await getGlobalRequestCounts(request);
    if (counts) {
      if (counts.dailyCount >= 1450) {
        return {
          unitResponse: NextResponse.json(
            { error: MAINTENANCE_MESSAGE, code: "MAINTENANCE" },
            { status: 503 }
          ),
        };
      }
      if (counts.minuteCount >= 14) {
        if (attempt < MAX_WAIT_RETRIES) {
          const jitter = Math.floor(Math.random() * (WAIT_JITTER_MS + 1));
          await sleep(WAIT_BASE_MS + jitter);
          continue;
        }
      }
    }

    const result = await processAiUsage(request, cost);
    if ("unitResponse" in result) {
      if (result.unitResponse.status === 429 && attempt < MAX_WAIT_RETRIES) {
        const jitter = Math.floor(Math.random() * (WAIT_JITTER_MS + 1));
        await sleep(WAIT_BASE_MS + jitter);
        continue;
      }
      return result;
    }
    return result;
  }

  return {
    unitResponse: NextResponse.json(
      { error: "Too many AI requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
      { status: 429 }
    ),
  };
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
  if ("unitResponse" in result && result.unitResponse) return { creditResponse: result.unitResponse };
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
