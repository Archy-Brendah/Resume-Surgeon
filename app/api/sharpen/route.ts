import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits, getUserIdFromRequest, refundUnits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";

const BASE_PROMPT =
  "You are an Expert Technical Recruiter. Compare the user's resume bullet point against the provided Job Description. Rewrite the bullet point to highlight the exact keywords and skills the employer is looking for, while maintaining 100% honesty. Use the STAR method.";

type SharpenRequestBody = {
  text: string;
  jobDescription?: string;
  humanize?: boolean;
};

type Provider = "gemini" | "groq";

async function callGemini(
  text: string,
  jobDescription?: string,
  humanize?: boolean,
): Promise<{ output: string }> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const systemPrompt = humanize ? `${BASE_PROMPT}\n\n${HUMANIZE_INSTRUCTION}` : BASE_PROMPT;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: systemPrompt,
  });

  const jd = jobDescription?.trim();

  const result = await model.generateContent([
    `Job Description:\n${jd || "(not provided)"}\n\nCandidate bullet(s):\n${text}\n\nTask: Rewrite the bullet point(s) to align tightly with the job description while staying fully truthful, using the STAR method and preserving the candidate's real responsibilities and outcomes.`,
  ]);

  const response = await result.response;
  const generated = response.text().trim();

  if (!generated) {
    throw new Error("Gemini returned empty response");
  }

  return { output: generated };
}

async function callGroq(
  text: string,
  jobDescription?: string,
  humanize?: boolean,
): Promise<{ output: string }> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });
  const systemContent = humanize ? `${BASE_PROMPT}\n\n${HUMANIZE_INSTRUCTION}` : BASE_PROMPT;
  const jd = jobDescription?.trim();

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
    temperature: 0.4,
    max_tokens: 512,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: `Job Description:\n${jd || "(not provided)"}\n\nCandidate bullet(s):\n${text}\n\nTask: Rewrite the bullet point(s) to align tightly with the job description while staying fully truthful, using the STAR method and preserving the candidate's real responsibilities and outcomes.`,
      },
    ],
  });

  const message = completion.choices[0]?.message?.content;
  const output =
    (Array.isArray(message)
      ? message.map((part) => ("text" in part ? part.text : "")).join("")
      : typeof message === "string"
      ? message
      : "")?.trim() ?? "";

  if (!output) {
    throw new Error("Groq returned empty response");
  }

  return { output };
}

const SHARPEN_RATE_LIMIT = 10;

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit(userId, "SHARPEN", SHARPEN_RATE_LIMIT)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 },
      );
    }

    const unitCheck = await requireUnits(req, "SHARPEN");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as SharpenRequestBody;
    const text = sanitizeForAI(body?.text);
    const jobDescription = sanitizeForAI(body?.jobDescription);
    const humanize = Boolean(body?.humanize);

    if (!text) {
      return NextResponse.json(
        { error: "Missing text to sharpen" },
        { status: 400 },
      );
    }

    let provider: Provider = "gemini";
    let output: string | null = null;

    if (getGeminiKey()) {
      try {
        const geminiResult = await callGemini(text, jobDescription, humanize);
        output = geminiResult.output;
      } catch {
        // Fall back to Groq if Gemini fails or is unavailable.
        if (getGroqKey()) {
          provider = "groq";
          const groqResult = await callGroq(text, jobDescription, humanize);
          output = groqResult.output;
        }
      }
    }
    if (!output && getGroqKey()) {
      provider = "groq";
      const groqResult = await callGroq(text, jobDescription, humanize);
      output = groqResult.output;
    }
    if (!output) {
      return NextResponse.json(
        { error: "AI service unavailable. Please add GEMINI_API_KEY or GROQ_API_KEY to .env.local." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        result: output,
        provider,
        creditsRemaining,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Sharpen API failed:", error);
    await refundUnits(req, 1);
    return NextResponse.json(
      { error: "Failed to sharpen bullet points" },
      { status: 500 },
    );
  }
}

