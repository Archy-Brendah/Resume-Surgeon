"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
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
import { extractJSON } from "@/lib/extract-json";

/** Primary Brain: gemini-2.0-flash-lite or gemini-1.5-flash (override via GEMINI_DUAL_BRAIN_MODEL env). */
const GEMINI_DUAL_BRAIN_MODEL = process.env.GEMINI_DUAL_BRAIN_MODEL?.trim() || "gemini-2.0-flash-lite";

export type PortfolioMatchItem = {
  requirement: string;
  status: "Matched" | "Gap";
  evidence: string;
  suggested_fix: string;
  result?: string;
};

const PROMPT = `Compare these Tender Requirements against the Firm's Past Projects. For each requirement, find the specific project that proves the firm can do the job.

CRITICAL FORMAT:
- For Matched: "evidence" MUST start with "Implementation Case Study: [Project Name]." using the EXACT project title from the Firm's Past Projects list, then 1-2 sentences with metrics. Do NOT use "Pivot experience." Map multiple tender requirements into the same project when one past project addresses several (e.g. "AI" and "High Volume" both shown under "Implementation Case Study: Safaricom AI Engine").
- Add a "result" field with one concrete, quantified outcome (e.g. "Proven 99.9% uptime in M-Pesa settlements."). Omit result for Gaps.
- For Gap: evidence = empty or brief note; suggested_fix = how to address the gap.

Return ONLY a JSON array: [{"requirement": "string", "status": "Matched" | "Gap", "evidence": "string", "suggested_fix": "string", "result": "string (optional)"}].
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

export async function matchTenderToPortfolio(
  tenderRequirements: string[]
): Promise<
  | { success: true; items: PortfolioMatchItem[] }
  | { success: false; error: string; code?: string }
> {
  try {
    const requirements = tenderRequirements?.filter((r) => typeof r === "string" && r.trim().length > 0) ?? [];
    if (requirements.length === 0) {
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
      console.error("matchTenderToPortfolio firm_profiles error:", profileError);
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

    const requirementsText = requirements.map((r) => `• ${r.trim()}`).join("\n");
    const tender = sanitizeForAI(requirementsText) || "(No requirements.)";
    const projects = sanitizeForAI(pastProjectsText) || "(No past projects.)";

    const fullPrompt = `${PROMPT}\n\n---\n\nTender Requirements:\n${tender}\n\n---\n\nFirm's Past Projects:\n${projects}`;
    const truncatedPrompt = fullPrompt.slice(0, 10000);

    const geminiKey = getGeminiKey();
    const groqKey = getGroqKey();
    if (!geminiKey && !groqKey) {
      return { success: false, error: "AI service not configured." };
    }

    let text: string;
    try {
      if (geminiKey) {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_DUAL_BRAIN_MODEL });
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: truncatedPrompt }] }],
        });
        const raw = result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        text = (typeof raw === "string" ? raw : "").trim();
      } else {
        throw new Error("No Gemini key");
      }
    } catch {
      console.log("Falling back to Groq Brain...");
      if (!groqKey) throw new Error("AI service not configured");
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MAIN_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [{ role: "user", content: truncatedPrompt }],
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      text = (typeof raw === "string" ? raw : "").trim();
    }

    if (!text) {
      return { success: false, error: "AI returned no response." };
    }

    let jsonStr = extractJSON(text);
    if (!jsonStr) {
      console.error("matchTenderToPortfolio: extractJSON failed. Raw text (first 500 chars):", text.slice(0, 500));
      return { success: false, error: "Could not parse AI response." };
    }
    // Remove trailing commas before closing ] or } (common AI mistake)
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("matchTenderToPortfolio: JSON.parse failed.", parseErr);
      console.error("matchTenderToPortfolio: Extracted string (first 500 chars):", jsonStr.slice(0, 500));
      return { success: false, error: "Could not parse AI response." };
    }

    const arr = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null ? [parsed] : null;
    if (!arr) {
      return { success: false, error: "AI did not return a valid JSON array." };
    }

    const items: PortfolioMatchItem[] = arr
      .filter(
        (x): x is { requirement?: string; status?: string; evidence?: string; suggested_fix?: string; result?: string } =>
          x != null && typeof x === "object"
      )
      .map((x) => ({
        requirement: typeof x.requirement === "string" ? x.requirement : String(x.requirement ?? ""),
        status: x.status === "Matched" ? "Matched" : "Gap",
        evidence: typeof x.evidence === "string" ? x.evidence : "",
        suggested_fix: typeof x.suggested_fix === "string" ? x.suggested_fix : "",
        result: typeof x.result === "string" ? x.result.trim() || undefined : undefined,
      }))
      .filter((m) => m.requirement.trim().length > 0);

    return { success: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to match tender to portfolio.";
    return { success: false, error: message };
  }
}
