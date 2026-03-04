import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { requireUnits } from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey } from "@/lib/ai-keys";

const SYSTEM =
  "You are a top-tier sales consultant who writes high-value, authoritative proposals. Write in a confident, professional tone. Structure output exactly as requested. Use clear headings and concise paragraphs. No fluff.";

const FIRM_SYSTEM =
  'You are a world-class B2B Sales Strategist. You write high-ticket "Power Proposals" using The Challenger Sale framework. Apply all three moves: (1) TEACH — offer a unique, reframing insight that changes how the client sees their situation; (2) TAILOR — make the message specific to their mission, metrics, and world; (3) TAKE CONTROL — confidently prescribe your methodology as the answer, surface the cost of inaction, and lead the conversation to a clear recommendation. Tone: authoritative, institutional, high-value. Always use "We" and "Our Team."';

type ProposalBody = {
  type?: "freelancer" | "firm";
  clientName?: string;
  projectScope?: string;
  painPoints?: string;
  pricing?: string;
  skills?: string;
  caseStudies?: string;
  fullName?: string;
  companyName?: string;
  teamSize?: string;
  methodology?: string;
  firmIdentity?: string;
  mission?: string;
  successMetrics?: string;
  strategyTone?: "conservative" | "bold";
  humanize?: boolean;
};

type RiskMitigation = { risk: string; response: string };
type RoadmapMilestones = { discovery: string[]; surgery: string[]; postOp: string[] };

type ProposalSections = {
  executiveSummary: string;
  strategicDiagnosis: string;
  proprietaryProcess: string;
  timelineDeliverables: string;
  investment: string;
  riskMitigations?: RiskMitigation[];
  costOfInaction?: string;
  successOutcome?: string;
  totalValueDelivered?: string;
  roadmapMilestones?: RoadmapMilestones;
  nextSteps?: string;
  projectKickoffChecklist?: string[];
};

function buildFreelancerPrompt(body: ProposalBody): string {
  const client = sanitizeShortField(body.clientName, 200) || "the client";
  const scope = sanitizeForAI(body.projectScope) || "(No project scope provided.)";
  const pain = sanitizeForAI(body.painPoints) || "(No pain points provided.)";
  const pricing = sanitizeForAI(body.pricing) || "(Pricing to be discussed.)";
  const skills = sanitizeForAI(body.skills) || "(No skills provided.)";
  const caseStudies = sanitizeForAI(body.caseStudies) || "(No case studies provided.)";
  const name = sanitizeShortField(body.fullName, 200) || "I";

  return `Client or project name: ${client}

Project scope:
${scope}

Client pain points:
${pain}

Proposed pricing / investment (use this in the Investment section):
${pricing}

Consultant's skills and background:
${skills}

Relevant case studies or proof from resume (use these to back the Solution):
${caseStudies}

---

Write a 5-section executive proposal for an INDIVIDUAL FREELANCER. Use first person singular ("I") throughout. Emphasize: personal expertise, speed, and direct communication. Output valid JSON only, with these exact keys (each value is a string of markdown or plain text):

1. "executiveSummary": A punchy 1–2 paragraph hook that reframes the client's problem and positions you as the solution.

2. "strategicDiagnosis": 1–3 short paragraphs that start with "I understand your current challenge is [X]..." — reflect their pain points and show you've listened.

3. "proprietaryProcess": 2–3 paragraphs that explain \"how I work\" — your repeatable process, stages, or framework. Reference specific skills and the case studies above.

4. "timelineDeliverables": A structured 3-phase delivery plan. Use clear phase names (e.g. Phase 1: Discovery & Scope, Phase 2: Execution, Phase 3: Handoff & Review). For each phase give 2–3 bullet points and a duration or milestone. Include both activities and concrete deliverables.

5. "investment": A short "Pricing & Next Steps" section. Include the pricing they provided, payment terms if appropriate, and a clear call to action (e.g. "To proceed, reply by [X] or schedule a call...").

Sign the proposal as ${name}. Output only the JSON object.`;
}

function buildFirmPrompt(body: ProposalBody): string {
  const client = sanitizeShortField(body.clientName, 200) || "the client";
  const scope = sanitizeForAI(body.projectScope) || "(No project scope provided.)";
  const pain = sanitizeForAI(body.painPoints) || "(No pain points provided.)";
  const pricing = sanitizeForAI(body.pricing) || "(Pricing to be discussed.)";
  const skills = sanitizeForAI(body.skills) || "(No skills provided.)";
  const caseStudies = sanitizeForAI(body.caseStudies) || "(No case studies provided.)";
  const company = sanitizeShortField(body.companyName, 200) || "Our Firm";
  const teamSize = sanitizeShortField(body.teamSize, 100) || "";
  const methodology = sanitizeForAI(body.methodology) || "Strategy, Execution, and Support.";
  const name = sanitizeShortField(body.fullName, 200) || "Our Team";
  const firmIdentity = sanitizeForAI(body.firmIdentity) || "(No firm identity provided.)";
  const mission = sanitizeForAI(body.mission) || "(No mission provided.)";
  const successMetrics = sanitizeForAI(body.successMetrics) || "(No success metrics provided.)";
  const tone = body.strategyTone === "bold" ? "Bold/Disruptive" : "Conservative/Safe";
  const toneInstruction =
    body.strategyTone === "bold"
      ? "Write in a bold, disruptive tone: challenge the status quo, use strong language, and position the firm as the only clear choice. Be provocative where appropriate."
      : "Write in a conservative, safe tone: reassuring, risk-aware, and professionally measured. Emphasize reliability and mitigation of risk.";

  return `Client or project name: ${client}

Project scope:
${scope}

Client pain points:
${pain}

Proposed pricing / investment (use this in the Investment section):
${pricing}

Team skills and background:
${skills}

Relevant case studies or proof (use these to back the Solution):
${caseStudies}

Firm name: ${company}
Firm identity (e.g. Creative Agency, SaaS Dev Shop): ${firmIdentity}
Team size (if provided): ${teamSize}
Our methodology (brief): ${methodology}
Client mission / primary goal:
${mission}

Client success metrics / definition of a win:
${successMetrics}

---

Strategy tone: ${tone}. ${toneInstruction}

Write an ELITE "Power Proposal" for a PROFESSIONAL FIRM. Use first person plural ("We") throughout. Apply Challenger: TEACH, TAILOR, TAKE CONTROL. Emphasize "The ${company} Process" and "Our Team's" experience. Output valid JSON only with these exact keys:

1. "executiveSummary": Boardroom hook. Reframe their situation; tie to mission and success metrics. Preview the transformation.

2. "strategicDiagnosis": Deep diagnosis. "We understand your current challenge is [X]..." Spell out risks and cost of inaction in concrete terms.

3. "proprietaryProcess": "The ${company} Process" — Strategy, Execution, Optimization, Support. Be prescriptive.

4. "timelineDeliverables": Use this format for table parsing:
Phase 1: [Name] | [Timeframe, e.g. Weeks 1-2]
• Deliverable one
• Deliverable two
Phase 2: [Name] | [Timeframe]
• ...
Phase 3: [Name] | [Timeframe]
• ...

5. "investment": High-ticket close. Anchor value, cost of inaction, investment and add-ons, clear CTA.

6. "riskMitigations": Array of exactly 3 objects. Analyze the project type and list 3 potential risks (e.g. "Scope Creep", "Integration Delays", "Stakeholder Misalignment"). For each, provide our firm's "Surgical Response" to prevent or mitigate it. Format: [{"risk":"Risk name","response":"Our concrete response"}, ...]

7. "costOfInaction": 1-2 sentences. What happens if the client does nothing? (Revenue loss, missed opportunity, competitive risk — be specific.)

8. "successOutcome": 1-2 sentences. What does success look like after this project? Tie to their success metrics.

9. "totalValueDelivered": One short phrase or sentence summarizing total value (e.g. "Estimated 20% efficiency gain and $X in cost avoidance over 12 months"). This will be highlighted in the PDF.

10. "roadmapMilestones": Object with three arrays of 2-3 milestone strings each, based on the project. Keys: "discovery" (e.g. ["Kickoff & scope lock", "Stakeholder alignment"]), "surgery" (e.g. ["Core delivery milestone 1", "Review checkpoint"]), "postOp" (e.g. ["Handoff & documentation", "30-day support window"]). Use concrete, project-specific milestones.

11. "nextSteps": 2-3 short sentences. What the client should do next to move forward (e.g. "Sign below to accept this proposal. We will schedule the kickoff within 5 business days.").

12. "projectKickoffChecklist": Array of 4-6 short strings that make the client feel the project has already started (e.g. "Kickoff call scheduled", "Stakeholder list confirmed", "Success metrics baseline documented", "Week 1 priorities agreed"). Action-oriented, past or immediate future.

Sign on behalf of the firm as ${name}. Output only the JSON object.`;
}

function buildPrompt(body: ProposalBody): string {
  return body.type === "firm" ? buildFirmPrompt(body) : buildFreelancerPrompt(body);
}

async function callGemini(prompt: string, system: string): Promise<ProposalSections> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: system,
  });
  const result = await model.generateContent([prompt]);
  const text = result.response.text().trim();
  return parseProposalResponse(text);
}

async function callGroq(prompt: string, system: string): Promise<ProposalSections> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: "llama-3.1-70b-versatile",
    temperature: 0.4,
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const text = (typeof raw === "string" ? raw : "").trim();
  return parseProposalResponse(text);
}

function parseProposalResponse(text: string): ProposalSections {
  let parsed: Record<string, unknown>;
  try {
    const cleaned = text.replace(/^```json?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const base: ProposalSections = {
    executiveSummary:
      str((parsed as any).executiveSummary) ||
      str((parsed as any).summary) ||
      "Executive summary could not be generated.",
    strategicDiagnosis:
      str((parsed as any).strategicDiagnosis) ||
      str((parsed as any).diagnosis) ||
      "Strategic diagnosis could not be generated.",
    proprietaryProcess:
      str((parsed as any).proprietaryProcess) ||
      str((parsed as any).solution) ||
      "Proprietary process could not be generated.",
    timelineDeliverables:
      str((parsed as any).timelineDeliverables) ||
      str((parsed as any).timeline) ||
      "Timeline & deliverables could not be generated.",
    investment:
      str((parsed as any).investment) ||
      "Investment section could not be generated.",
  };
  const rawRisks = (parsed as any).riskMitigations;
  if (Array.isArray(rawRisks) && rawRisks.length > 0) {
    base.riskMitigations = rawRisks
      .filter((r: unknown) => r && typeof r === "object" && "risk" in r && "response" in r)
      .map((r: any) => ({ risk: str(r.risk), response: str(r.response) }))
      .filter((r: RiskMitigation) => r.risk || r.response)
      .slice(0, 3);
  }
  if (str((parsed as any).costOfInaction)) base.costOfInaction = str((parsed as any).costOfInaction);
  if (str((parsed as any).successOutcome)) base.successOutcome = str((parsed as any).successOutcome);
  if (str((parsed as any).totalValueDelivered)) base.totalValueDelivered = str((parsed as any).totalValueDelivered);
  const rawRoadmap = (parsed as any).roadmapMilestones;
  if (rawRoadmap && typeof rawRoadmap === "object") {
    const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean) : []);
    base.roadmapMilestones = {
      discovery: arr(rawRoadmap.discovery).slice(0, 3),
      surgery: arr(rawRoadmap.surgery).slice(0, 3),
      postOp: arr(rawRoadmap.postOp).slice(0, 3),
    };
  }
  if (str((parsed as any).nextSteps)) base.nextSteps = str((parsed as any).nextSteps);
  const rawChecklist = (parsed as any).projectKickoffChecklist;
  if (Array.isArray(rawChecklist)) {
    base.projectKickoffChecklist = rawChecklist
      .map((x: unknown) => (typeof x === "string" ? x : ""))
      .filter(Boolean)
      .slice(0, 6);
  }
  return base;
}

export async function POST(req: Request) {
  try {
    const unitCheck = await requireUnits(req, "PROPOSAL");
    if (unitCheck.unitResponse) return unitCheck.unitResponse;
    const creditsRemaining = unitCheck.creditsRemaining;

    const body = (await req.json()) as ProposalBody;
    const prompt = buildPrompt(body);
    const baseSystem = body.type === "firm" ? FIRM_SYSTEM : SYSTEM;
    const system = body.humanize ? `${baseSystem}\n\n${HUMANIZE_INSTRUCTION}` : baseSystem;
    try {
      const out = await callGemini(prompt, system);
      return NextResponse.json({ ...out, creditsRemaining });
    } catch {
      const out = await callGroq(prompt, system);
      return NextResponse.json({ ...out, creditsRemaining });
    }
  } catch (err: unknown) {
    console.error("Proposal API failed:", err);
    return NextResponse.json(
      { error: "Failed to generate proposal" },
      { status: 500 }
    );
  }
}
