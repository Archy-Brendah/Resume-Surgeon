import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey } from "@/lib/ai-keys";

type TailorResumeBody = {
  resumeText: string;
  jobDescription: string;
  missingKeywords?: string[];
  humanize?: boolean;
};

const SYSTEM = `You are an expert executive resume writer. Your task is to SURGICALLY tailor a resume to a job description.

RULES:
- Modify ONLY 3-4 bullet points (and optionally one short professional summary line). Do NOT rewrite the entire resume.
- Preserve the candidate's exact facts, numbers, and achievements. Only change wording to use the JD's terminology and emphasize alignment.
- Tone must be Executive/Bespoke: confident, concise, action-led. No casual language.
- Output valid JSON only, no markdown. Use this structure:
{"professionalSummary": "One sentence summary or empty string if not needed", "tailoredBullets": ["bullet1", "bullet2", "bullet3"]}
- tailoredBullets: array of 3-4 rewritten bullets. Use the JD's keywords naturally. Keep each bullet to 1-2 lines.
- If the resume has no clear summary, professionalSummary can be "".`;

function extractJson(text: string): { professionalSummary: string; tailoredBullets: string[] } | null {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { professionalSummary?: string; tailoredBullets?: string[] };
    return {
      professionalSummary: typeof parsed.professionalSummary === "string" ? parsed.professionalSummary : "",
      tailoredBullets: Array.isArray(parsed.tailoredBullets) ? parsed.tailoredBullets : [],
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const unitCheck = await requireUnits(request, "TAILOR");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await request.json()) as TailorResumeBody;
    const { resumeText = "", jobDescription = "", missingKeywords = [], humanize = false } = body;

    const jd = sanitizeForAI(jobDescription);
    const resume = sanitizeForAI(resumeText);

    if (!jd || !resume) {
      return NextResponse.json(
        { error: "Resume text and job description are required" },
        { status: 400 }
      );
    }

    const apiKey = getGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Tailoring service not configured. Add GEMINI_API_KEY to .env.local." },
        { status: 503 }
      );
    }

    const systemInstruction = humanize ? `${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : SYSTEM;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction,
    });

    const missingHint = missingKeywords.length > 0
      ? `\nKeywords from the JD to weave in where relevant: ${missingKeywords.slice(0, 15).join(", ")}`
      : "";

    const result = await model.generateContent(
      `JOB DESCRIPTION:\n${jd}\n\n---\nCURRENT RESUME (experience/summary):\n${resume}${missingHint}\n\n---\nRespond with the single JSON object only (professionalSummary + tailoredBullets). Surgically rewrite only 3-4 bullets and optionally one summary line. Preserve all facts; use JD terminology and Executive tone.`
    );

    const raw = result.response.text().trim();
    const parsed = extractJson(raw);

    if (!parsed || parsed.tailoredBullets.length === 0) {
      return NextResponse.json(
        { error: "Could not parse tailoring result" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      professionalSummary: parsed.professionalSummary,
      tailoredBullets: parsed.tailoredBullets.slice(0, 4),
      creditsRemaining,
    });
  } catch (e) {
    console.error("tailor-resume error:", e);
    return NextResponse.json(
      { error: "Failed to tailor resume" },
      { status: 500 }
    );
  }
}
