import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";

export type QuestionCategory = "expert_check" | "cultural_fit" | "professional_story" | "visionary";

const SYSTEM = `You are an expert interview coach and former senior recruiter. You create a Total Interview Prediction: 10 questions in 4 categories, each with a bespoke STAR answer script from the candidate's real experience. Output only valid JSON.

QUESTION CATEGORIES (exactly 10 questions total):
1. "expert_check" (3 questions) — The Expert Check / Technical. Base each question on one of the TOP 3 hard skills or technologies explicitly required in the job description. E.g. "How have you used [X technology] in production?", "Describe a technical decision you made under pressure."
2. "cultural_fit" (3 questions) — The Cultural Fit / Behavioral. Base on the company's vibe, values, or culture mentioned in the JD (e.g. "fast-paced", "ownership", "customer-first"). E.g. "Tell me about a time you disagreed with a manager.", "Describe how you handled a tight deadline."
3. "professional_story" (3 questions) — The Professional Story / Resume. Questions about specific high-impact projects or roles from their Resume or LinkedIn. Reference real projects, metrics, or companies from their experience. E.g. "Walk me through the [Project X] you led at [Company]."
4. "visionary" (1 question) — The Visionary / Future-focused. "Where do you see yourself in this firm in 3 years?" or similar, tailored to the seniority of the role (e.g. IC vs lead vs exec).

For EACH question provide:
- "category": one of "expert_check" | "cultural_fit" | "professional_story" | "visionary"
- "question": the question text
- "winningAnswer": Bespoke answer script using the SURGICAL STAR method (Situation, Task, Action, Result). MUST use a real-world example from the candidate's Experience section — specific project, company, or outcome. 2-5 sentences.
- "trap": Why the recruiter is asking (e.g. "They are testing your technical depth in React", "Checking if you take ownership").
- "motive": What they are actually looking for (e.g. "They aren't asking about your weakness; they are testing your self-awareness and growth mindset.", "They want to see how you align with company values.").
- "strategy": One short sentence — the strategy or tip for answering (e.g. "Lead with the result, then briefly give context.", "Use one concrete example from your resume.").

Also output "elevatorPitch": a 30-second "Tell me about yourself" script blending their resume achievements with their LinkedIn brand. This is the 100% guaranteed first question — put it first in your thinking.`;

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
    const unitCheck = await requireUnits(req, "INTERVIEW_PREP");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as Body;
    const prompt = buildPrompt(body);
    const humanize = Boolean(body.humanize);
    const systemContent = humanize ? `${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : SYSTEM;

    const groqKey = getGroqKey();
    const geminiKey = getGeminiKey();

    if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-70b-versatile",
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

    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        systemInstruction: systemContent,
      });
      const result = await model.generateContent([prompt]);
      const raw = result.response.text().trim();
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
