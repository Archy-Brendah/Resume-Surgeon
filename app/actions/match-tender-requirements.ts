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

export type TenderMatchItem = {
  requirement: string;
  matched_project: string;
  confidence: number;
  gap_fix: string;
  result?: string;
};

const PROMPT = `You are a Senior Tender Consultant. Compare these [Tender Requirements] against the [Firm's Past Projects].
For each requirement, find the best matching project.

CRITICAL FORMAT:
- When a project matches, "matched_project" MUST be phrased exactly as: "Implementation Case Study: [Project Name]" using the EXACT project title from the Firm's Past Projects list (e.g. "Implementation Case Study: Safaricom AI Engine"). Do NOT use "Pivot experience" or generic descriptions. Map multiple tender requirements to the same project when one past project addresses several requirements (e.g. "AI" and "High Volume" both satisfied by "Safaricom AI Engine").
- Add a "result" field with one concrete, quantified outcome (e.g. "Proven 99.9% uptime in M-Pesa settlements."). Omit result only when no project matches.

Return a JSON array:
[{"requirement": "string", "matched_project": "string", "confidence": 0-100, "gap_fix": "string", "result": "string (optional)"}].
If no project matches, set matched_project to "", gap_fix to a specific 'Relevant Experience' paragraph they should write, and omit or leave result empty.
No markdown, no code fences, only the JSON array.`;

function formatPastProjects(pastProjects: unknown): string {
  if (!Array.isArray(pastProjects) || pastProjects.length === 0) {
    return "(No past projects saved.)";
  }
  return pastProjects
    .map((p: unknown) => {
      if (p && typeof p === "object") {
        const obj = p as { title?: string; client?: string; year?: string; results?: string };
        const t = obj.title ?? "Project";
        const parts = [obj.client, obj.year].filter(Boolean).join(", ");
        const desc = parts ? `${parts}: ${obj.results ?? ""}`.trim() : (obj.results ?? "").trim();
        return `${t}: ${desc}`.trim();
      }
      return typeof p === "string" ? p : JSON.stringify(p);
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function matchTenderRequirements(
  scannedRequirements: TenderRequirement[]
): Promise<
  | { success: true; matches: TenderMatchItem[] }
  | { success: false; error: string; code?: string }
> {
  try {
    if (!scannedRequirements?.length) {
      return { success: false, error: "No requirements to match." };
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
      console.error("matchTenderRequirements firm_profiles error:", profileError);
      return {
        success: false,
        error: "Failed to fetch firm profile. Add your company profile and past projects in Firm Profile first, then try again.",
      };
    }

    const pastProjectsText = formatPastProjects((profile as { past_projects?: unknown })?.past_projects);
    if (pastProjectsText === "(No past projects saved.)") {
      return {
        success: false,
        error: "No past projects saved. Add past projects to your firm profile first.",
      };
    }

    const requirementsText = scannedRequirements
      .map((r) => `• ${r.requirement} (${r.type})`)
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

    const raw = completion.choices[0]?.message?.content ?? "";
    const text = (typeof raw === "string" ? raw : "").trim();
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

    const matches: TenderMatchItem[] = parsed
      .filter(
        (x): x is { requirement?: string; matched_project?: string; confidence?: number; gap_fix?: string; result?: string } =>
          x != null && typeof x === "object"
      )
      .map((x) => ({
        requirement: typeof x.requirement === "string" ? x.requirement : String(x.requirement ?? ""),
        matched_project: typeof x.matched_project === "string" ? x.matched_project : "",
        confidence: typeof x.confidence === "number" ? Math.max(0, Math.min(100, x.confidence)) : 0,
        gap_fix: typeof x.gap_fix === "string" ? x.gap_fix : "",
        result: typeof x.result === "string" ? x.result.trim() || undefined : undefined,
      }))
      .filter((m) => m.requirement.trim().length > 0);

    return { success: true, matches };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to match requirements.";
    return { success: false, error: message };
  }
}
