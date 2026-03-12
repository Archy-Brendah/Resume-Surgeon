/**
 * AI Rotator: Multi-quota key rotation and failover for Cloudflare Edge.
 * - Key A → Key B on 429 → Groq fallback
 * - All calls use fetch (Edge-compatible)
 * - Inputs truncated to 12,000 chars
 */

const MAX_INPUT_CHARS = 12_000;
const GEMINI_MODEL = process.env.GEMINI_ROTATOR_MODEL?.trim() || "gemini-2.0-flash-lite";
const GROQ_MODEL = "llama-3.3-70b-versatile";

/** Array of Gemini API keys for rotation (Key A, Key B). */
export const GEMINI_KEYS: string[] = [
  process.env.GEMINI_KEY_A?.trim(),
  process.env.GEMINI_KEY_B?.trim(),
  process.env.GEMINI_API_KEY?.trim(),
]
  .filter((k): k is string => typeof k === "string" && k.length > 0);

/** Truncate input to preserve tokens. */
export function truncateToLimit(text: string, limit = MAX_INPUT_CHARS): string {
  const t = (text || "").trim();
  if (t.length <= limit) return t;
  return t.slice(0, limit) + "\n\n[...truncated]";
}

/**
 * Surgical cleanup: extract JSON object {...} from AI response to prevent SyntaxError.
 */
export function surgicalExtractJSON(response: string): string | null {
  const trimmed = (response || "").trim();
  if (!trimmed) return null;
  const withoutFences = trimmed
    .replace(/^```[\w]*\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const match = withoutFences.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

/** Call Gemini via fetch (Edge-compatible). Returns raw text or throws. */
async function callGeminiFetch(
  apiKey: string,
  input: string
): Promise<{ text: string; status: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: input }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    }),
  });

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string; code?: number };
  };

  if (!res.ok) {
    const msg = data?.error?.message ?? `Gemini API error: ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text: (typeof text === "string" ? text : "").trim(), status: res.status };
}

/** Call Groq via fetch (Edge-compatible). Returns raw text or throws. */
async function callGroqFetch(input: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: input }],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = data?.error?.message ?? `Groq API error: ${res.status}`;
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content ?? "";
  return (typeof text === "string" ? text : "").trim();
}

export type CallSurgicalAIResult =
  | { success: true; text: string; provider: "gemini-a" | "gemini-b" | "groq" }
  | { success: false; error: string };

/**
 * Call Surgical AI with key rotation and failover.
 * 1. Try Gemini Key A
 * 2. On 429 → try Gemini Key B
 * 3. On failure → fallback to Groq
 * Inputs are truncated to 12,000 chars.
 */
export async function callSurgicalAI(
  prompt: string,
  text: string
): Promise<CallSurgicalAIResult> {
  const input = truncateToLimit(`${prompt}\n\n${text}`);

  // Try Gemini Key A
  if (GEMINI_KEYS[0]) {
    try {
      const { text: out } = await callGeminiFetch(GEMINI_KEYS[0], input);
      if (out) return { success: true, text: out, provider: "gemini-a" };
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 429 && GEMINI_KEYS[1]) {
        // Rate limit → try Key B
        try {
          const { text: out } = await callGeminiFetch(GEMINI_KEYS[1], input);
          if (out) return { success: true, text: out, provider: "gemini-b" };
        } catch {
          // Key B failed, fall through to Groq
        }
      }
      // Non-429 or Key B failed, fall through to Groq
    }
  }

  // Fallback to Groq
  try {
    const out = await callGroqFetch(input);
    if (out) return { success: true, text: out, provider: "groq" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }

  return { success: false, error: "All AI providers returned empty." };
}

/**
 * Call Surgical AI and extract JSON object from response.
 * Uses surgicalExtractJSON to prevent SyntaxError from extra text.
 */
export async function callSurgicalAIForJSON(
  prompt: string,
  text: string
): Promise<{ success: true; json: string } | { success: false; error: string }> {
  const result = await callSurgicalAI(prompt, text);
  if (!result.success) return { success: false, error: result.error };
  const json = surgicalExtractJSON(result.text);
  if (!json) return { success: false, error: "Could not extract JSON from AI response." };
  return { success: true, json };
}
