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
