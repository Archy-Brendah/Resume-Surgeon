import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { BASE_HUMAN_LIKE, HUMANIZE_INSTRUCTION } from "@/lib/humanize";
import { getCost } from "@/lib/su-costs";
import type { SurgicalUnitAction } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  getCreditsFromRequest,
  deductSurgicalUnits,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { sanitizeForAI, sanitizeShortField } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL, GROQ_FALLBACK_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

const SYSTEM =
  "You are a top-tier sales consultant who writes high-value, authoritative proposals. Confident, professional tone. Structure as requested; clear headings and concise paragraphs. Write paragraphs so they sound human — varied sentence length, natural flow. Avoid robotic lists and predictable transitions so the proposal reads like an expert wrote it and performs well on AI detection.";

const FIRM_SYSTEM =
  'You are a senior B2B strategist writing a formal proposal (TEACH, TAILOR, TAKE CONTROL). Authoritative, high-value tone. Use "We" and "Our Team." The client may be in any sector (health, agriculture, construction, ICT, logistics, etc.) — use their language from the scope and pain points; do not assume or name a specific industry. Write like a senior human consultant: vary sentence length (include at least one longer sentence of 25+ words and several short sentences under 12 words). Avoid generic openers ("In conclusion", "This proposal aims to", "In today\'s fast-changing world") and buzzwords ("cutting-edge", "world-class", "industry-leading", "game-changer", "transformative", "synergy"). Every claim should be grounded in the provided scope, pain points, and case studies.';

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
  toneOfVoice?: "nairobi_tech_startup" | "government_ngo" | "international_client" | "non_tech_startup";
  humanize?: boolean;
  tenderRef?: string;
  tenderName?: string;
  submittedTo?: string;
};

/** Government Executive tone for Kenyan public procurement tenders (firm proposals only). */
const GOVERNMENT_EXECUTIVE_TONE =
  "Act as a Senior Tender Consultant specialized in Kenyan Public Procurement. Rewrite the entire proposal using a 'Government Executive' tone. Specific requirements: (1) Extreme Formality — use phrases such as 'The undersigned,' 'For your favorable consideration,' and 'Pursuant to the provisions of...'; (2) Reference the Law — explicitly mention alignment with the Public Procurement and Asset Disposal Act (PPADA) 2015 and PPAD Regulations 2020 where relevant; (3) Deference — use 'The Procuring Entity' instead of 'The Client' or 'You'; (4) No Jargon — avoid modern slang (e.g. 'game-changer,' 'disruptive'); use 'robust,' 'scalable,' 'sustainable,' and 'value for money'; (5) Standard Closing — end with 'We remain, [Company Name], always at your service' or 'Awaiting your favorable response'; (6) Terminology — use 'Technical Proposal,' 'Financial Proposal,' and 'Tender Security' correctly throughout.";

const TONE_INSTRUCTIONS: Record<string, string> = {
  nairobi_tech_startup:
    "Nairobi Tech Startup (Bold, fast-paced, result-heavy): Use bold, fast-paced language. Lead with results and metrics. Short punchy sentences. Action-oriented. Vocabulary and rhythm should match the African tech ecosystem.",
  government_ngo:
    "Government/NGO (Highly formal, respectful, mentions compliance): Use highly formal, respectful language. Mention compliance, procurement, and regulatory alignment. Traditional structure. Match the expected norms of public sector and NGO tenders.",
  international_client:
    "International Client (Global Project Manager, Minimalist Professional): Act as a Global Project Manager. Use a minimalist, professional style — clear, concise sentences with no flowery language or local jargon. Be extremely direct about the Value Proposition. Use clear, bulleted lists for 'Scope of Work' and 'Timeline'. Explicitly reference Quality Assurance (QA) and Data Privacy (GDPR and the Kenya Data Protection Act) to build global trust and compliance confidence.",
  non_tech_startup:
    "Non-Tech Operations (Operations Director): Act as an Operations Director. Use a pragmatic, detail-oriented voice. Focus on physical implementation and execution — equipment, manpower, boots on the ground. Emphasize Sustainability, Local Content, and Cost-Effectiveness. Avoid buzzwords such as 'synergy' or 'disruption'; instead, use 'Optimization' and 'Reliability'. Structure the proposal to highlight Safety Protocols, on-site procedures, and clear Milestone Delivery.",
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

  const toneInstruction = body.toneOfVoice ? TONE_INSTRUCTIONS[body.toneOfVoice] ?? "" : "";
  const toneBlock = toneInstruction ? `\n\nTONE OF VOICE:\nRewrite the entire proposal using this tone. ${toneInstruction} Ensure vocabulary and sentence structure match the expected professional norms of that specific sector. Apply this tone consistently across all sections.\n\n` : "";
  const currencyNote = body.toneOfVoice === "international_client"
    ? "\nCURRENCY: Use USD ($) for all monetary amounts in the investment section and anywhere else. Do not use Ksh.\n\n"
    : "";

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
${toneBlock}${currencyNote}---

Write a professional executive proposal for an INDIVIDUAL FREELANCER. Use first person singular ("I") throughout. Emphasize: personal expertise, speed, and direct communication. Output valid JSON only with these exact keys:

1. "executiveSummary": A punchy 1–2 paragraph hook that reframes the client's problem and positions you as the solution. Be specific to their situation.

2. "strategicDiagnosis": 1–3 short paragraphs that start with "I understand your current challenge is [X]..." — reflect their pain points and show you've listened. Reference their scope and goals.

3. "proprietaryProcess": 2–3 paragraphs that explain "how I work" — your repeatable process, stages, or framework. Reference specific skills and the case studies above. No markdown bold.

4. "timelineDeliverables": A structured 3-phase delivery plan. Use this format for parsing:
Phase 1: [Name] | [Timeframe, e.g. Weeks 1-2]
• Deliverable one
• Deliverable two
Phase 2: [Name] | [Timeframe]
• ...
Phase 3: [Name] | [Timeframe]
• ...
Include both activities and concrete deliverables.

5. "investment": A short "Pricing & Next Steps" section. Include the pricing they provided, payment terms if appropriate, and a clear call to action.

6. "nextSteps": 2–3 short sentences. What the client should do next (e.g. "Reply to this proposal to confirm. I will schedule a kickoff call within 48 hours.").

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
  const tenderRef = sanitizeShortField(body.tenderRef, 100) || "";
  const tenderName = sanitizeShortField(body.tenderName, 300) || "";
  const submittedTo = sanitizeShortField(body.submittedTo, 200) || "";
  const strategyTone = body.strategyTone === "bold" ? "Bold/Disruptive" : "Conservative/Safe";
  const strategyToneInstruction =
    body.strategyTone === "bold"
      ? "Write in a bold, disruptive tone: challenge the status quo, use strong language, and position the firm as the only clear choice. Be provocative where appropriate."
      : "Write in a conservative, safe tone: reassuring, risk-aware, and professionally measured. Emphasize reliability and mitigation of risk.";

  const toneOfVoiceInstruction =
    body.toneOfVoice === "government_ngo"
      ? GOVERNMENT_EXECUTIVE_TONE
      : body.toneOfVoice
        ? TONE_INSTRUCTIONS[body.toneOfVoice] ?? ""
        : "";
  const toneBlock = toneOfVoiceInstruction
    ? `\n\nTONE OF VOICE:\n${toneOfVoiceInstruction} Apply this tone consistently across all sections.\n\n`
    : "";

  const currencyNote = body.toneOfVoice === "international_client"
    ? "\nCURRENCY: Use USD ($) for all monetary amounts (investment, totalValueDelivered, etc.). Do not use Ksh.\n\n"
    : "";

  const tenderBlock =
    tenderRef || tenderName || submittedTo
      ? `\nTender context (reference this in the proposal where relevant):\n${tenderRef ? `Tender reference: ${tenderRef}\n` : ""}${tenderName ? `Tender name: ${tenderName}\n` : ""}${submittedTo ? `Procuring entity / Submitted to: ${submittedTo}` : ""}\n\n`
      : "";

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
${tenderBlock}${currencyNote}Firm name: ${company}
Firm identity (e.g. consultancy, implementation partner — any sector): ${firmIdentity}
Team size (if provided): ${teamSize}
Our methodology (brief): ${methodology}
Client mission / primary goal:
${mission}

Client success metrics / definition of a win:
${successMetrics}

${toneBlock}---

IMPORTANT: This proposal may be for any sector (e.g. health, agriculture, construction, ICT, logistics). Derive all content from the scope, pain points, case studies, and tender context above. Do not hard-code any specific industry, client name, or problem — use only what is provided.

Strategy tone: ${strategyTone}. ${strategyToneInstruction}

Write an ELITE "Power Proposal" for a PROFESSIONAL FIRM. Use first person plural ("We") throughout. Apply Challenger: TEACH, TAILOR, TAKE CONTROL. Emphasize "The ${company} Process" and "Our Team's" experience. Output valid JSON only with these exact keys:

1. "executiveSummary": Write a 140–160 word high-level summary. Structure it as follows. (a) Opening 1–2 sentences: name the tender, the procuring entity, and the firm (e.g. "${company} submits this proposal for ${tenderName || "the tender"} to ${submittedTo || "the Procuring Entity"}."). (b) One sentence on the stakes or challenge drawn from the project scope and pain points above — use the client's own language where possible; do not invent or assume a specific sector. (c) Three clear Value Propositions for the procuring entity, each backed by evidence from the case studies or scope (e.g. full compliance with requirements, proven delivery in comparable engagements, local or in-country implementation and support). Include at least two concrete numbers (percentages, currency, or counts) somewhere in the summary. (d) One closing sentence stating the outcome and timeframe. Do not use buzzwords (cutting-edge, world-class, game-changer, transformative). Sound like a senior consultant, not a generic template.

2. "strategicDiagnosis": A deep diagnosis based only on the tender scope and pain points provided. First sentence must follow this pattern exactly: "The [Procuring Entity] is currently facing [Problem X]." Second sentence: "Our diagnosis identifies that [Solution Y] is the most cost-effective and sustainable path forward." Derive [Problem X] and [Solution Y] from the scope and pain points; use the client's wording where possible. Do not assume or name a specific industry (e.g. do not mention tech, health, or agriculture unless the scope does). Then add 2–3 short sentences that: (a) include at least one quantified risk or cost of inaction (e.g. a percentage, timeframe, or cost impact), (b) name one concrete operational or delivery risk relevant to the scope, and (c) tie back to the firm's proven capabilities from the case studies above (in generic terms: e.g. delivery at scale, integration, compliance, support). Vary sentence length; avoid "In conclusion" or "This proposal aims to."

3. "proprietaryProcess": Our methodology section. Use this EXACT structure — four phases, each phase name on its own line (ALL CAPS), then a blank line, then 2–3 sentences. Format exactly:
STRATEGY

[2-3 sentences: needs assessment, objectives, compliance alignment]

EXECUTION

[2-3 sentences: development, deployment, experience]

OPTIMIZATION

[2-3 sentences: testing, refinement, performance]

SUPPORT

[2-3 sentences: operational stability, handover, sustained success]

Do NOT use **bold** or any markdown. Each phase name (STRATEGY, EXECUTION, OPTIMIZATION, SUPPORT) must be on its own line in ALL CAPS.

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

7. "costOfInaction": 1-2 sentences. What happens if the client does nothing? (Revenue loss, missed opportunity, competitive risk — be specific and quantified where possible.)

8. "successOutcome": 1-2 sentences. What does success look like after this project? Tie to their success metrics and mission.

9. "totalValueDelivered": One short phrase or sentence summarizing total value. Use USD ($) for international_client tone, otherwise use Ksh. Example: "Estimated 20% efficiency gain and $X in cost avoidance over 12 months" or "Ksh X in cost avoidance". Quantify where possible. This will be highlighted in the PDF.

10. "roadmapMilestones": Object with three arrays of 2-3 milestone strings each. Keys: "discovery", "surgery", "postOp". Use concrete, project-specific milestones (e.g. discovery: ["Kickoff & scope lock", "Stakeholder alignment"], surgery: ["Core delivery milestone 1", "Review checkpoint"], postOp: ["Handoff & documentation", "30-day support window"]).

11. "nextSteps": 2-3 short sentences. What the client should do next (e.g. "Sign below to accept this proposal. We will schedule the kickoff within 5 business days."). Clear, actionable.

12. "projectKickoffChecklist": Array of 4-6 short strings (e.g. "Kickoff call scheduled", "Stakeholder list confirmed", "Success metrics baseline documented"). Action-oriented, past or immediate future tense.

Sign on behalf of the firm as ${name}. Output only the JSON object.`;
}

function buildPrompt(body: ProposalBody): string {
  return body.type === "firm" ? buildFirmPrompt(body) : buildFreelancerPrompt(body);
}

async function callGemini(prompt: string, system: string): Promise<ProposalSections> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const text = await generateWithGeminiFailover(apiKey, { prompt, systemInstruction: system });
  return parseProposalResponse(text);
}

async function callGroq(prompt: string, system: string, model: string = GROQ_MAIN_MODEL): Promise<ProposalSections> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model,
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
      "Executive summary to be finalized.",
    strategicDiagnosis:
      str((parsed as any).strategicDiagnosis) ||
      str((parsed as any).diagnosis) ||
      "Strategic diagnosis to be finalized.",
    proprietaryProcess: (() => {
      const raw =
        str((parsed as any).proprietaryProcess) ||
        str((parsed as any).solution) ||
        "Proprietary process to be finalized.";
      return raw.replace(/\*\*([^*]+)\*\*/g, "$1");
    })(),
    timelineDeliverables:
      str((parsed as any).timelineDeliverables) ||
      str((parsed as any).timeline) ||
      "Timeline and deliverables to be finalized.",
    investment:
      str((parsed as any).investment) ||
      "Investment and commercial terms to be finalized.",
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
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Sign in required to generate a proposal." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as ProposalBody;
    const proposalFeature: SurgicalUnitAction = body.type === "firm" ? "PROPOSAL_FIRM" : "PROPOSAL_FREELANCE";
    const baseCost = getCost(proposalFeature);
    const cost = body.humanize ? Math.ceil(baseCost * 1.2) : baseCost;

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
    const creditsRemaining = deductResult.creditsRemaining;

    const prompt = buildPrompt(body);
    const baseSystem = body.type === "firm" ? FIRM_SYSTEM : SYSTEM;
    const system = body.humanize
      ? `${BASE_HUMAN_LIKE}\n\n${baseSystem}\n\n${HUMANIZE_INSTRUCTION}`
      : `${BASE_HUMAN_LIKE}\n\n${baseSystem}`;

    let out: ProposalSections;
    try {
      out = await callGemini(prompt, system);
    } catch {
      try {
        out = await callGroq(prompt, system);
      } catch {
        out = await callGroq(prompt, system, GROQ_FALLBACK_MODEL);
      }
    }

    // Surgical Baseline fallback: never leave key sections "to be finalized"
    const needsFallback = (v: string | undefined) =>
      !v || /to be finalized\./i.test(v);

    const companyName = sanitizeShortField(body.companyName, 200) || "Our Firm";
    const tenderName = sanitizeShortField(body.tenderName, 300) ||
      sanitizeShortField(body.tenderRef, 100) ||
      "this tender";
    const procuringEntity =
      sanitizeShortField(body.submittedTo, 200) || "the Procuring Entity";

    if (needsFallback(out.executiveSummary)) {
      out.executiveSummary = `${companyName} submits this proposal for ${tenderName} to ${procuringEntity} to deliver a fully compliant, end‑to‑end solution. We combine proven delivery experience in comparable engagements with a senior multidisciplinary team on-the-ground implementation capacity. Our value proposition to ${procuringEntity} is threefold: (1) full alignment with the tender’s technical and contractual requirements; (2) a demonstrable track record delivering similar projects on time and within budget; and (3) locally available implementation and support, ensuring rapid response and minimal downtime throughout the contract period. These strengths position ${companyName} as a low‑risk, high‑value implementation partner for this engagement.`;
    }

    if (needsFallback(out.strategicDiagnosis)) {
      out.strategicDiagnosis = `The ${procuringEntity} is currently facing challenges in delivering the full scope of ${tenderName} efficiently and in a manner that meets evolving stakeholder expectations. Our diagnosis identifies that partnering with ${companyName} to deliver a structured, well‑governed implementation is the most cost‑effective and sustainable path forward. Clear governance, documented delivery milestones, and strong local execution capability reduce operational risk and maximize long‑term value for the ${procuringEntity}.`;
    }

    return NextResponse.json({ ...out, creditsRemaining });
  } catch (err: unknown) {
    console.error("Proposal API failed:", err);
    return NextResponse.json(
      { error: "Failed to generate proposal. Please try again." },
      { status: 500 }
    );
  }
}
