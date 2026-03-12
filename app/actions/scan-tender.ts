"use server";

import Groq from "groq-sdk";
import { extractTextFromPDF } from "@/lib/pdf-extract";
import { getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";

export type TenderRequirement = {
  requirement: string;
  type: "technical" | "legal";
};

const PROMPT = `Extract the top 5 technical requirements and any mandatory certifications from this tender. Return ONLY a JSON array: [{"requirement": "string", "type": "technical" | "legal"}]`;

export async function scanTender(formData: FormData): Promise<{
  success: true;
  requirements: TenderRequirement[];
  tenderText: string;
} | { success: false; error: string }> {
  try {
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "No PDF file provided." };
    }
    if (file.type !== "application/pdf") {
      return { success: false, error: "File must be a PDF." };
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawText = await extractTextFromPDF(arrayBuffer);
    const excerpt = rawText.slice(0, 4000);

    if (!excerpt.trim()) {
      return { success: false, error: "Could not extract text from the PDF." };
    }

    const apiKey = getGroqKey();
    if (!apiKey) {
      return { success: false, error: "AI service not configured." };
    }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MAIN_MODEL,
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\nTender excerpt:\n${excerpt}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const text = (typeof raw === "string" ? raw : "").trim();
    if (!text) {
      return { success: false, error: "AI returned no response." };
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr) as unknown;

    if (!Array.isArray(parsed)) {
      return { success: false, error: "AI did not return a valid JSON array." };
    }

    const requirements: TenderRequirement[] = parsed
      .filter(
        (item): item is { requirement?: string; type?: string } =>
          item != null && typeof item === "object"
      )
      .map((item): TenderRequirement => ({
        requirement: typeof item.requirement === "string" ? item.requirement : String(item.requirement ?? ""),
        type: item.type === "legal" ? "legal" : "technical",
      }))
      .filter((r) => r.requirement.trim().length > 0);

    return { success: true, requirements, tenderText: excerpt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scan tender.";
    return { success: false, error: message };
  }
}
