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
import { getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import type { TenderRequirement } from "@/app/actions/scan-tender";

export type ComplianceStatus = "Full" | "Partial";

export type ComplianceMatrixRow = {
  requirement: string;
  compliance_status: ComplianceStatus;
  proof_summary: string;
  project_reference: string;
};

const PROMPT = `You are a Senior Tender Consultant. Map each Tender Requirement to the most relevant project in the Firm's Past Projects.

For each requirement:
- Choose the best matching project (use the EXACT project title from the list as project_reference).
- compliance_status: "Full" if the project clearly meets the requirement; "Partial" if it partially meets or needs interpretation.
- proof_summary: One concise sentence summarizing how we meet the requirement (e.g. "Full integration via Daraja API and M-Pesa settlement flows."). No flowery language.
- project_reference: The exact project title from the Firm's Past Projects list (e.g. "Safaricom AI Engine"). Use empty string only if no project matches.

Return ONLY a JSON array:
[{"requirement": "string", "compliance_status": "Full" | "Partial", "proof_summary": "string", "project_reference": "string"}].
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

export async function generateComplianceMatrix(
  tenderRequirements: TenderRequirement[]
): Promise<
  | { success: true; matrix: ComplianceMatrixRow[] }
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
      console.error("generateComplianceMatrix firm_profiles error:", profileError);
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

    const apiKey = getGroqKey();
    if (!apiKey) {
      return { success: false, error: "AI service not configured." };
    }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MAIN_MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n---\n\nTender Requirements:\n${tender}\n\n---\n\nFirm's Past Projects:\n${projects}`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    const text = (typeof rawContent === "string" ? rawContent : "").trim();
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

    const matrix: ComplianceMatrixRow[] = parsed
      .filter(
        (x): x is { requirement?: string; compliance_status?: string; proof_summary?: string; project_reference?: string } =>
          x != null && typeof x === "object"
      )
      .map((x) => ({
        requirement: typeof x.requirement === "string" ? x.requirement : String(x.requirement ?? ""),
        compliance_status: x.compliance_status === "Partial" ? "Partial" as const : "Full" as const,
        proof_summary: typeof x.proof_summary === "string" ? x.proof_summary : "",
        project_reference: typeof x.project_reference === "string" ? x.project_reference : "",
      }))
      .filter((m) => m.requirement.trim().length > 0);

    return { success: true, matrix };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate compliance matrix.";
    return { success: false, error: message };
  }
}
