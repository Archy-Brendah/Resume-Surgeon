import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";

const SYSTEM =
  "You are an expert executive writer. Write high-stakes, sophisticated cover letters. Use a non-robotic, human tone. Output exactly 3 paragraphs: Paragraph 1 = The Hook (why I'm the only choice). Paragraph 2 = The Proof (specific achievements from the resume that match the job description). Paragraph 3 = The Call to Action. No greetings or sign-offs—only the three body paragraphs. Match the requested tone.";

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
  return `Job description:\n${jd}\n\nCandidate resume / achievements (use these for proof):\n${resume}\n\nTone: ${toneGuide[tone]}\n\nWrite a 3-paragraph cover letter. Paragraph 1: The Hook (why I'm the only choice). Paragraph 2: The Proof (specific achievements from my resume that match the job). Paragraph 3: The Call to Action. Sophisticated, non-robotic tone. Output only the three paragraphs, no salutation or sign-off.`;
}

async function callGemini(prompt: string, humanize: boolean): Promise<string> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const systemInstruction = humanize ? `${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : SYSTEM;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction,
  });
  const result = await model.generateContent([prompt]);
  const text = result.response.text().trim();
  if (!text) throw new Error("Gemini returned empty");
  return text;
}

async function callGroq(prompt: string, humanize: boolean): Promise<string> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const systemContent = humanize ? `${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : SYSTEM;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
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
    const unitCheck = await requireUnits(req, "COVER_LETTER");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as CoverLetterBody;
    const humanize = Boolean(body.humanize);
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
