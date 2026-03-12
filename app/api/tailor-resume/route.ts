import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { validateAndDeduct } from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

type TailorResumeBody = {
  resumeText: string;
  jobDescription: string;
  missingKeywords?: string[];
  humanize?: boolean;
};

const SYSTEM = `You are an expert executive resume writer. Tailor the resume to the job description.

RULES:
- Modify ONLY 3-4 bullet points (and optionally one short professional summary). Do NOT rewrite the entire resume.
- Keep the candidate's exact facts, numbers, and achievements. Change wording to use the JD's terminology and show alignment.
- Tone: confident, concise, action-led. Write bullets so they sound like a human wrote them — vary length and structure; avoid every bullet following the same formula.
- Output valid JSON only, no markdown: {"professionalSummary": "One sentence or empty string", "tailoredBullets": ["bullet1", "bullet2", "bullet3"]}
- tailoredBullets: 3-4 rewritten bullets. Weave in JD keywords naturally. Mix short and slightly longer bullets so it doesn't read robotic.
- If no clear summary exists, professionalSummary can be "".`;

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
    const body = (await request.json()) as TailorResumeBody;
    const { resumeText = "", jobDescription = "", missingKeywords = [], humanize = false } = body;

    const unitCheck = await validateAndDeduct(request, "TAILOR", { humanize });
    if ("unitResponse" in unitCheck && unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const jd = sanitizeForAI(jobDescription);
    const resume = sanitizeForAI(resumeText);

    if (!jd || !resume) {
      return NextResponse.json(
        { error: "Resume text and job description are required" },
        { status: 400 }
      );
    }

    const geminiKey = getGeminiKey();
    const groqKey = getGroqKey();
    if (!geminiKey && !groqKey) {
      return NextResponse.json(
        { error: "Tailoring service not configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env.local." },
        { status: 503 }
      );
    }

    const systemInstruction = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;
    const missingHint = missingKeywords.length > 0
      ? `\nKeywords from the JD to weave in where relevant: ${missingKeywords.slice(0, 15).join(", ")}`
      : "";
    const prompt = `JOB DESCRIPTION:\n${jd}\n\n---\nCURRENT RESUME (experience/summary):\n${resume}${missingHint}\n\n---\nRespond with the single JSON object only (professionalSummary + tailoredBullets). Surgically rewrite only 3-4 bullets and optionally one summary line. Preserve all facts; use JD terminology and Executive tone.`;

    let raw: string;
    try {
      if (geminiKey) {
        raw = await generateWithGeminiFailover(geminiKey, { prompt, systemInstruction });
      } else {
        throw new Error("No Gemini key");
      }
    } catch {
      if (!groqKey) throw new Error("Tailoring service not configured. Add GEMINI_API_KEY or GROQ_API_KEY.");
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MAIN_MODEL,
        temperature: 0.3,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim();
    }
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
