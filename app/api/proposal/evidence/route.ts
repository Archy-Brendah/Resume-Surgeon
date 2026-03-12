import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  getCreditsFromRequest,
  deductSurgicalUnits,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";

export type ResumeData = {
  experience?: string;
  projects?: string;
};

const SYSTEM = `You are an expert proposal writer. Your task: analyze a job description, search the candidate's Work Experience and Projects for the TWO most relevant matches, and write a "Why Choose Me" section using the STAR Method (Situation, Task, Action, Result).

Rules:
- Use first person ("I").
- Format each match as STAR:
  • Situation: Brief context (client/project type).
  • Task: What needed to be done.
  • Action: What I did.
  • Result: Concrete outcome with metrics (%, $, time saved, etc.). Clients love numbers.
- Prioritize metrics: percentages, dollar amounts, time reductions, scale improvements.
- Keep each STAR story to 2–4 sentences. No fluff.
- Output only the "Why Choose Me" paragraph(s)—no headings, no labels. Ready to paste into a proposal.`;

async function getRelevantEvidence(jobDescription: string, resumeData: ResumeData): Promise<string> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const experience = sanitizeForAI(resumeData.experience) || "(No work experience provided.)";
  const projects = sanitizeForAI(resumeData.projects) || "(No projects provided.)";
  const jd = sanitizeForAI(jobDescription) || "(No job description provided.)";

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: GROQ_MAIN_MODEL,
    temperature: 0.3,
    max_tokens: 600,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Job description:\n${jd}\n\nCandidate Work Experience:\n${experience}\n\nCandidate Projects:\n${projects}\n\nFind the TWO most relevant matches and write a "Why Choose Me" section using the STAR Method (Situation, Task, Action, Result). Emphasize metrics (%, $, time saved). Output only the paragraph(s), no headings.`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const text = (typeof raw === "string" ? raw : "").trim();
  if (!text) throw new Error("Groq returned empty");
  return text;
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as { jobDescription?: string; resumeData?: ResumeData };
    const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription : "";
    const resumeData = body.resumeData && typeof body.resumeData === "object" ? body.resumeData : {};

    const hasResume = (resumeData.experience?.trim() || resumeData.projects?.trim())?.length > 0;
    if (!jobDescription.trim() || !hasResume) {
      return NextResponse.json(
        { error: "Provide job description and resume experience or projects." },
        { status: 400 }
      );
    }

    const cost = getCost("PROPOSAL_EVIDENCE");
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

    const evidence = await getRelevantEvidence(jobDescription, resumeData);
    return NextResponse.json({
      evidence,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("Proposal evidence API failed:", err);
    return NextResponse.json(
      { error: "Failed to generate evidence. Please try again." },
      { status: 500 }
    );
  }
}
