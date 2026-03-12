import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { validateAndDeduct } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const SYSTEM =
  "You are an expert executive writer. Write high-stakes, sophisticated cover letters that sound like a real candidate wrote them. Output exactly 3 paragraphs: (1) The Hook — why I'm the right choice. (2) The Proof — specific achievements from the resume that match the job. (3) The Call to Action. No salutation or sign-off; only the three body paragraphs. Vary sentence length: mix short, direct sentences with longer ones. Match the requested tone; avoid template-like or robotic phrasing so the letter reads human and passes AI detection.";

type Tone = "confident" | "professional" | "creative" | "humble";

type CoverLetterBody = {
  sharpenedResume?: string;
  jobDescription?: string;
  tone?: Tone;
  fullName?: string;
  targetRole?: string;
  skills?: string;
  humanize?: boolean;
};

function buildPrompt(body: CoverLetterBody): string {
  const resume = sanitizeForAI(body.sharpenedResume) || "(No resume content provided.)";
  const jd = sanitizeForAI(body.jobDescription) || "(No job description provided.)";
  const tone = body.tone || "professional";
  const toneGuide: Record<Tone, string> = {
    confident: "Confident and assertive; lead with strength.",
    professional: "Polished, formal, and business-appropriate.",
    creative: "Engaging and memorable without being casual.",
    humble: "Grounded and collaborative; emphasize learning and impact.",
  };
  return `Job description:\n${jd}\n\nCandidate resume / achievements (use these for proof):\n${resume}\n\nTone: ${toneGuide[tone]}\n\nWrite a 3-paragraph cover letter. Paragraph 1: The Hook. Paragraph 2: The Proof (use real achievements from the resume). Paragraph 3: The Call to Action. Vary sentence length; sound like a real person. Output only the three paragraphs, no salutation or sign-off.`;
}

async function callGemini(prompt: string, humanize: boolean): Promise<string> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const systemInstruction = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;
  return generateWithGeminiFailover(apiKey, { prompt, systemInstruction });
}

async function callGroq(prompt: string, humanize: boolean): Promise<string> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const systemContent = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MAIN_MODEL,
    temperature: 0.5,
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: prompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const text = (typeof raw === "string" ? raw : "").trim();
  if (!text) throw new Error("Groq returned empty");
  return text;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json(
        { error: "Sign in required to generate a cover letter." },
        { status: 401 }
      );
    }
    const body = (await req.json()) as CoverLetterBody;
    const humanize = Boolean(body.humanize);
    const unitCheck = await validateAndDeduct(req, "COVER_LETTER", { humanize });
    if ("unitResponse" in unitCheck && unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;
    const prompt = buildPrompt(body);
    let text: string;
    try {
      text = await callGemini(prompt, humanize);
    } catch {
      text = await callGroq(prompt, humanize);
    }
    return NextResponse.json({ coverLetter: text, creditsRemaining });
  } catch (err: unknown) {
    console.error("Cover letter API failed:", err);
    return NextResponse.json(
      { error: "Failed to generate cover letter" },
      { status: 500 }
    );
  }
}
