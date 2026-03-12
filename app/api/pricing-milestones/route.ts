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

export type MilestoneSuggestion = {
  task: string;
  timeline: string;
  cost_estimate: number;
};

const PROMPT = `Based on this job, suggest 3-4 logical project milestones (e.g., Phase 1: Research, Phase 2: Design). Return ONLY a JSON array of objects: [{"task": "string", "timeline": "string", "cost_estimate": 0}]. Use cost_estimate in Kenyan Shillings as a number.`;

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as { jobDescription?: string };
    const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription : "";

    if (!jobDescription.trim()) {
      return NextResponse.json(
        { error: "Job description is required." },
        { status: 400 }
      );
    }

    const cost = getCost("PRICING_MILESTONES");
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

    const apiKey = getGroqKey();
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const jd = sanitizeForAI(jobDescription) || "(No job description provided.)";

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MAIN_MODEL,
      temperature: 0.4,
      max_tokens: 512,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `Job description:\n${jd}\n\nReturn 3-4 milestones as a JSON array.` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const text = (typeof raw === "string" ? raw : "").trim();
    if (!text) throw new Error("Groq returned empty");

    let items: MilestoneSuggestion[];
    try {
      const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "").trim());
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }

    items = items.filter(
      (x): x is MilestoneSuggestion =>
        x &&
        typeof x === "object" &&
        typeof x.task === "string" &&
        typeof x.timeline === "string" &&
        (typeof x.cost_estimate === "number" || typeof (x as { costKsh?: string }).costKsh === "string")
    ).map((x) => ({
      task: x.task,
      timeline: x.timeline,
      cost_estimate: typeof x.cost_estimate === "number" ? x.cost_estimate : parseFloat(String((x as { costKsh?: string }).costKsh).replace(/[^0-9.-]/g, "")) || 0,
    }));

    return NextResponse.json({
      milestones: items,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("Pricing milestones API failed:", err);
    return NextResponse.json(
      { error: "Failed to suggest milestones. Please try again." },
      { status: 500 }
    );
  }
}
