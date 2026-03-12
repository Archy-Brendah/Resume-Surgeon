/**
 * Centralized AI API key access. Keys are trimmed so .env values with accidental spaces work.
 * Use these in API routes instead of reading process.env directly.
 */

export function getGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (key == null || typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getGroqKey(): string | null {
  const key = process.env.GROQ_API_KEY;
  if (key == null || typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Returns true if at least one AI provider is configured (for graceful 503). */
export function hasAnyAiKey(): boolean {
  return getGeminiKey() != null || getGroqKey() != null;
}

/** Groq 70B model for quality (replaced decommissioned llama-3.1-70b-versatile). */
export const GROQ_MAIN_MODEL = "llama-3.3-70b-versatile";

/** Groq model used when Gemini hits 15 RPM: Llama 3.1 8B (higher RPD). */
export const GROQ_FALLBACK_MODEL = "llama-3.1-8b-instant";

/** Gemini primary model (free tier). Uses v1beta via SDK default. */
export const GEMINI_PRIMARY_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";

/** Gemini fallback when primary fails. */
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";

/** @deprecated Use GEMINI_PRIMARY_MODEL */
export const GEMINI_MODEL = GEMINI_PRIMARY_MODEL;
