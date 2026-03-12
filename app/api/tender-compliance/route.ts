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
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

export type ComplianceItem = {
  requirement: string;
  status: "Compliant" | "Partial" | "Gap";
  fix: string;
};

const PROMPT = `Compare the Tender Requirements against the Firm Profile.
Extract the 5 most critical technical or legal requirements.
For each requirement, determine if the firm is "Compliant", "Partial", or has a "Gap".
Provide a one-sentence fix to make the proposal stronger.
Return ONLY a JSON array: [{"requirement": "", "status": "Compliant" | "Partial" | "Gap", "fix": ""}].
No markdown, no extra text.`;

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as { tenderRequirements?: string; firmProfile?: string };
    const tenderRequirements = typeof body.tenderRequirements === "string" ? body.tenderRequirements : "";
    const firmProfile = typeof body.firmProfile === "string" ? body.firmProfile : "";

    if (!tenderRequirements.trim() || !firmProfile.trim()) {
      return NextResponse.json(
        { error: "Both Tender Requirements and Firm Profile are required." },
        { status: 400 }
      );
    }

    const cost = getCost("TENDER_COMPLIANCE");
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

    const geminiKey = getGeminiKey();
    const groqKey = getGroqKey();
    if (!geminiKey && !groqKey) throw new Error("GEMINI_API_KEY or GROQ_API_KEY required");

    const tender = sanitizeForAI(tenderRequirements) || "(No tender requirements.)";
    const profile = sanitizeForAI(firmProfile) || "(No firm profile.)";
    const prompt = `${PROMPT}\n\n---\n\nTender Requirements:\n${tender}\n\n---\n\nOur Firm's Profile:\n${profile}`;

    let raw: string;
    try {
      if (geminiKey) {
        raw = await generateWithGeminiFailover(geminiKey, { prompt });
      } else {
        throw new Error("No Gemini key");
      }
    } catch {
      if (!groqKey) throw new Error("GEMINI_API_KEY or GROQ_API_KEY required");
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MAIN_MODEL,
        temperature: 0.2,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim();
    }
    const text = (typeof raw === "string" ? raw : "").trim();
    if (!text) throw new Error("Gemini returned empty");

    let items: ComplianceItem[];
    try {
      const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "").trim());
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }

    items = items
      .filter(
        (x): x is { requirement: string; status: "Compliant" | "Partial" | "Gap"; fix?: string; suggestion?: string } =>
          x &&
          typeof x === "object" &&
          typeof (x as { requirement?: string }).requirement === "string" &&
          ((x as { status?: string }).status === "Compliant" || (x as { status?: string }).status === "Partial" || (x as { status?: string }).status === "Gap")
      )
      .map((x) => ({ requirement: x.requirement, status: x.status, fix: x.fix ?? x.suggestion ?? "" }));

    return NextResponse.json({
      items,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("Tender compliance API failed:", err);
    return NextResponse.json(
      { error: "Failed to run compliance check. Please try again." },
      { status: 500 }
    );
  }
}
