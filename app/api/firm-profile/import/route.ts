import { NextResponse } from "next/server";
import { extractTextFromPDF } from "@/lib/pdf-extract";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  getCreditsFromRequest,
  deductSurgicalUnits,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import Groq from "groq-sdk";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

export type PortfolioImportResult = {
  company_name: string;
  bio: string;
  core_services: string[];
  past_projects: Array<{ title: string; client: string; year: string; results: string }>;
  methodology?: string;
  mission?: string;
  success_metrics?: string;
  team_size?: string;
};

const PROMPT = `Extract firm/company information from this document. Return ONLY a JSON object with this exact structure:
{
  "company_name": "string or empty",
  "bio": "string - company description, expertise, certifications, value proposition",
  "core_services": ["string", "string"],
  "past_projects": [
    { "title": "string", "client": "string", "year": "string", "results": "string (e.g. Increased revenue by 20%)" }
  ],
  "methodology": "string - firm's delivery approach, methodology, or process (e.g. Agile, Waterfall, phased approach)",
  "mission": "string - company mission, vision, or primary goal",
  "success_metrics": "string - how the firm measures success, typical client outcomes, or KPIs",
  "team_size": "string - team size or composition (e.g. '15 specialists', 'Project Manager + 5 engineers')"
}
- company_name: The firm or company name.
- bio: A concise company bio (2-5 sentences).
- core_services: Array of services (e.g. ICT, Civil Works, Consulting, Software Development).
- past_projects: Array of past projects/case studies. Each has title, client, year, and results (quantified outcomes preferred).
- methodology: Firm's delivery methodology or approach from the document.
- mission: Company mission or vision statement.
- success_metrics: How success is measured or typical client outcomes.
- team_size: Team size or composition if mentioned.
If a field cannot be determined, use empty string or empty array. No markdown, no code blocks, only the JSON object.`;

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No PDF file provided." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
    }

    const cost = getCost("PORTFOLIO_IMPORT");
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

    const arrayBuffer = await file.arrayBuffer();
    const rawText = await extractTextFromPDF(arrayBuffer);
    const excerpt = rawText.slice(0, 5000);

    if (!excerpt.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from the PDF." },
        { status: 400 }
      );
    }

    const geminiKey = getGeminiKey();
    const groqKey = getGroqKey();
    if (!geminiKey && !groqKey) {
      return NextResponse.json({ error: "AI service not configured." }, { status: 503 });
    }

    const text = sanitizeForAI(excerpt) || excerpt;
    const prompt = `${PROMPT}\n\n---\n\nDocument:\n${text}`;

    let raw: string;
    try {
      if (geminiKey) {
        raw = await generateWithGeminiFailover(geminiKey, { prompt });
      } else {
        throw new Error("No Gemini key");
      }
    } catch {
      if (!groqKey) throw new Error("AI service not configured");
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MAIN_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: `Document:\n${text}` },
        ],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim();
    }
    const responseText = (typeof raw === "string" ? raw : "").trim();
    if (!responseText) throw new Error("Gemini returned empty");

    const jsonStr = responseText
      .replace(/^```[\w]*\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(jsonStr) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "AI did not return valid JSON." }, { status: 500 });
    }

    const obj = parsed as Record<string, unknown>;
    const company_name = typeof obj.company_name === "string" ? obj.company_name : "";
    const bio = typeof obj.bio === "string" ? obj.bio : "";
    const rawServices = Array.isArray(obj.core_services) ? obj.core_services : [];
    const core_services = rawServices
      .map((s) => (typeof s === "string" ? s : String(s ?? "")).trim())
      .filter(Boolean);
    const rawProjects = Array.isArray(obj.past_projects) ? obj.past_projects : [];
    const past_projects = rawProjects
      .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
      .map((p) => ({
        title: String(p.title ?? ""),
        client: String(p.client ?? ""),
        year: String(p.year ?? ""),
        results: String(p.results ?? ""),
      }))
      .filter((p) => p.title.trim() || p.client.trim() || p.results.trim());
    const methodology = typeof obj.methodology === "string" ? obj.methodology.trim() : "";
    const mission = typeof obj.mission === "string" ? obj.mission.trim() : "";
    const success_metrics = typeof obj.success_metrics === "string" ? obj.success_metrics.trim() : "";
    const team_size = typeof obj.team_size === "string" ? obj.team_size.trim() : "";

    const data: PortfolioImportResult = {
      company_name,
      bio,
      core_services,
      past_projects,
      methodology: methodology || undefined,
      mission: mission || undefined,
      success_metrics: success_metrics || undefined,
      team_size: team_size || undefined,
    };

    return NextResponse.json({
      ...data,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("firm-profile import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import portfolio." },
      { status: 500 }
    );
  }
}
