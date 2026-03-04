import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";

const SYSTEM = `You are an expert career coach and follow-up email writer. You help candidates avoid being "ghosted" after applying by writing professional, warm, and strategic follow-up emails tailored to the specific job and company.

Output only valid JSON with exactly these three keys (each value is the full email body as a single string; use \\n for line breaks within the email):
- "gentleCheckIn": The 48-Hour Gentle Nudge. Short, polite, one brief paragraph. Reference that they applied recently, reiterate interest in the role, and ask if there's any additional information they can provide. No pressure. Professional but human.
- "valueAdd": The 7-Day Value-Add. Slightly longer. They're following up and suggesting a solution to a problem mentioned in the JD, or sharing a relevant project/insight that shows continued engagement. One or two short paragraphs. Clear subject-line suggestion in the first line if possible, then the body.
- "closeTheLoop": The 14-Day Professional Close. Professional and graceful final check-in. Acknowledge that timelines shift, reiterate interest once more, and say they're happy to be considered for future opportunities. Keeps the door open without sounding desperate. One or two short paragraphs.`;

type Body = {
  jobDescription: string;
  fullName?: string;
  targetRole?: string;
  companyName?: string;
  resumeSummary?: string;
  humanize?: boolean;
};

type Output = {
  gentleCheckIn: string;
  valueAdd: string;
  closeTheLoop: string;
};

function buildPrompt(body: Body): string {
  const jd = sanitizeForAI(body.jobDescription) || "(No job description provided.)";
  const name = sanitizeShortField(body.fullName, 200) || "the candidate";
  const role = sanitizeShortField(body.targetRole, 200) || "the role";
  const company = sanitizeShortField(body.companyName, 200) || "the company";
  const summary = sanitizeForAI(body.resumeSummary) || "(No resume summary provided.)";

  return `JOB DESCRIPTION:
${jd}

CANDIDATE NAME: ${name}
TARGET ROLE: ${role}
COMPANY NAME: ${company}
BRIEF RESUME SUMMARY (for context): ${summary}

---

Generate the three follow-up emails as specified. Output only the JSON object with keys: gentleCheckIn, valueAdd, closeTheLoop. Each value is the full email body text (use \\n for line breaks). No markdown code fences.`;
}

function parseResponse(text: string): Output {
  const match = text.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "").trim();
  return {
    gentleCheckIn: str(parsed.gentleCheckIn) || "Generate follow-up emails to see the 48-hour check-in here.",
    valueAdd: str(parsed.valueAdd) || "Generate follow-up emails to see the 7-day value-add here.",
    closeTheLoop: str(parsed.closeTheLoop) || "Generate follow-up emails to see the 14-day close-the-loop here.",
  };
}

export async function POST(req: Request) {
  try {
    const unitCheck = await requireUnits(req, "FOLLOW_UP");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as Body;
    const jobDescription = sanitizeForAI(body.jobDescription);
    if (!jobDescription) {
      return NextResponse.json(
        { error: "Job description is required to generate follow-up emails." },
        { status: 400 }
      );
    }

    const humanize = Boolean(body.humanize);
    const prompt = buildPrompt(body);
    const systemContent = humanize ? `${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : SYSTEM;

    const groqKey = getGroqKey();
    const geminiKey = getGeminiKey();

    if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-70b-versatile",
        temperature: 0.4,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: prompt },
        ],
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      const out = parseResponse(raw);
      return NextResponse.json({ ...out, creditsRemaining });
    }

    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        systemInstruction: systemContent,
      });
      const result = await model.generateContent([prompt]);
      const raw = result.response.text().trim();
      const out = parseResponse(raw);
      return NextResponse.json({ ...out, creditsRemaining });
    }

    return NextResponse.json(
      { error: "Follow-up email service not configured (set GROQ_API_KEY or GEMINI_API_KEY)." },
      { status: 503 }
    );
  } catch (err) {
    console.error("follow-up-emails error:", err);
    return NextResponse.json(
      { error: "Failed to generate follow-up emails." },
      { status: 500 }
    );
  }
}
