import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { validateAndDeduct } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const SYSTEM = `You are an expert career coach writing follow-up emails so candidates don't get ghosted. Professional, warm, strategic. Output only valid JSON with keys gentleCheckIn, valueAdd, closeTheLoop (each value = full email body; use \\n for line breaks).

gentleCheckIn: 48-hour nudge. Short, polite. Reiterate interest; ask if they need anything else. Sound like a real person — varied sentence length, no template phrasing.
valueAdd: 7-day follow-up. Suggest a solution or share a relevant insight. One or two paragraphs. Natural, human tone so it passes AI detection.
closeTheLoop: 14-day professional close. Timelines shift; reiterate interest; happy to be considered later. One or two paragraphs. Warm but not desperate.`;

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
    const body = (await req.json()) as Body;
    const jobDescription = sanitizeForAI(body.jobDescription);
    if (!jobDescription) {
      return NextResponse.json(
        { error: "Job description is required to generate follow-up emails." },
        { status: 400 }
      );
    }

    const humanize = Boolean(body.humanize);
    const unitCheck = await validateAndDeduct(req, "FOLLOW_UP", { humanize });
    if ("unitResponse" in unitCheck && unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;
    const prompt = buildPrompt(body);
    const systemContent = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;

    const groqKey = getGroqKey();
    const geminiKey = getGeminiKey();

    try {
      if (geminiKey) {
        const raw = await generateWithGeminiFailover(geminiKey, {
          prompt,
          systemInstruction: systemContent,
        });
        const out = parseResponse(raw);
        return NextResponse.json({ ...out, creditsRemaining });
      }
    } catch {
      // Fall through to Groq
    }

    if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
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
