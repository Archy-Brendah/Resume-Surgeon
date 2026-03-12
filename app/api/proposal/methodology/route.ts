import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  deductSurgicalUnits,
  getCreditsFromRequest,
  refundUnits,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";
import { sanitizeForAI } from "@/lib/sanitize";

const METHODOLOGY_PROMPT = `Act as a Lead Project Manager. Look at the Tender Title and Industry. Generate a 4-Phase Implementation Plan that is context-aware: adapt the language to the sector (e.g. ICT, construction, health, finance, government), but keep the phase titles universal and professional.

Output exactly 4 phases with these exact titles, in this exact order. For each phase, output 2–3 technical bullet points. No other headings or paragraphs.

Phase 1: Mobilization & Stakeholder Alignment (The Start)
• [2-3 technical bullet points]
Phase 2: Technical Execution & Implementation (The Middle)
• [2-3 technical bullet points]
Phase 3: Quality Assurance & Standards Testing (The Audit)
• [2-3 technical bullet points]
Phase 4: Commissioning, Handover & Training (The Finish)
• [2-3 technical bullet points]

Use concise, professional language. Each bullet should be a clear deliverable or activity that could appear in a formal tender proposal.`;

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const cost = getCost("PROPOSAL_METHODOLOGY");
  const guard = await checkGlobalGuard(request);
  if (!guard.allowed) {
    return NextResponse.json(
      { error: guard.message ?? "Daily AI limit reached. Please try again later." },
      { status: 503 }
    );
  }

  const { credits } = await getCreditsFromRequest(request);
  if (credits < cost) {
    return NextResponse.json(REFILL_PAYLOAD, { status: 402 });
  }

  const deductResult = await deductSurgicalUnits(request, cost);
  if (!deductResult.ok || deductResult.creditsRemaining < 0) {
    return NextResponse.json(REFILL_PAYLOAD, { status: 402 });
  }

  let body: { jobDescription?: string; tenderTitle?: string; industry?: string };
  try {
    body = await request.json();
  } catch {
    await refundUnits(request, cost);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobDescription = sanitizeForAI(body?.jobDescription ?? "");
  const tenderTitle = typeof body?.tenderTitle === "string" ? body.tenderTitle.trim() : "";
  const industry = typeof body?.industry === "string" ? body.industry.trim() : "";
  const hasContext = (jobDescription && jobDescription.length >= 20) || (tenderTitle && tenderTitle.length >= 2);
  if (!hasContext) {
    await refundUnits(request, cost);
    return NextResponse.json(
      { error: "Provide a tender title or scope/description (at least 20 characters for scope)." },
      { status: 400 }
    );
  }

  const geminiKey = getGeminiKey();
  const groqKey = getGroqKey();
  if (!geminiKey && !groqKey) {
    await refundUnits(request, cost);
    return NextResponse.json({ error: "AI service not configured." }, { status: 503 });
  }

  const context = [
    tenderTitle ? `Tender Title: ${tenderTitle}` : null,
    industry ? `Industry: ${industry}` : null,
    jobDescription ? `Context / Scope:\n${jobDescription.slice(0, 8000)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const prompt = `${METHODOLOGY_PROMPT}\n\n---\n\n${context}`;
  let text: string;
  try {
    if (geminiKey) {
      text = await generateWithGeminiFailover(geminiKey, {
        prompt,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      });
    } else {
      throw new Error("No Gemini key");
    }
  } catch {
    if (!groqKey) throw new Error("AI service not configured");
    const groq = new Groq({ apiKey: groqKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MAIN_MODEL,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        { role: "system", content: METHODOLOGY_PROMPT },
        { role: "user", content: prompt },
      ],
    });
    text = (completion.choices[0]?.message?.content ?? "").trim();
  }

  if (!text) {
    await refundUnits(request, cost);
    return NextResponse.json({ error: "AI returned empty response. Try again." }, { status: 502 });
  }
  return NextResponse.json({
    methodology: text,
    creditsRemaining: deductResult.creditsRemaining,
  });
}
