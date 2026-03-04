/**
 * Anti-AI Stealth Mode (Humanization)
 * Instructs the model and/or post-processes output so text is less likely to be flagged
 * by AI content detectors (vary sentence length, add burstiness).
 */

/** Instruction appended to system/user prompts when humanize is enabled. */
export const HUMANIZE_INSTRUCTION = `CRITICAL — Humanization (Anti-AI Stealth): Write so the output reads as if a human wrote it, not an AI. Vary sentence length significantly: use a mix of short, punchy sentences (3–8 words) and longer, flowing ones (15–25 words). Use a more conversational professional tone. Avoid typical AI transition words like "Moreover", "Furthermore", or "In conclusion". Do not start consecutive sentences the same way. Add "burstiness": alternate rhythm—e.g. short. Then a longer sentence that develops the idea. Then short again. Make it sound like a top-tier human consultant wrote it. This helps the text pass AI content detectors used by some firms.`;

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
