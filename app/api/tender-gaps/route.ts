import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  getCreditsFromRequest,
  deductSurgicalUnits,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { sanitizeForAI } from "@/lib/sanitize";
import { getGroqKey, GROQ_MAIN_MODEL } from "@/lib/ai-keys";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

export type GapItem = {
  requirement: string;
  status: "Matched" | "Gap";
  fix?: string;
};

const PROMPT = `Does this firm have experience that matches these requirements? For each requirement:
- If YES: show "Matched".
- If NO: show "Gap" and suggest a way to phrase their existing experience to fit (one sentence).

Return ONLY a JSON array: [{"requirement": "string", "status": "Matched" | "Gap", "fix": "string"}].
For "Matched", fix can be empty or a brief confirmation. For "Gap", fix must suggest how to rephrase existing experience.
No markdown, no extra text.`;

async function getDb(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) return { db: null, userId: null };
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { db: null, userId: null };
  return { db: supabase.schema(schema), userId: user.id };
}

function formatPastProjects(pastProjects: unknown): string {
  if (!Array.isArray(pastProjects) || pastProjects.length === 0) {
    return "(No past projects saved.)";
  }
  return pastProjects
    .map((p: unknown) => {
      if (p && typeof p === "object") {
        const obj = p as { title?: string; description?: string; client?: string; year?: string; results?: string };
        const t = obj.title ?? "Project";
        if (obj.results || obj.client || obj.year) {
          const parts = [obj.client, obj.year].filter(Boolean).join(", ");
          const desc = parts ? `${parts}: ${obj.results ?? ""}`.trim() : (obj.results ?? "").trim();
          return `${t}: ${desc}`.trim();
        }
        return `${t}: ${obj.description ?? ""}`.trim();
      }
      return typeof p === "string" ? p : JSON.stringify(p);
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { db } = await getDb(req);
    if (!db) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await db
      .from("firm_profiles")
      .select("past_projects")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("tender-gaps profile fetch error:", profileError);
      return NextResponse.json({ error: "Failed to fetch firm profile." }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json(
        { error: "No firm profile saved. Add your company profile and past projects first." },
        { status: 404 }
      );
    }

    const pastProjectsText = formatPastProjects((profile as { past_projects?: unknown }).past_projects);
    if (pastProjectsText === "(No past projects saved.)") {
      return NextResponse.json(
        { error: "No past projects saved. Add past projects to your firm profile first." },
        { status: 404 }
      );
    }

    const body = (await req.json()) as { tenderRequirements?: string };
    const tenderRequirements = typeof body.tenderRequirements === "string" ? body.tenderRequirements : "";
    if (!tenderRequirements.trim()) {
      return NextResponse.json(
        { error: "Tender requirements are required." },
        { status: 400 }
      );
    }

    const cost = getCost("TENDER_COMPLIANCE");
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

    const apiKey = getGroqKey();
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const tender = sanitizeForAI(tenderRequirements) || "(No tender requirements.)";
    const projects = sanitizeForAI(pastProjectsText) || "(No past projects.)";

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: GROQ_MAIN_MODEL,
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n---\n\nTender Requirements:\n${tender}\n\n---\n\nFirm Past Projects:\n${projects}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const text = (typeof raw === "string" ? raw : "").trim();
    if (!text) throw new Error("Groq returned empty");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr) as unknown;

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "AI did not return a valid JSON array." }, { status: 500 });
    }

    const items: GapItem[] = parsed
      .filter(
        (x): x is { requirement?: string; status?: string; fix?: string } =>
          x != null && typeof x === "object"
      )
      .map((x) => ({
        requirement: typeof x.requirement === "string" ? x.requirement : String(x.requirement ?? ""),
        status: x.status === "Matched" ? "Matched" : "Gap",
        fix: typeof x.fix === "string" ? x.fix : "",
      }))
      .filter((r) => r.requirement.trim().length > 0);

    return NextResponse.json({
      items,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("tender-gaps API error:", err);
    return NextResponse.json(
      { error: "Failed to analyze gaps. Please try again." },
      { status: 500 }
    );
  }
}
