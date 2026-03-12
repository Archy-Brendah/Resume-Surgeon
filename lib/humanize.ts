/**
 * Anti-AI Stealth Mode (Humanization)
 * Instructs the model so output reads like a skilled human wrote it and is less likely
 * to be flagged by AI content detectors (burstiness, varied structure, natural word choice).
 */

/** Short nudge included in every system prompt so baseline output is more human-like. */
export const BASE_HUMAN_LIKE =
  "Write as a skilled human would: use varied sentence length (mix short and longer sentences), natural word choice, and a conversational-but-professional tone. Avoid robotic patterns: no repeated sentence openers, no overuse of 'Furthermore' or 'Additionally', and no uniform list-like phrasing. The goal is text that reads like it was written by an expert human and performs well on AI detection checks.";

/** Instruction appended when Humanize (Stealth) is enabled — stronger anti-detection. */
export const HUMANIZE_INSTRUCTION = `CRITICAL — Humanization (pass AI detection): Write so the output reads as if a human expert wrote it, not an AI. (1) Vary sentence length a lot: use short, punchy sentences (3–8 words) alongside longer, flowing ones (15–25 words). (2) Add burstiness: alternate rhythm — e.g. short. Then a longer sentence that develops the idea. Then short again. (3) Avoid telltale AI phrasing: no "Moreover", "Furthermore", "In conclusion", "It is important to", "In today's world". (4) Do not start consecutive sentences the same way. (5) Use contractions where natural (e.g. "I've", "that's"). (6) Prefer concrete, specific wording over generic or flowery. (7) Slight asymmetry is good — not every paragraph needs the same structure. This helps the text pass AI content detectors used by recruiters and tools.`;

/**
 * Optional post-process for prose. Currently returns as-is; prompt instruction does the work.
 * Can be extended to e.g. break up long uniform runs of sentences.
 */
export function humanizeText(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.trim();
}

/**
 * Humanize prose fields in an object (e.g. about, summary, paragraphs).
 * Only processes string values; arrays of strings are each humanized.
 */
export function humanizeProseFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const next = { ...obj } as Record<string, unknown>;
  for (const key of fields) {
    const v = next[key as string];
    if (typeof v === "string") {
      (next as T)[key] = humanizeText(v) as T[keyof T];
    } else if (Array.isArray(v)) {
      (next as T)[key] = v.map((item) =>
        typeof item === "string" ? humanizeText(item) : item
      ) as T[keyof T];
    }
  }
  return next as T;
}
