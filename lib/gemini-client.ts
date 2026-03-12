/**
 * Gemini API client with failover and text truncation.
 * - Primary: gemini-3.1-flash-lite (override via GEMINI_MODEL env)
 * - Fallback: gemini-2.5-flash-lite
 * - Text truncated to 10k chars to stay under 250K TPM
 * - Uses v1beta API (SDK default: generativelanguage.googleapis.com/v1beta)
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/ai-keys";

/** Truncate text to stay under 250K TPM limit. ~10k chars ≈ 2.5k tokens. */
export function truncateForGemini(fullText: string, maxLen = 10000): string {
  const truncated = fullText.slice(0, maxLen);
  return truncated.length < fullText.length
    ? truncated + "\n\n[...truncated for token limit]"
    : truncated;
}

export type GeminiGenerateOptions = {
  prompt: string;
  systemInstruction?: string;
  generationConfig?: {
    responseMimeType?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
};

/**
 * Generate content with Gemini failover: primary → fallback.
 * Throws on both failures. Caller should catch and use Groq.
 */
export async function generateWithGeminiFailover(
  apiKey: string,
  options: GeminiGenerateOptions
): Promise<string> {
  const truncated = truncateForGemini(options.prompt);
  const genAI = new GoogleGenerativeAI(apiKey);

  const modelConfig = {
    model: GEMINI_PRIMARY_MODEL,
    systemInstruction: options.systemInstruction,
    ...(options.generationConfig && {
      generationConfig: options.generationConfig,
    }),
  };

  let lastError: Error | null = null;

  for (const model of [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const modelInstance = genAI.getGenerativeModel({
        ...modelConfig,
        model,
      });
      const result = await modelInstance.generateContent([truncated]);
      const text = result.response?.text?.()?.trim() ?? "";
      if (text) return text;
      lastError = new Error("Gemini returned empty");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[gemini] ${model} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Gemini failed");
}

/**
 * Generate with contents array (for structured prompts).
 * Used by routes that pass { contents: [{ role, parts }] }.
 */
export async function generateWithGeminiFailoverContents(
  apiKey: string,
  options: {
    contents: Array<{ role?: string; parts: Array<{ text: string }> }>;
    systemInstruction?: string;
    generationConfig?: Record<string, unknown>;
  }
): Promise<string> {
  const truncatedContents = options.contents.map((c) => ({
    ...c,
    parts: c.parts.map((p) => ({
      ...p,
      text: truncateForGemini(p.text),
    })),
  }));

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: Error | null = null;

  for (const model of [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const modelInstance = genAI.getGenerativeModel({
        model,
        systemInstruction: options.systemInstruction,
        ...(options.generationConfig && {
          generationConfig: options.generationConfig,
        }),
      });
      const result = await modelInstance.generateContent({
        contents: truncatedContents,
      });
      const raw =
        result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const text = (typeof raw === "string" ? raw : "").trim();
      if (text) return text;
      lastError = new Error("Gemini returned empty");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[gemini] ${model} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error("Gemini failed");
}
