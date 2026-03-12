import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { validateAndDeduct } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGroqKey } from "@/lib/ai-keys";

const SYSTEM = `You are a LinkedIn profile expert. Generate SEO-friendly, recruiter-focused content. Use the candidate's resume and target job description. Output only valid JSON with the exact keys requested; no markdown. Write headlines and About in a natural, human voice — varied sentence length and rhythm so it doesn't read like AI.`;

type Body = {
  sharpenedResume?: string;
  jobDescription?: string;
  fullName?: string;
  targetRole?: string;
  currentRole?: string;
  careerGoals?: string;
  experience?: string;
  skills?: string;
  humanize?: boolean;
};

type Output = {
  headlines: string[];
  about: string;
  featuredProjects: string[];
  topSkills: string[];
};

function buildPrompt(body: Body): string {
  const resume = [sanitizeForAI(body.sharpenedResume), sanitizeForAI(body.experience)].filter(Boolean).join("\n\n");
  const jd = sanitizeForAI(body.jobDescription) || "(No job description provided.)";
  const name = sanitizeShortField(body.fullName, 200) || "the professional";
  const targetRole = sanitizeShortField(body.targetRole, 200) || "";
  const currentRole = sanitizeShortField(body.currentRole || body.targetRole, 200) || "";
  const careerGoals = sanitizeForAI(body.careerGoals) || "";

  return `RESUME / EXPERIENCE:
${resume || "(None provided.)"}

TARGET JOB DESCRIPTION:
${jd}

Candidate: ${name}
Current/target role: ${currentRole || targetRole}
Career goals: ${careerGoals || "(Not specified)"}

---

Generate LinkedIn Surgeon content. Respond with a single JSON object only (no code fences):

1. "headlines": Array of exactly 3 strings. Each is a High-Authority Headline (max ~120 chars), SEO-optimized for recruiters and ATS. Use keywords from the JD and resume. Mix: role-focused, value-focused, credibility-focused.

2. "about": One string: the Story-Driven About (Hook-Value-Proof-CTA). Hook: one compelling opening. Value: what you do and who you help. Proof: key results or credibility. CTA: what you're open to. Use \\n for paragraph breaks. Write in a natural, human voice — vary sentence length; avoid sounding like a template. ~250-400 words.

3. "featuredProjects": Array of exactly 5 strings. Each string is a short "Featured" project or achievement description (1-2 sentences) that an impact-focused professional would pin on LinkedIn. Draw from the resume; make each sound like a mini case study with outcome. Variety: different types of impact (revenue, scale, leadership, product, etc.).

4. "topSkills": Array of exactly 5 strings. The top 5 skills for LinkedIn (e.g. "Product Strategy", "Cross-functional Leadership") for ATS and recruiter search.

Output only the JSON object.`;
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
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x))) : [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return {
    headlines: arr(parsed.headlines).slice(0, 3),
    about: str(parsed.about) || "",
    featuredProjects: arr(parsed.featuredProjects).slice(0, 5),
    topSkills: arr(parsed.topSkills).slice(0, 5),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const humanize = Boolean(body.humanize);
    const unitCheck = await validateAndDeduct(req, "LINKEDIN", { humanize });
    if ("unitResponse" in unitCheck && unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;
    const apiKey = getGroqKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "LinkedIn Surgeon not configured. Add GROQ_API_KEY to .env.local." },
        { status: 503 }
      );
    }

    const systemContent = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.35,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: buildPrompt(body) },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const out = parseResponse(raw);

    if (!out.headlines.length) {
      out.headlines = ["Senior Professional | Strategy & Leadership", "Driving impact through leadership and execution", "Open to new opportunities"];
    }
    if (!out.about) out.about = "Generate your About section to see your story-driven profile here.";
    if (!out.featuredProjects.length) {
      out.featuredProjects = ["Key project or achievement 1", "Key project or achievement 2", "Key project or achievement 3", "Key project or achievement 4", "Key project or achievement 5"];
    }
    if (!out.topSkills.length) out.topSkills = ["Leadership", "Strategy", "Communication", "Problem Solving", "Collaboration"];

    return NextResponse.json({ ...out, creditsRemaining });
  } catch (err) {
    console.error("linkedin-surgeon error:", err);
    return NextResponse.json(
      { error: "Failed to generate LinkedIn content" },
      { status: 500 }
    );
  }
}
