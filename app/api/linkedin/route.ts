import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const SYSTEM =
  "You are a LinkedIn personal branding expert. Generate SEO-friendly, recruiter-focused profile content. Output only valid JSON with the exact keys requested; no markdown. Write the About and headlines in a natural, human voice — varied sentence length and rhythm so content reads like a real profile and performs well on AI detection.";

type LinkedInBody = {
  fullName?: string;
  targetRole?: string;
  currentRole?: string;
  careerGoals?: string;
  experience?: string;
  skills?: string;
  sharpened?: string;
  humanize?: boolean;
};

type LinkedInResponse = {
  headlines: string[];
  about: string;
  topSkills: string[];
  featuredStrategy: string;
};

function buildPrompt(body: LinkedInBody): string {
  const name = sanitizeShortField(body.fullName, 200) || "the professional";
  const targetRole = sanitizeShortField(body.targetRole, 200) || "(target role not provided)";
  const currentRole = sanitizeShortField(body.currentRole || body.targetRole, 200) || "(current role not provided)";
  const careerGoals = sanitizeForAI(body.careerGoals) || "(career goals not provided)";
  const experience = sanitizeForAI(body.experience) || "(No experience provided.)";
  const skills = sanitizeForAI(body.skills) || "(No skills provided.)";
  const sharpened = sanitizeForAI(body.sharpened) || "(No refined bullets provided.)";

  return `You are optimizing the LinkedIn profile for: ${name}

Current role: ${currentRole}
Target role / career direction: ${targetRole}
Career goals: ${careerGoals}

Experience (raw or refined bullets):
${experience}

${sharpened !== "(No refined bullets provided.)" ? `Refined resume bullets (use these for authority):\n${sharpened}\n` : ""}

Skills: ${skills}

---

Generate LinkedIn profile content. Output a single JSON object with these exact keys (no other keys, no code fences):

1. "headlines": An array of exactly 3 strings. Each is a "High-Authority Headline" (max ~120 characters) — SEO-optimized with relevant keywords for recruiters and ATS. Mix of role-focused, value-focused, and credibility-focused. No quotes inside the strings that would break JSON.

2. "about": A single string: the "Story-Driven About" section using the Hook-Value-CTA framework. 2–4 short paragraphs: Hook (grab attention, one compelling line), Value (what you do and who you help, with proof points), CTA (what you're open to — e.g. "Open to X" or "Let's connect for Y"). Use line breaks (\\n) for paragraphs. Professional but personable. ~300–500 words total.

3. "topSkills": An array of exactly 5 strings. The top 5 skills to list on LinkedIn for maximum ATS and recruiter search visibility. Single words or short phrases (e.g. "Product Strategy", "Cross-functional Leadership").

4. "featuredStrategy": A single string (2–4 sentences) advising what the user should pin in their LinkedIn "Featured" section: what type of links, projects, or media to add and why, for maximum impact.

Output only the JSON object.`;
}

async function callGemini(prompt: string, humanize: boolean): Promise<LinkedInResponse> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const systemInstruction = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;
  const text = await generateWithGeminiFailover(apiKey, { prompt, systemInstruction });
  return parseResponse(text);
}

async function callGroq(prompt: string, humanize: boolean): Promise<LinkedInResponse> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const systemContent = humanize ? `${BASE_HUMAN_LIKE}\n\n${SYSTEM}\n\n${HUMANIZE_INSTRUCTION}` : `${BASE_HUMAN_LIKE}\n\n${SYSTEM}`;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.4,
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: prompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const text = (typeof raw === "string" ? raw : "").trim();
  return parseResponse(text);
}

function parseResponse(text: string): LinkedInResponse {
  let parsed: Record<string, unknown>;
  try {
    const cleaned = text.replace(/^```json?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x))) : [];

  const headlines = arr(parsed.headlines).slice(0, 3);
  const topSkills = arr(parsed.topSkills).slice(0, 5);

  return {
    headlines: headlines.length ? headlines : ["Professional in " + (parsed.targetRole || "your field")],
    about: str(parsed.about) || "Generate your About section to see it here.",
    topSkills: topSkills.length ? topSkills : ["Leadership", "Strategy", "Communication", "Problem Solving", "Collaboration"],
    featuredStrategy: str(parsed.featuredStrategy) || "Pin 1–2 key project links or articles that demonstrate your expertise.",
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LinkedInBody;
    const humanize = Boolean(body.humanize);
    const prompt = buildPrompt(body);
    try {
      const out = await callGemini(prompt, humanize);
      return NextResponse.json(out);
    } catch {
      const out = await callGroq(prompt, humanize);
      return NextResponse.json(out);
    }
  } catch (err: unknown) {
    console.error("LinkedIn API failed:", err);
    return NextResponse.json(
      { error: "Failed to generate LinkedIn content" },
      { status: 500 }
    );
  }
}
