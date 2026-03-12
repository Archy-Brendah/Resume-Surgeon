"use server";

import Groq from "groq-sdk";
import { createServerSupabaseClient, getValidatedUser } from "@/lib/supabase-server-client";
import { getCost } from "@/lib/su-costs";
import {
  checkGlobalGuard,
  getCreditsFromRequest,
  deductSurgicalUnits,
} from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";
import type { TenderRequirement } from "@/app/actions/scan-tender";

export type SurgicalMatrixStatus = "Compliant" | "Partial";

export type SurgicalMatrixRow = {
  requirement: string;
  status: SurgicalMatrixStatus;
  proof: string;
  ref_project: string;
};

const PROMPT = `You are a Senior Tender Consultant performing an AUDIT-FIRST Requirement-to-Project Mapping.

STEP 1 — PORTFOLIO AUDIT (CAPABILITY MAP)
- Carefully read ALL of the firm's past_projects listed below (titles, clients, years, and results).
- Internally build a "Capability Map": for each project, note the key thematic capabilities it proves (e.g. M-Pesa integration, Irrigation infrastructure, Logistics operations, Data pipelines, Governance, Training, etc.).
- Pay special attention to keywords in project titles and results such as "M-Pesa", "mobile money", "Irrigation", "Logistics", "API", "Data Warehouse", "Construction", etc.

STEP 2 — REQUIREMENT-TO-PROJECT MAPPING
For each tender requirement:
- Cross-reference it against the Capability Map, not just the raw text. Look for direct and close matches in project titles AND results.
- If the requirement is explicitly covered by one project (the wording or metrics clearly prove it), set status to "Compliant" and write a 1-sentence Compliance Statement (proof), e.g. "Fully compliant via previous implementation for [Client]." or "Demonstrated through [Project Title] delivery for [Client]." Use the EXACT project title from the list as ref_project.
- If the requirement is similar but not exact (e.g. logistics vs. supply chain, digital payments vs. M-Pesa), set status to "Partial" (Substantial Compliance) with a proof sentence that explains the partial nature of the match.
- If no project in the Capability Map reasonably covers the requirement, suggest a Bridge Skill in proof (one sentence: what experience or skill would bridge the gap). Set ref_project to empty string and status to "Partial".
- If a requirement explicitly mentions M-Pesa, mobile money, or Safaricom APIs, you MUST choose a project whose description references M-Pesa or mobile money where possible and set status to "Compliant" with a proof that references that project.

CONSISTENCY WITH PROJECT CASE STUDIES (NO CONTRADICTIONS)
- These same past_projects will later be rendered as Project Case Studies in the proposal.
- You MUST NOT mark a requirement as "Partial" or effectively "Missing" if any project in the Capability Map clearly proves full compliance for that exact requirement or keyword.
- The Matrix and the Case Studies must be logically synchronized: whenever a Case Study proves a capability, the corresponding requirement in this matrix must be "Compliant" with ref_project pointing to that Case Study project.

Return ONLY a JSON array:
[{"requirement": "string", "status": "Compliant" | "Partial", "proof": "string", "ref_project": "string"}].
One object per requirement. No markdown, no code fences.`;

function formatPastProjects(pastProjects: Array<{ title?: string; client?: string; year?: string; results?: string }>): string {
  if (!Array.isArray(pastProjects) || pastProjects.length === 0) return "(No past projects saved.)";
  return pastProjects
    .map((p) => {
      const t = p.title ?? "Project";
      const parts = [p.client, p.year].filter(Boolean).join(", ");
      const desc = parts ? `${parts}: ${p.results ?? ""}`.trim() : (p.results ?? "").trim();
      return `${t}: ${desc}`.trim();
    })
    .join("\n\n");
}

export async function generateSurgicalMatrix(
  tenderRequirements: TenderRequirement[]
): Promise<
  | { success: true; matrix: SurgicalMatrixRow[] }
  | { success: false; error: string; code?: string }
> {
  try {
    if (!tenderRequirements?.length) {
      return { success: false, error: "No tender requirements provided." };
    }

    const auth = await getValidatedUser();
    if (!auth) return { success: false, error: "Sign in required." };

    const supabase = await createServerSupabaseClient();
    const cost = getCost("TENDER_COMPLIANCE");
    const req = new Request("https://localhost", {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    const guard = await checkGlobalGuard(req);
    if (!guard.allowed) {
      return { success: false, error: guard.message ?? "Daily AI limit reached." };
    }
    const { credits } = await getCreditsFromRequest(req);
    if (credits < cost) {
      return { success: false, error: "Insufficient credits.", code: "CREDITS_REQUIRED" };
    }
    const deductResult = await deductSurgicalUnits(req, cost);
    if (!deductResult.ok || deductResult.creditsRemaining < 0) {
      return { success: false, error: "Insufficient credits.", code: "CREDITS_REQUIRED" };
    }

    const { data: profile, error: profileError } = await supabase
      .schema("resume_surgeon")
      .from("firm_profiles")
      .select("past_projects")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("generateSurgicalMatrix firm_profiles error:", profileError);
      return {
        success: false,
        error: "Failed to fetch firm profile. Add your company profile and past projects in Firm Profile first.",
      };
    }

    const raw = (profile as { past_projects?: unknown })?.past_projects;
    const pastProjects = Array.isArray(raw)
      ? raw.map((p: unknown) => (p && typeof p === "object" ? p as { title?: string; client?: string; year?: string; results?: string } : null)).filter(Boolean) as Array<{ title?: string; client?: string; year?: string; results?: string }>
      : [];
    const pastProjectsText = formatPastProjects(pastProjects);
    if (pastProjectsText === "(No past projects saved.)") {
      return {
        success: false,
        error: "No past projects saved. Add past projects to your firm profile first.",
      };
    }

    const requirementsText = tenderRequirements
      .map((r) => `• ${r.requirement} (${r.type ?? "technical"})`)
      .join("\n");
    const tender = sanitizeForAI(requirementsText) || "(No requirements.)";
    const projects = sanitizeForAI(pastProjectsText) || "(No past projects.)";

    const context = `${PROMPT}\n\n---\n\nTender Requirements:\n${tender}\n\n---\n\nFirm's Past Projects:\n${projects}`;
    const truncated = context.slice(0, 12000);

    let text: string;
    try {
      const geminiKey = getGeminiKey();
      if (geminiKey) {
        text = await generateWithGeminiFailover(geminiKey, {
          prompt: truncated,
          systemInstruction: "You are a Senior Tender Consultant. Output only valid JSON array, no markdown.",
        });
        text = (text || "").trim();
      } else {
        throw new Error("No Gemini key");
      }
    } catch {
      const groqKey = getGroqKey();
      if (!groqKey) return { success: false, error: "AI service not configured." };
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MAIN_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          { role: "system", content: "You are a Senior Tender Consultant. Output only valid JSON array, no markdown." },
          { role: "user", content: truncated },
        ],
      });
      const rawContent = completion.choices[0]?.message?.content ?? "";
      text = (typeof rawContent === "string" ? rawContent : "").trim();
    }

    if (!text) {
      return { success: false, error: "AI returned no response." };
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { success: false, error: "Could not parse AI response." };
    }

    if (!Array.isArray(parsed)) {
      return { success: false, error: "AI did not return a valid JSON array." };
    }

    const matrix: SurgicalMatrixRow[] = parsed
      .filter(
        (x): x is { requirement?: string; status?: string; proof?: string; ref_project?: string } =>
          x != null && typeof x === "object"
      )
      .map((x) => ({
        requirement: typeof x.requirement === "string" ? x.requirement : String(x.requirement ?? ""),
        status: x.status === "Partial" ? "Partial" as const : "Compliant" as const,
        proof: typeof x.proof === "string" ? x.proof : "",
        ref_project: typeof x.ref_project === "string" ? x.ref_project : "",
      }))
      .filter((m) => m.requirement.trim().length > 0);

    return { success: true, matrix };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate surgical matrix.";
    return { success: false, error: message };
  }
}
