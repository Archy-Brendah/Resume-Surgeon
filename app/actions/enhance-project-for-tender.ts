"use server";

import Groq from "groq-sdk";
import { getValidatedUser } from "@/lib/supabase-server-client";
import { getCost } from "@/lib/su-costs";
import {
  checkGlobalGuard,
  getCreditsFromRequest,
  deductSurgicalUnits,
} from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGeminiKey, getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";
import { generateWithGeminiFailover } from "@/lib/gemini-client";

export type EnhanceProjectInput = {
  title: string;
  client: string;
  year: string;
  results: string;
  requirements: string[];
};

const SYSTEM = `You are a Senior Tender Consultant. Rewrite the project description into a concise STAR-style case study that will be split into three labeled sections in the UI.

STRICT STRUCTURE (THREE SENTENCES ONLY)
THE CHALLENGE (SITUATION): Must strictly describe the client's PAIN POINT (for example, manual inefficiencies, high crop failure, long turnaround times, frequent outages). No actions or results in this sentence.
THE SOLUTION (ACTION): Must strictly describe the ACTION taken (for example, deployed an automated system, installed drip irrigation, integrated M-Pesa/Daraja API, reorganized logistics operations). No pain points or outcome metrics in this sentence.
THE IMPACT (RESULT): Must strictly describe the RESULT using clear, outcome-focused metrics (for example, 85% efficiency improvement, 120% yield increase, 40% cost reduction, 99.9% uptime). This sentence must answer: "How much better/cheaper/faster is the client now?"

Write exactly three sentences in this order: first sentence = THE CHALLENGE, second sentence = THE SOLUTION, third sentence = THE IMPACT.
Each sentence must be unique and must NOT reuse the same sentence, wording, or full phrases between THE CHALLENGE and THE IMPACT.
Each sentence must be under 40 words.
Preserve and clearly state any true metrics and numbers from the original description (percentages, currency, counts) when relevant. Do not use markdown or formatting characters; the UI will handle bolding.
Output only this three-sentence paragraph (no headings, no labels, no bullet points, no preamble, no markdown).`;

export async function enhanceProjectForTender(
  input: EnhanceProjectInput
): Promise<{ success: true; description: string } | { success: false; error: string; code?: string }> {
  try {
    const auth = await getValidatedUser();
    if (!auth) return { success: false, error: "Sign in required." };

    const cost = getCost("PROJECT_DESCRIPTION_ENHANCE");
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

    const requirementsText = input.requirements.length > 0
      ? input.requirements.map((r) => `• ${r}`).join("\n")
      : "General technical and delivery capability.";
    const projectContext = `Project: ${input.title}\nClient: ${input.client}\nYear: ${input.year}\nOriginal results/description:\n${input.results}`;
    const prompt = `Current Tender Requirements:\n${requirementsText}\n\n${projectContext}\n\nRewrite the description for ${input.title} to specifically emphasize how it solves the Current Tender Requirements above, following the STAR rules in the system instructions. Output exactly three sentences (Challenge, Solution, Impact) in one paragraph. No headings, no bullet points, no preamble, no markdown.`;

    const geminiKey = getGeminiKey();
    const groqKey = getGroqKey();
    let description: string;

    if (geminiKey) {
      try {
        const text = await generateWithGeminiFailover(geminiKey, {
          prompt: sanitizeForAI(prompt) || prompt,
          systemInstruction: SYSTEM,
        });
        description = (text || "").trim() || input.results;
      } catch {
        if (!groqKey) return { success: false, error: "AI service unavailable." };
        const groq = new Groq({ apiKey: groqKey });
        const completion = await groq.chat.completions.create({
          model: GROQ_MAIN_MODEL,
          temperature: 0.3,
          max_tokens: 512,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: sanitizeForAI(prompt) || prompt },
          ],
        });
        const raw = completion.choices[0]?.message?.content ?? "";
        description = (typeof raw === "string" ? raw : "").trim() || input.results;
      }
    } else if (groqKey) {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MAIN_MODEL,
        temperature: 0.3,
        max_tokens: 512,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: sanitizeForAI(prompt) || prompt },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      description = (typeof raw === "string" ? raw : "").trim() || input.results;
    } else {
      return { success: false, error: "AI service not configured." };
    }

    return { success: true, description };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enhance project description.";
    return { success: false, error: message };
  }
}
