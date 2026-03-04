/**
 * Input sanitization for Job Descriptions and Resume inputs.
 * Mitigates prompt injection and XSS when passing user content to AI or rendering.
 */

const MAX_TEXT_LENGTH = 50000;
const DANGEROUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
  /system\s*:\s*you\s+are/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g,
  /<\s*script\b/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /<\s*iframe/gi,
  /data\s*:\s*text\/html/gi,
];

/**
 * Sanitizes user-provided text (JD, resume, etc.) for use in AI prompts and safe display.
 */
export function sanitizeForAI(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  let out = text.slice(0, MAX_TEXT_LENGTH);
  for (const pattern of DANGEROUS_PATTERNS) {
    out = out.replace(pattern, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Stricter sanitization for short fields (names, titles).
 */
export function sanitizeShortField(
  value: string | null | undefined,
  maxLen: number
): string {
  if (value == null || typeof value !== "string") return "";
  return value
    .replace(/[<>'"&]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
