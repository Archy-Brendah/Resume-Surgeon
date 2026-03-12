import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  deductSurgicalUnits,
  getCreditsFromRequest,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL, GROQ_FALLBACK_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const SYSTEM_PROMPT = `You are an elite resume editor. Resumes you produce must be among the best: every part and subheading perfected, unnecessary information deleted, and every section arranged in a beautiful, professional order. Every line must be to-the-point, well-put, and keyword-rich. Structure and arrangement should feel premium and recruiter-ready.

Process EVERY section. Output a single JSON object with these exact keys (use empty string "" for missing/inapplicable fields):

- formattedName: Perfect how the name is written. Title Case (e.g. "Jane Smith"). No ALL CAPS, no extra spaces, no nicknames unless the candidate clearly uses one. Professional and consistent.
- email: One clean email address. No labels or extra text.
- profileUrl: One LinkedIn URL or empty string. No extra text.
- targetRole: One clear, professional job title. Keyword-rich and industry-standard (e.g. "Senior Product Manager", "Full-Stack Engineer").
- experienceBullets: Experience as bullet points. One bullet per line, newline (\\n) between. Delete filler and vague phrases. Use strong action verbs, metrics, and outcomes. Weave in job-description keywords where truthful. Keep 100% factual. Order bullets by impact. Each line should be crisp and scannable.
- education: Concise. Delete redundant words. Format: "Degree, School, Year" per line; multiple entries separated by newlines. No fluff.
- projects: Only if substantive. One line per project or outcome. Delete unnecessary detail; keep name and key result. Empty string if nothing strong.
- certifications: Clean list. One per line. Remove weak or redundant entries. Use official names.
- skills: Comma- or semicolon-separated. Add industry and role-relevant keywords. Remove filler. Order by relevance. No repetition.

Rules: (1) Delete unnecessary information in every section. (2) Perfect every line, including name formatting. (3) Arrange all content in a clear, professional order—the kind recruiters expect. (4) Use the right keywords everywhere. (5) Be to-the-point and well-put. (6) Do not invent facts. Output only valid JSON, no markdown or extra text.`;

export type PolishResumeBody = {
  fullName?: string;
  email?: string;
  profileUrl?: string;
  targetRole?: string;
  experience?: string;
  education?: string;
  projects?: string;
  certification?: string;
  skills?: string;
  jobDescription?: string;
  humanize?: boolean;
};

export type PolishResumeResult = {
  formattedName: string;
  email: string;
  profileUrl: string;
  targetRole: string;
  experienceBullets: string;
  education: string;
  projects: string;
  certifications: string;
  skills: string;
};

function parseJsonResponse(text: string): PolishResumeResult {
  let trimmed = text.trim();
  // Strip markdown code block if present
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) trimmed = codeBlock[1].trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error("AI returned invalid JSON. Please try again.");
  }
  return {
    formattedName: typeof raw.formattedName === "string" ? raw.formattedName : "",
    email: typeof raw.email === "string" ? raw.email : "",
    profileUrl: typeof raw.profileUrl === "string" ? raw.profileUrl : "",
    targetRole: typeof raw.targetRole === "string" ? raw.targetRole : "",
    experienceBullets: typeof raw.experienceBullets === "string" ? raw.experienceBullets : "",
    education: typeof raw.education === "string" ? raw.education : "",
    projects: typeof raw.projects === "string" ? raw.projects : "",
    certifications: typeof raw.certifications === "string" ? raw.certifications : "",
    skills: typeof raw.skills === "string" ? raw.skills : "",
  };
}

async function callGemini(body: PolishResumeBody): Promise<PolishResumeResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const humanize = Boolean(body.humanize);
  const systemInstruction = humanize
    ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM_PROMPT}\n\n${HUMANIZE_INSTRUCTION}`
    : `${BASE_HUMAN_LIKE}\n\n${SYSTEM_PROMPT}`;

  const resumeBlob = [
    body.fullName && `Name: ${body.fullName}`,
    body.email && `Email: ${body.email}`,
    body.profileUrl && `LinkedIn: ${body.profileUrl}`,
    body.targetRole && `Target role: ${body.targetRole}`,
    body.experience && `Experience:\n${body.experience}`,
    body.education && `Education:\n${body.education}`,
    body.projects && `Projects:\n${body.projects}`,
    body.certification && `Certifications:\n${body.certification}`,
    body.skills && `Skills: ${body.skills}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const jd = sanitizeForAI(body.jobDescription) || "(none)";

  const resumeInput = sanitizeForAI(resumeBlob) || "(empty)";
  const prompt = `Job description (use for keywords and alignment):\n${jd.slice(0, 4000)}\n\nCandidate resume (polish every section; output JSON only):\n${resumeInput}`;
  const text = await generateWithGeminiFailover(apiKey, {
    prompt,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  });
  try {
    return parseJsonResponse(text);
  } catch (parseErr) {
    throw new Error("AI returned invalid format. Please try again.");
  }
}

async function callGroq(body: PolishResumeBody): Promise<PolishResumeResult> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const humanize = Boolean(body.humanize);
  const systemContent = humanize
    ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM_PROMPT}\n\n${HUMANIZE_INSTRUCTION}`
    : `${BASE_HUMAN_LIKE}\n\n${SYSTEM_PROMPT}`;

  const resumeBlob = [
    body.fullName && `Name: ${body.fullName}`,
    body.email && `Email: ${body.email}`,
    body.profileUrl && `LinkedIn: ${body.profileUrl}`,
    body.targetRole && `Target role: ${body.targetRole}`,
    body.experience && `Experience:\n${body.experience}`,
    body.education && `Education:\n${body.education}`,
    body.projects && `Projects:\n${body.projects}`,
    body.certification && `Certifications:\n${body.certification}`,
    body.skills && `Skills: ${body.skills}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const jd = sanitizeForAI(body.jobDescription) || "(none)";

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MAIN_MODEL,
    temperature: 0.3,
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Job description:\n${jd}\n\nCandidate resume (polish every section; output a single JSON object with keys: formattedName, email, profileUrl, targetRole, experienceBullets, education, projects, certifications, skills):\n${sanitizeForAI(resumeBlob) || "(empty)"}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const text = (typeof raw === "string" ? raw : "").trim();
  if (!text) throw new Error("Groq returned empty");
  return parseJsonResponse(text);
}

const RATE_LIMIT_KEY = "POLISH_RESUME";

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit(userId, RATE_LIMIT_KEY, 10)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as PolishResumeBody;
    const hasAnyContent =
      [body.fullName, body.email, body.targetRole, body.experience, body.education, body.projects, body.certification, body.skills].some(
        (s) => typeof s === "string" && s.trim().length > 0
      );
    if (!hasAnyContent) {
      return NextResponse.json(
        { error: "Add at least one resume section (e.g. name, experience) to polish." },
        { status: 400 }
      );
    }

    const baseCost = getCost("POLISH_RESUME");
    const cost = body.humanize ? Math.ceil(baseCost * 1.2) : baseCost;

    const guard = await checkGlobalGuard(req);
    if (!guard.allowed) {
      return NextResponse.json(
        { error: guard.message ?? "Daily AI limit reached. Please try again later." },
        { status: 503 }
      );
    }
    const { credits } = await getCreditsFromRequest(req);
    if (credits < cost) {
      return NextResponse.json(REFILL_PAYLOAD, { status: 402 });
    }
    const deductResult = await deductSurgicalUnits(req, cost);
    if (!deductResult.ok || deductResult.creditsRemaining < 0) {
      return NextResponse.json(REFILL_PAYLOAD, { status: 402 });
    }

    let result: PolishResumeResult;
    try {
      result = await callGemini(body);
    } catch {
      result = await callGroq(body);
    }

    return NextResponse.json({
      ...result,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to polish resume. Please try again.";
    console.error("Polish resume API failed:", err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
