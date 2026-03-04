import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";

const SYSTEM = `You are a networking expert. Write short LinkedIn DMs (connection request or InMail) for a specific role. Each message must be:
- Maximum 200 characters (strict — count spaces and punctuation).
- Professional, warm, and specific to the role/company.
- No generic fluff. One clear value or hook.
- Suitable for the LinkedIn message character limit.

Output only valid JSON with exactly these three keys (each value is one message string):
- "recruiter": Message tailored for a Recruiter (emphasize fit, availability, one key strength).
- "peer": Message for a Peer (for a referral request — friendly, mention you're applying, ask if they can refer or share advice).
- "hiringManager": Message for the Hiring Manager (direct, show you've read the role, one concrete value you'd bring).`;

type Body = {
  jobDescription?: string;
  fullName?: string;
  targetRole?: string;
  companyName?: string;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 3) + "..." : t;
}

export async function POST(req: Request) {
  try {
    const unitCheck = await requireUnits(req, "LINKEDIN_DM");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as Body;
    const jd = sanitizeForAI(body.jobDescription) || "(Role not specified.)";
    const name = sanitizeShortField(body.fullName, 200) || "the candidate";
    const role = sanitizeShortField(body.targetRole, 200) || "the role";
    const company = sanitizeShortField(body.companyName, 200) || "the company";

    const prompt = `JOB DESCRIPTION:
${jd}

CANDIDATE NAME: ${name}
TARGET ROLE: ${role}
COMPANY: ${company}

Generate three LinkedIn DM variants (max 200 characters each). Output only a JSON object with keys: "recruiter", "peer", "hiringManager". Each value is the message text only. No markdown.`;

    const groqKey = getGroqKey();
    const geminiKey = getGeminiKey();

    const parse = (raw: string) => {
      const m = raw.match(/\{[\s\S]*\}/);
      let o: Record<string, string> = {};
      if (m) try { o = JSON.parse(m[0]) as Record<string, string>; } catch {}
      return {
        recruiter: truncate(String(o.recruiter || ""), 200),
        peer: truncate(String(o.peer || ""), 200),
        hiringManager: truncate(String(o.hiringManager || ""), 200),
      };
    };

    if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-70b-versatile",
        temperature: 0.4,
        max_tokens: 512,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      });
      const raw = (completion.choices[0]?.message?.content ?? "").trim();
      return NextResponse.json({ ...parse(raw), creditsRemaining });
    }

    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", systemInstruction: SYSTEM });
      const result = await model.generateContent([prompt]);
      const raw = result.response.text().trim();
      return NextResponse.json({ ...parse(raw), creditsRemaining });
    }

    return NextResponse.json(
      { error: "LinkedIn DM service not configured (set GROQ_API_KEY or GEMINI_API_KEY)." },
      { status: 503 }
    );
  } catch (err) {
    console.error("linkedin-dm error:", err);
    return NextResponse.json({ error: "Failed to generate LinkedIn DM." }, { status: 500 });
  }
}
