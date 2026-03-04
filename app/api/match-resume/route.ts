import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits, getUserIdFromRequest, refundUnits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGroqKey } from "@/lib/ai-keys";

const MATCH_RATE_LIMIT = 15;

type MatchResumeBody = {
  resumeText: string;
  jobDescription: string;
  humanize?: boolean;
};

type GapReport = {
  criticalGaps: string[];
  optimizationGaps: string[];
  bonusMatches: string[];
};

type MatchResponse = {
  matchPercentage: number;
  skillAlignment: number;
  roleExperience: number;
  toneCulture: number;
  gapReport: GapReport;
  foundKeywords: string[];
  missingKeywords: string[];
  surgicalAdjustments: string[];
};

const GROQ_SYSTEM = `You are an expert ATS and recruiter analyst. Compare a candidate's RESUME against a JOB DESCRIPTION using this scoring rubric:

1. HARD SKILLS (technical tools, software, frameworks): How well does the resume match the JD's required/preferred technical skills?
2. SOFT SKILLS (leadership, communication, collaboration): Does the resume demonstrate the interpersonal qualities the JD asks for?
3. EXPERIENCE LEVEL: Do years and seniority in the resume align with what the role requires (e.g. "5+ years", "Senior", "Lead")?
4. INDUSTRY CONTEXT: Does the resume read like it belongs in this industry and role type?

You must respond with ONLY a single valid JSON object, no markdown or code fences, no explanation. Use this exact structure:
{
  "matchPercentage": <0-100 overall>,
  "skillAlignment": <0-100>,
  "roleExperience": <0-100>,
  "toneCulture": <0-100>,
  "gapReport": {
    "criticalGaps": ["gap1", "gap2"],
    "optimizationGaps": ["opt1", "opt2"],
    "bonusMatches": ["bonus1", "bonus2"]
  },
  "foundKeywords": ["keyword1", "keyword2"],
  "missingKeywords": ["missing1", "missing2"],
  "surgicalAdjustments": ["adjustment1", "adjustment2", "adjustment3"]
}

RULES:
- criticalGaps: Must-fix items to pass ATS (e.g. missing required skill, wrong level). 1-4 items.
- optimizationGaps: Changes that would make the candidate top 10% (e.g. add metric, reframe bullet). 1-4 items.
- bonusMatches: Strengths in the resume the JD didn't ask for. 0-3 items.
- surgicalAdjustments: Exactly 3 concrete, actionable sentences (e.g. "The JD emphasizes 'AWS'—ensure your Cloud experience mentions it explicitly.").
- foundKeywords: Important JD terms that appear in the resume. Max 20.
- missingKeywords: Important JD terms not in the resume. Max 20.
- All scores 0-100. Be strict but fair.`;

function extractJsonFromResponse(text: string): MatchResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as MatchResponse;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!checkRateLimit(userId, "MATCH", MATCH_RATE_LIMIT)) {
      return NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 },
      );
    }

    const unitCheck = await requireUnits(request, "MATCH");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await request.json()) as MatchResumeBody;
    const { resumeText = "", jobDescription = "", humanize = false } = body;

    const jdTrimmed = sanitizeForAI(jobDescription);
    const resumeTrimmed = sanitizeForAI(resumeText);

    if (!jdTrimmed) {
      return NextResponse.json(
        { error: "Job description is required" },
        { status: 400 }
      );
    }

    const apiKey = getGroqKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Match service not configured. Add GROQ_API_KEY to .env.local." },
        { status: 503 }
      );
    }

    const systemContent = humanize ? `${GROQ_SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : GROQ_SYSTEM;
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      temperature: 0.3,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `JOB DESCRIPTION:\n${jdTrimmed}\n\n---\nRESUME:\n${resumeTrimmed}\n\n---\nRespond with the single JSON object only.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = extractJsonFromResponse(raw);

    if (!parsed) {
      return NextResponse.json(
        { error: "Could not parse match analysis" },
        { status: 502 }
      );
    }

    const matchPercentage = Math.min(100, Math.max(0, Number(parsed.matchPercentage) ?? 0));
    const skillAlignment = Math.min(100, Math.max(0, Number(parsed.skillAlignment) ?? 0));
    const roleExperience = Math.min(100, Math.max(0, Number(parsed.roleExperience) ?? 0));
    const toneCulture = Math.min(100, Math.max(0, Number(parsed.toneCulture) ?? 0));

    const gapReport: GapReport = {
      criticalGaps: Array.isArray(parsed.gapReport?.criticalGaps) ? parsed.gapReport.criticalGaps.slice(0, 5) : [],
      optimizationGaps: Array.isArray(parsed.gapReport?.optimizationGaps) ? parsed.gapReport.optimizationGaps.slice(0, 5) : [],
      bonusMatches: Array.isArray(parsed.gapReport?.bonusMatches) ? parsed.gapReport.bonusMatches.slice(0, 5) : [],
    };

    return NextResponse.json({
      matchPercentage,
      skillAlignment,
      roleExperience,
      toneCulture,
      gapReport,
      foundKeywords: Array.isArray(parsed.foundKeywords) ? parsed.foundKeywords.slice(0, 30) : [],
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords.slice(0, 25) : [],
      surgicalAdjustments: Array.isArray(parsed.surgicalAdjustments) ? parsed.surgicalAdjustments.slice(0, 3) : [],
      creditsRemaining,
    });
  } catch (e) {
    console.error("match-resume error:", e);
    await refundUnits(request, 2);
    return NextResponse.json(
      { error: "Failed to analyze match" },
      { status: 500 }
    );
  }
}
