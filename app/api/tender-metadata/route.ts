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

const PROMPT = `Extract tender metadata from this tender/RFP document. Return ONLY a JSON object with this exact structure:
{
  "tender_reference": "string - tender number, ref no, or contract number (e.g. TDR-2024-001, KRA/ICT/2024/001)",
  "tender_name": "string - full title or name of the tender/procurement",
  "submitted_to": "string - procuring entity, ministry, department, or organization name",
  "scope_summary": "string - brief 2-4 sentence summary of the scope of work from the document",
  "client_name": "string - procuring entity or client name (same as submitted_to if applicable)",
  "methodology": "string - brief description of approach, methodology, or delivery framework mentioned in the tender",
  "mission": "string - objectives, goals, or mission stated in the tender",
  "success_metrics": "string - evaluation criteria, KPIs, or definition of success mentioned",
  "team_size": "string - minimum team, key personnel requirements, or team composition if specified (e.g. '5 key personnel', 'Project Manager + 3 specialists')"
}
- tender_reference: Look for "Tender No", "Ref No", "Contract No", "Tender Reference", "Bid number" etc.
- tender_name: The main title or subject of the tender.
- submitted_to: The entity issuing the tender (e.g. "Ministry of ICT", "Procurement Manager, Kenya Revenue Authority").
- scope_summary: A concise summary of what the tender/procurement is for.
- client_name: Procuring entity or client. Use submitted_to value if no separate client is named.
- methodology: Approach, methodology, or delivery framework from scope of work or requirements.
- mission: Project objectives, goals, or mission from the tender document.
- success_metrics: Evaluation criteria, KPIs, or success indicators.
- team_size: Key personnel or team requirements if specified.
If a field cannot be determined, use empty string. No markdown, no code blocks, only the JSON object.`;

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

    const cost = getCost("TENDER_METADATA");
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
    const excerpt = rawText.slice(0, 6000);

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
    const prompt = `${PROMPT}\n\n---\n\nTender document:\n${text}`;

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
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim();
    }
    const responseText = (typeof raw === "string" ? raw : "").trim();
    if (!responseText) throw new Error("AI returned empty");

    const jsonStr = responseText
      .replace(/^```[\w]*\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(jsonStr) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "AI did not return valid JSON." }, { status: 500 });
    }

    const obj = parsed as Record<string, unknown>;
    const tender_reference = typeof obj.tender_reference === "string" ? obj.tender_reference.trim() : "";
    const tender_name = typeof obj.tender_name === "string" ? obj.tender_name.trim() : "";
    const submitted_to = typeof obj.submitted_to === "string" ? obj.submitted_to.trim() : "";
    const scope_summary = typeof obj.scope_summary === "string" ? obj.scope_summary.trim() : "";
    const client_name = typeof obj.client_name === "string" ? obj.client_name.trim() : "";
    const methodology = typeof obj.methodology === "string" ? obj.methodology.trim() : "";
    const mission = typeof obj.mission === "string" ? obj.mission.trim() : "";
    const success_metrics = typeof obj.success_metrics === "string" ? obj.success_metrics.trim() : "";
    const team_size = typeof obj.team_size === "string" ? obj.team_size.trim() : "";

    return NextResponse.json({
      tender_reference,
      tender_name,
      submitted_to,
      scope_summary,
      client_name,
      methodology,
      mission,
      success_metrics,
      team_size,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("tender-metadata error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to extract tender metadata." },
      { status: 500 }
    );
  }
}
