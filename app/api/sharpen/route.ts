import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  refundUnits,
  checkGlobalGuard,
  deductSurgicalUnits,
  getCreditsFromRequest,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL, GROQ_FALLBACK_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const BASE_PROMPT =
  "You are an Expert Technical Recruiter. Rewrite the candidate's experience bullet points so they are clear, outcome-focused, and aligned with the job description. Keep 100% honesty. Use the STAR method. Output format: one bullet per line, no numbering or extra labels. The result will be pasted directly into a resume, so preserve the same number of bullets and output only the bullet text (one achievement per line).";

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

  const systemPrompt = humanize
    ? `${BASE_HUMAN_LIKE}\n\n${BASE_PROMPT}\n\n${HUMANIZE_INSTRUCTION}`
    : `${BASE_HUMAN_LIKE}\n\n${BASE_PROMPT}`;
  const jd = jobDescription?.trim();
  const prompt = `Job Description:\n${jd || "(not provided)"}\n\nCandidate bullet(s):\n${text}\n\nTask: Rewrite the bullet point(s) to align tightly with the job description while staying fully truthful, using the STAR method and preserving the candidate's real responsibilities and outcomes.`;

  const generated = await generateWithGeminiFailover(apiKey, {
    prompt,
    systemInstruction: systemPrompt,
  });
  return { output: generated };
}

async function callGroq(
  text: string,
  jobDescription?: string,
  humanize?: boolean,
  model: string = GROQ_MAIN_MODEL,
): Promise<{ output: string }> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });
  const systemContent = humanize
    ? `${BASE_HUMAN_LIKE}\n\n${BASE_PROMPT}\n\n${HUMANIZE_INSTRUCTION}`
    : `${BASE_HUMAN_LIKE}\n\n${BASE_PROMPT}`;
  const jd = jobDescription?.trim();

  const completion = await groq.chat.completions.create({
    model,
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
    const body = (await req.json()) as SharpenRequestBody;
    const text = sanitizeForAI(body?.text);
    const jobDescription = sanitizeForAI(body?.jobDescription);
    const humanize = Boolean(body?.humanize);

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

    const baseCost = getCost("SHARPEN");
    const cost = humanize ? Math.ceil(baseCost * 1.2) : baseCost;

    const guard = await checkGlobalGuard(req);
    if (!guard.allowed) {
      return NextResponse.json(
        { error: guard.message ?? "Daily AI limit reached. Please try again later." },
        { status: 503 }
      );
    }
    const { userId: _uid, credits } = await getCreditsFromRequest(req);
    if (credits < cost) {
      return NextResponse.json(REFILL_PAYLOAD, { status: 402 });
    }
    const deductResult = await deductSurgicalUnits(req, cost);
    if (!deductResult.ok || deductResult.creditsRemaining < 0) {
      return NextResponse.json(REFILL_PAYLOAD, { status: 402 });
    }
    const creditsRemaining = deductResult.creditsRemaining;

    if (!text) {
      await refundUnits(req, cost);
      return NextResponse.json(
        { error: "Missing text to sharpen" },
        { status: 400 },
      );
    }

    let provider: Provider = "gemini";
    let output: string | null = null;

    try {
      if (getGeminiKey()) {
        const geminiResult = await callGemini(text, jobDescription, humanize);
        output = geminiResult.output;
      }
    } catch {
      provider = "groq";
      if (getGroqKey()) {
        try {
          const groqResult = await callGroq(text, jobDescription, humanize);
          output = groqResult.output;
        } catch {
          const fallbackResult = await callGroq(text, jobDescription, humanize, GROQ_FALLBACK_MODEL);
          output = fallbackResult.output;
        }
      }
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
    const baseCost = getCost("SHARPEN");
    await refundUnits(req, baseCost);
    return NextResponse.json(
      { error: "Failed to sharpen bullet points" },
      { status: 500 },
    );
  }
}

