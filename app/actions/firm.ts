"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { extractTextFromPDF } from "@/lib/pdf-extract";
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

export type ExtractFirmDataResult =
  | { success: true; data: { company_name: string; bio: string; core_services: string[]; past_projects: Array<{ title: string; client: string; year: string; results: string }> } }
  | { success: false; error: string; code?: string };

const EXTRACT_PROMPT = `You are a business analyst. Extract the following from this company profile text:
1. Company Name
2. Professional Bio (3 sentences)
3. Core Services (array of strings - e.g. ICT, Civil Works, Consulting, Software Development)
4. Past Projects (up to 5, each with: title, client, year, results)

Return ONLY a JSON object with this exact structure:
{"company_name": "string", "bio": "string", "core_services": ["string", "string"], "past_projects": [{"title": "string", "client": "string", "year": "string", "results": "string"}]}
No markdown, no code blocks, only the JSON object.`;

export async function extractFirmDataFromPDF(
  formData: FormData
): Promise<ExtractFirmDataResult> {
  try {
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "No PDF file provided." };
    }
    if (file.type !== "application/pdf") {
      return { success: false, error: "File must be a PDF." };
    }
    const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
    if (file.size > MAX_SIZE_BYTES) {
      return { success: false, error: "File too large. Please upload a PDF under 4MB to save server resources." };
    }

    const auth = await getValidatedUser();
    if (!auth) return { success: false, error: "Sign in required." };

    const supabase = await createServerSupabaseClient();
    const cost = getCost("PORTFOLIO_IMPORT");
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

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch {
      return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
    }

    let rawText: string;
    try {
      rawText = await extractTextFromPDF(arrayBuffer);
    } catch {
      return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
    }
    const extractedText = rawText.slice(0, 10000);

    if (!extractedText.trim()) {
      return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
    }

    const geminiKey = getGeminiKey();
    const groqKey = getGroqKey();
    if (!geminiKey && !groqKey) {
      return { success: false, error: "AI service not configured." };
    }

    const text = sanitizeForAI(extractedText) || extractedText;
    const prompt = `${EXTRACT_PROMPT}\n\n---\n\nCompany profile text:\n${text}`;

    let raw: string;
    try {
      if (geminiKey) {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_DUAL_BRAIN_MODEL });
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        const out = result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        raw = (typeof out === "string" ? out : "").trim();
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
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: prompt },
        ],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim();
    }
    const responseText = (typeof raw === "string" ? raw : "").trim();
    if (!responseText) return { success: false, error: "AI returned empty." };

    const jsonStr = extractJSON(responseText);
    if (!jsonStr) {
      return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
    }

    if (!parsed || typeof parsed !== "object") {
      return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
    }

    const obj = parsed as Record<string, unknown>;
    const company_name = typeof obj.company_name === "string" ? obj.company_name : "";
    const bio = typeof obj.bio === "string" ? obj.bio : "";
    const rawServices = Array.isArray(obj.core_services) ? obj.core_services : [];
    const core_services = rawServices
      .map((s) => (typeof s === "string" ? s : String(s ?? "")).trim())
      .filter(Boolean);
    const rawProjects = Array.isArray(obj.past_projects) ? obj.past_projects : [];
    const past_projects = rawProjects
      .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
      .map((p) => ({
        title: String(p.title ?? ""),
        client: String(p.client ?? ""),
        year: String(p.year ?? ""),
        results: String(p.results ?? ""),
      }))
      .filter((p) => p.title.trim() || p.client.trim() || p.results.trim())
      .slice(0, 5);

    return {
      success: true,
      data: { company_name, bio, core_services, past_projects },
    };
  } catch (err) {
    return { success: false, error: "Could not read this PDF format. Please try a different document or fill manually." };
  }
}

export type SaveFirmProfileResult =
  | { success: true }
  | { success: false; error: string };

function parseJsonArray<T>(raw: FormDataEntryValue | null): T[] {
  if (raw == null || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

type MandatoryDocInput = { doc_name?: string; status?: boolean; expiry_date?: string | null };

function parseMandatoryDocs(raw: FormDataEntryValue | null): Array<{ doc_name: string; status: boolean; expiry_date: string | null }> {
  const arr = parseJsonArray<MandatoryDocInput>(raw);
  return arr
    .filter((d) => d && typeof (d as MandatoryDocInput).doc_name === "string")
    .map((d) => ({
      doc_name: String((d as MandatoryDocInput).doc_name ?? "").trim(),
      status: Boolean((d as MandatoryDocInput).status),
      expiry_date: (d as MandatoryDocInput).expiry_date && typeof (d as MandatoryDocInput).expiry_date === "string"
        ? (d as MandatoryDocInput).expiry_date!
        : null,
    }))
    .filter((d) => d.doc_name);
}

export async function saveFirmProfile(
  formData: FormData
): Promise<SaveFirmProfileResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Sign in required." };
    }

    const company_name = String(formData.get("company_name") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const methodology = String(formData.get("methodology") ?? "").trim();
    const mission = String(formData.get("mission") ?? "").trim();
    const success_metrics = String(formData.get("success_metrics") ?? "").trim();
    const team_size = String(formData.get("team_size") ?? "").trim();
    const rawProjects = parseJsonArray<{ title?: string; client?: string; year?: string; results?: string }>(
      formData.get("past_projects")
    );
    const rawServices = parseJsonArray<string>(formData.get("core_services"));

    const past_projects = rawProjects
      .filter((p) => (p.title ?? "").trim() || (p.client ?? "").trim() || (p.results ?? "").trim())
      .map((p) => ({
        title: String(p.title ?? "").trim(),
        client: String(p.client ?? "").trim(),
        year: String(p.year ?? "").trim(),
        results: String(p.results ?? "").trim(),
      }));

    const core_services = rawServices.map((s) => String(s ?? "").trim()).filter(Boolean);
    const mandatory_docs = parseMandatoryDocs(formData.get("mandatory_docs"));

    const db = supabase.schema("resume_surgeon");
    const { error } = await db.from("firm_profiles").upsert(
      {
        user_id: user.id,
        company_name: company_name || null,
        bio: bio || null,
        core_services,
        past_projects,
        mandatory_docs,
        methodology: methodology || null,
        mission: mission || null,
        success_metrics: success_metrics || null,
        team_size: team_size || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save profile.";
    return { success: false, error: message };
  }
}
