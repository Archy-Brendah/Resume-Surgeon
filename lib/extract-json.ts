/**
 * Extract JSON object {...} or array [...] from AI response text.
 * LLMs sometimes add extra text; this regex finds the JSON block to prevent parsing errors.
 */
export function extractJSON(text: string): string | null {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  // Strip markdown code fences first (e.g. ```json ... ``` or ``` ... ```)
  const withoutFences = trimmed
    .replace(/^```[\w]*\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();

  // Try array [...] first — required for matcher/compliance; object regex would wrongly grab {...},{...} from an array
  const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  // Then try object {...} (for other prompts that return a single object)
  const objectMatch = withoutFences.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  return null;
}
