import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { validateAndDeduct } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

export type QuestionCategory = "expert_check" | "cultural_fit" | "professional_story" | "visionary";

const SYSTEM = `You are an expert interview coach and former senior recruiter. Create 10 questions in 4 categories with STAR answer scripts from the candidate's real experience. Output only valid JSON.

CATEGORIES (10 total): expert_check (3), cultural_fit (3), professional_story (3), visionary (1). expert_check = top 3 hard skills from JD. cultural_fit = company values/vibe. professional_story = real projects from resume. visionary = where do you see yourself, tailored to role level.

For EACH question: "category", "question", "winningAnswer" (STAR from real experience; 2-5 sentences; write as if someone is speaking — natural, varied length, not a script read off a page), "trap", "motive", "strategy".

Also output "elevatorPitch": 30-second "Tell me about yourself" blending resume + LinkedIn. Write it like natural speech — short and long sentences, how a confident candidate would actually say it. This is the first question; make it sound human so it passes AI detection.`;

type Body = {
  sharpenedResume?: string;
  experience?: string;
  jobDescription?: string;
  fullName?: string;
  targetRole?: string;
  linkedinAbout?: string;
  linkedinHeadline?: string;
  humanize?: boolean;
};

export type InterviewQuestion = {
  category: QuestionCategory;
  question: string;
  winningAnswer: string;
  trap: string;
  motive: string;
  strategy: string;
};

export type InterviewPrepResponse = {
  questions: InterviewQuestion[];
  elevatorPitch: string;
};

function buildPrompt(body: Body): string {
  const resume = sanitizeForAI(body.sharpenedResume || body.experience) || "(No resume provided.)";
  const jd = sanitizeForAI(body.jobDescription) || "(No job description provided.)";
  const name = sanitizeShortField(body.fullName, 200) || "the candidate";
  const role = sanitizeShortField(body.targetRole, 200) || "the role";
  const about = sanitizeForAI(body.linkedinAbout) || "";
  const headline = sanitizeShortField(body.linkedinHeadline, 300) || "";

  return `CANDIDATE NAME: ${name}
TARGET ROLE: ${role}

SHARPENED RESUME / EXPERIENCE (use real projects and facts for STAR answers):
${resume}

LINKEDIN PROFILE (use for elevator pitch and brand):
${headline ? `Headline: ${headline}` : ""}
${about ? `About: ${about}` : ""}

TARGET JOB DESCRIPTION (extract top 3 hard skills, company values/vibe, and seniority for question categories):
${jd}

---
Generate the JSON object with:
1. "elevatorPitch": one string — the 30-second "Tell me about yourself" (100% guaranteed first question). Blend resume + LinkedIn brand.
2. "questions": array of exactly 10 objects. Order: 3 expert_check, 3 cultural_fit, 3 professional_story, 1 visionary. Each object: "category", "question", "winningAnswer" (STAR script from REAL experience), "trap", "motive", "strategy".

Output only the JSON object. No markdown code fences.`;
}

const CATEGORIES: QuestionCategory[] = ["expert_check", "cultural_fit", "professional_story", "visionary"];

function parseResponse(text: string): InterviewPrepResponse {
  const match = text.match(/\{[\s\S]*\}/);
  let parsed: { questions?: unknown[]; elevatorPitch?: string } = {};
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as typeof parsed;
    } catch {
      // ignore
    }
  }

  const questions: InterviewQuestion[] = [];
  const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const q = raw[i];
    if (q && typeof q === "object" && "question" in q) {
      const o = q as Record<string, unknown>;
      const cat = CATEGORIES.includes((o.category as QuestionCategory) ?? "") ? (o.category as QuestionCategory) : (i < 3 ? "expert_check" : i < 6 ? "cultural_fit" : i < 9 ? "professional_story" : "visionary");
      questions.push({
        category: cat,
        question: String(o.question ?? "").trim() || `Question ${i + 1}`,
        winningAnswer: String(o.winningAnswer ?? "").trim(),
        trap: String(o.trap ?? "").trim(),
        motive: String(o.motive ?? "").trim(),
        strategy: String(o.strategy ?? "").trim(),
      });
    }
  }

  const elevatorPitch =
    typeof parsed.elevatorPitch === "string"
      ? parsed.elevatorPitch.trim()
      : "Generate interview prep to see your 30-second intro here.";

  return { questions, elevatorPitch };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const prompt = buildPrompt(body);
    const humanize = Boolean(body.humanize);
    const unitCheck = await validateAndDeduct(req, "INTERVIEW_PREP", { humanize });
    if ("unitResponse" in unitCheck && unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;
    const systemContent = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;

    const groqKey = getGroqKey();
    const geminiKey = getGeminiKey();

    try {
      if (geminiKey) {
        const raw = await generateWithGeminiFailover(geminiKey, {
          prompt,
          systemInstruction: systemContent,
        });
        return NextResponse.json({ ...parseResponse(raw), creditsRemaining });
      }
    } catch {
      // Fall through to Groq
    }

    if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.35,
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: prompt },
        ],
      });
      const raw = (completion.choices[0]?.message?.content ?? "").trim();
      return NextResponse.json({ ...parseResponse(raw), creditsRemaining });
    }

    return NextResponse.json(
      { error: "Interview prep not configured (set GROQ_API_KEY or GEMINI_API_KEY)." },
      { status: 503 }
    );
  } catch (err) {
    console.error("interview-prep error:", err);
    return NextResponse.json(
      { error: "Failed to generate interview prep." },
      { status: 500 }
    );
  }
}
