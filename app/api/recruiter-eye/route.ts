import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const RECRUITER_SYSTEM =
  "You are a cynical, experienced tech recruiter. Six-second first pass. Skeptical; look for gaps, vague claims, unsubstantiated skills. Be direct and specific. Write the sixSecondImpression and hardQuestions in a natural, conversational tone — how a real recruiter would think or ask, not a formal report. Output valid JSON only.";

type RecruiterRequestBody = {
  fullName?: string;
  targetRole?: string;
  experience?: string;
  sharpened?: string;
  skills?: string;
  humanize?: boolean;
};

type Provider = "gemini" | "groq";

function buildResumeBlob(body: RecruiterRequestBody): string {
  const parts: string[] = [];
  const fullName = sanitizeShortField(body.fullName, 200);
  const targetRole = sanitizeShortField(body.targetRole, 200);
  const experience = sanitizeForAI(body.experience);
  const sharpened = sanitizeForAI(body.sharpened);
  const skills = sanitizeForAI(body.skills);
  if (fullName) parts.push(`Name: ${fullName}`);
  if (targetRole) parts.push(`Target role: ${targetRole}`);
  if (experience) parts.push(`Experience / bullets:\n${experience}`);
  if (sharpened) parts.push(`Refined bullets:\n${sharpened}`);
  if (skills) parts.push(`Skills: ${skills}`);
  return parts.join("\n\n") || "No resume content provided.";
}

async function callGemini(resumeBlob: string, humanize: boolean): Promise<{
  sixSecondImpression: string;
  vibeSummary: string;
  hardQuestions: string[];
}> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const systemInstruction = humanize ? `${BASE_HUMAN_LIKE}\n\n${RECRUITER_SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${RECRUITER_SYSTEM}`;
  const prompt = `Based on this resume, respond with a JSON object containing exactly:
1. "sixSecondImpression": a single paragraph (2-4 sentences) of what you, as a cynical recruiter, think after a 6-second scan. Mention what stands out positively and what raises red flags (gaps, vague skills, missing metrics).
2. "vibeSummary": only the short phrase (e.g. "An Authoritative Leader", "A High-Speed Executor", "A Creative Problem Solver") that captures how the recruiter sees this candidate — their voice/vibe. Output only the phrase, max 80 characters.
3. "hardQuestions": an array of exactly 3 strings. Each string is one tough interview question a recruiter or hiring manager might ask based on weaknesses: employment gaps, skills without proof, missing numbers, or inconsistencies. Be specific to this resume.

Resume:\n${resumeBlob}\n\nOutput only the JSON object, no markdown or extra text.`;

  const text = await generateWithGeminiFailover(apiKey, { prompt, systemInstruction });
  return parseRecruiterResponse(text);
}

async function callGroq(resumeBlob: string, humanize: boolean): Promise<{
  sixSecondImpression: string;
  vibeSummary: string;
  hardQuestions: string[];
}> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const systemContent = humanize ? `${BASE_HUMAN_LIKE}\n\n${RECRUITER_SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${RECRUITER_SYSTEM}`;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.4,
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Based on this resume, respond with a JSON object containing exactly:
1. "sixSecondImpression": a single paragraph (2-4 sentences) of what you, as a cynical recruiter, think after a 6-second scan. Mention what stands out positively and what raises red flags.
2. "vibeSummary": only the short phrase (e.g. "An Authoritative Leader", "A High-Speed Executor") — how the recruiter sees this candidate. Output only the phrase, max 80 chars.
3. "hardQuestions": an array of exactly 3 strings. Each string is one tough interview question based on weaknesses (gaps, unsubstantiated skills, missing metrics). Be specific to this resume.

Resume:\n${resumeBlob}\n\nOutput only the JSON object, no markdown or extra text.`,
      },
    ],
  });

  const raw =
    completion.choices[0]?.message?.content ?? "";
  const text = (typeof raw === "string" ? raw : "").trim();
  return parseRecruiterResponse(text);
}

function parseRecruiterResponse(text: string): {
  sixSecondImpression: string;
  vibeSummary: string;
  hardQuestions: string[];
} {
  let parsed: { sixSecondImpression?: string; vibeSummary?: string; hardQuestions?: string[] };
  try {
    const cleaned = text.replace(/^```json?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const sixSecondImpression =
    typeof parsed.sixSecondImpression === "string"
      ? parsed.sixSecondImpression
      : "Unable to generate impression.";
  const vibeSummary =
    typeof parsed.vibeSummary === "string"
      ? parsed.vibeSummary.trim()
      : "";
  const hardQuestions = Array.isArray(parsed.hardQuestions)
    ? parsed.hardQuestions
        .filter((q): q is string => typeof q === "string")
        .slice(0, 3)
    : [];
  return { sixSecondImpression, vibeSummary, hardQuestions };
}

export async function POST(req: Request) {
  try {
    const unitCheck = await requireUnits(req, "RECRUITER_EYE");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as RecruiterRequestBody;
    const resumeBlob = buildResumeBlob(body);
    const humanize = Boolean(body.humanize);

    let sixSecondImpression: string;
    let vibeSummary: string;
    let hardQuestions: string[];

    try {
      const geminiResult = await callGemini(resumeBlob, humanize);
      sixSecondImpression = geminiResult.sixSecondImpression;
      vibeSummary = geminiResult.vibeSummary ?? "";
      hardQuestions = geminiResult.hardQuestions;
    } catch {
      const groqResult = await callGroq(resumeBlob, humanize);
      sixSecondImpression = groqResult.sixSecondImpression;
      vibeSummary = groqResult.vibeSummary ?? "";
      hardQuestions = groqResult.hardQuestions;
    }

    return NextResponse.json(
      { sixSecondImpression, vibeSummary, hardQuestions, creditsRemaining },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Recruiter eye API failed:", error);
    return NextResponse.json(
      { error: "Failed to run recruiter simulation" },
      { status: 500 }
    );
  }
}
