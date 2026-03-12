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

export type PreliminaryCheckItem = {
  requirement: string;
  status: "Found" | "Missing" | "Expired";
  critical: boolean;
};

export type TechnicalMatchItem = {
  spec: string;
  proof: string;
  gap_fix: string;
};

export type AnalyzeTenderComplianceResult =
  | {
      success: true;
      readiness_score: number;
      preliminary_check: PreliminaryCheckItem[];
      technical_match: TechnicalMatchItem[];
      disqualification_warnings: string[];
    }
  | { success: false; error: string; code?: string };

const PROMPT = `You are a Kenyan Procurement Auditor. Analyze the tender and the bidder's profile.

TASK:
Step A: Extract the "Mandatory Preliminary Requirements" from the tender text (e.g., KRA Tax Compliance, CR12, NCA 4, Certificate of Incorporation, Business Permit, AGPO, etc.). List each requirement.
Step B: Compare these requirements against the bidder's mandatory_docs. For each: status = "Found" if they have it and not expired, "Expired" if they have it but expiry_date is past, "Missing" if they don't have it. Mark critical=true for requirements that typically cause disqualification (KRA, CR12, Incorporation, etc.).
Step C: Identify Technical Gaps by comparing tender technical specs against the bidder's past_projects. For each spec: provide proof (which project matches) or gap_fix (how to address the gap).

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "readiness_score": number (0-100, 100 = fully ready),
  "preliminary_check": [{"requirement": "string", "status": "Found"|"Missing"|"Expired", "critical": boolean}],
  "technical_match": [{"spec": "string", "proof": "string", "gap_fix": "string"}],
  "disqualification_warnings": ["string"]
}`;

function isExpired(expiryDate: string | null | undefined): boolean {
  if (!expiryDate || typeof expiryDate !== "string") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  return exp < today;
}

export type ValidDoc = { doc_name: string; expiry_date: string | null };

export async function getValidMandatoryDocs(): Promise<
  | { success: true; company_name: string; validDocs: ValidDoc[] }
  | { success: false; error: string }
> {
  try {
    const auth = await getValidatedUser();
    if (!auth) return { success: false, error: "Sign in required." };

    const supabase = await createServerSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .schema("resume_surgeon")
      .from("firm_profiles")
      .select("company_name, mandatory_docs")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("getValidMandatoryDocs firm_profiles error:", profileError);
      return {
        success: false,
        error: "Failed to fetch firm profile. Add your company profile in Firm Profile first, then try again.",
      };
    }

    const company_name = (profile as { company_name?: string })?.company_name ?? "Company";
    const rawDocs = (profile as { mandatory_docs?: unknown })?.mandatory_docs;
    if (!Array.isArray(rawDocs)) {
      return { success: true, company_name, validDocs: [] };
    }

    const validDocs: ValidDoc[] = rawDocs
      .filter((d): d is Record<string, unknown> => d != null && typeof d === "object")
      .map((d) => ({
        doc_name: String((d as { doc_name?: string }).doc_name ?? "").trim(),
        status: Boolean((d as { status?: boolean }).status),
        expiry_date: (d as { expiry_date?: string | null }).expiry_date && typeof (d as { expiry_date?: string }).expiry_date === "string"
          ? (d as { expiry_date: string }).expiry_date
          : null,
      }))
      .filter((d) => d.doc_name && d.status && !isExpired(d.expiry_date))
      .map((d) => ({ doc_name: d.doc_name, expiry_date: d.expiry_date }));

    return { success: true, company_name, validDocs };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch documents.";
    return { success: false, error: message };
  }
}

function formatMandatoryDocs(docs: unknown): string {
  if (!Array.isArray(docs) || docs.length === 0) return "(No mandatory docs saved.)";
  return docs
    .map((d: unknown) => {
      if (d && typeof d === "object") {
        const obj = d as { doc_name?: string; status?: boolean; expiry_date?: string | null };
        const name = obj.doc_name ?? "Document";
        const hasDoc = Boolean(obj.status);
        const expired = hasDoc && isExpired(obj.expiry_date);
        const status = !hasDoc ? "No" : expired ? "Expired" : "Yes";
        const expiry = obj.expiry_date ? ` (expiry: ${obj.expiry_date})` : "";
        return `${name}: ${status}${expiry}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

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

export async function analyzeTenderCompliance(
  tenderText: string
): Promise<AnalyzeTenderComplianceResult> {
  try {
    const text = (tenderText ?? "").trim();
    if (!text) {
      return { success: false, error: "No tender text provided. Scan a tender PDF first." };
    }

    const auth = await getValidatedUser();
    if (!auth) return { success: false, error: "Sign in required." };

    const supabase = await createServerSupabaseClient();
    const cost = getCost("TENDER_READINESS");
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
      .select("mandatory_docs, past_projects")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("analyzeTenderCompliance firm_profiles error:", profileError);
      return {
        success: false,
        error: "Failed to fetch firm profile. Add your company profile and past projects in Firm Profile first, then try again.",
      };
    }

    const mandatoryDocsText = formatMandatoryDocs((profile as { mandatory_docs?: unknown })?.mandatory_docs);
    const pastProjectsText = formatPastProjects((profile as { past_projects?: unknown })?.past_projects);

    const apiKey = getGroqKey();
    if (!apiKey) {
      return { success: false, error: "AI service not configured." };
    }

    const groq = new Groq({ apiKey });
    const sanitizedTender = sanitizeForAI(text) || text;
    const excerpt = sanitizedTender.slice(0, 6000);

    const completion = await groq.chat.completions.create({
      model: GROQ_MAIN_MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${PROMPT}

---
TENDER TEXT:
${excerpt}

---
BIDDER'S MANDATORY DOCS (from Firm Profile):
${mandatoryDocsText}

---
BIDDER'S PAST PROJECTS:
${pastProjectsText}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const responseText = (typeof raw === "string" ? raw : "").trim();
    if (!responseText) {
      return { success: false, error: "AI returned no response." };
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { success: false, error: "AI did not return valid JSON." };
    }

    if (!parsed || typeof parsed !== "object") {
      return { success: false, error: "AI did not return valid JSON." };
    }

    const obj = parsed as Record<string, unknown>;
    const readiness_score = typeof obj.readiness_score === "number"
      ? Math.max(0, Math.min(100, Math.round(obj.readiness_score)))
      : 0;

    const rawPrelim = Array.isArray(obj.preliminary_check) ? obj.preliminary_check : [];
    const preliminary_check: PreliminaryCheckItem[] = rawPrelim
      .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
      .map((p) => ({
        requirement: String((p as { requirement?: string }).requirement ?? "").trim(),
        status: ["Found", "Missing", "Expired"].includes(String((p as { status?: string }).status))
          ? (p as { status: "Found" | "Missing" | "Expired" }).status
          : "Missing",
        critical: Boolean((p as { critical?: boolean }).critical),
      }))
      .filter((p) => p.requirement);

    const rawTech = Array.isArray(obj.technical_match) ? obj.technical_match : [];
    const technical_match: TechnicalMatchItem[] = rawTech
      .filter((t): t is Record<string, unknown> => t != null && typeof t === "object")
      .map((t) => ({
        spec: String((t as { spec?: string }).spec ?? "").trim(),
        proof: String((t as { proof?: string }).proof ?? "").trim(),
        gap_fix: String((t as { gap_fix?: string }).gap_fix ?? "").trim(),
      }))
      .filter((t) => t.spec);

    const rawWarnings = Array.isArray(obj.disqualification_warnings) ? obj.disqualification_warnings : [];
    const disqualification_warnings = rawWarnings
      .map((w) => (typeof w === "string" ? w : String(w ?? "")).trim())
      .filter(Boolean);

    return {
      success: true,
      readiness_score,
      preliminary_check,
      technical_match,
      disqualification_warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compliance analysis failed.";
    return { success: false, error: message };
  }
}
