import { NextResponse } from "next/server";
import { getCost } from "@/lib/su-costs";
import {
  getUserIdFromRequest,
  checkGlobalGuard,
  deductSurgicalUnits,
  getCreditsFromRequest,
  refundUnits,
  REFILL_PAYLOAD,
} from "@/lib/credits";
import { callSurgicalAIForJSON } from "@/lib/ai-rotator";
import { sanitizeForAI } from "@/lib/sanitize";

const SYSTEM_PROMPT = `You are a recruitment parser. Extract the following from the resume text into a single valid JSON object with no other text or markdown.
Use this exact structure (use empty strings or empty arrays if not found):
{
  "name": "full name",
  "email": "email address",
  "phone": "phone number or empty string",
  "location": "city/country or empty string",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "company": "company name",
      "role": "job title",
      "duration": "e.g. Jan 2020 - Present",
      "bullets": ["achievement 1", "achievement 2", ...]
    }
  ],
  "education": [
    {
      "school": "school name",
      "degree": "e.g. B.S. Computer Science",
      "year": "e.g. 2019"
    }
  ]
}
Return only the JSON object, no code block or explanation.`;

export type AutofillParsed = {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  skills?: string[];
  experience?: Array<{
    company?: string;
    role?: string;
    duration?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    year?: string;
  }>;
};


export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawText = typeof body?.text === "string" ? body.text : "";
    const text = sanitizeForAI(rawText);
    if (!text || text.length < 20) {
      return NextResponse.json(
        { error: "Resume text too short. Upload a PDF or paste more content." },
        { status: 400 }
      );
    }

    const cost = getCost("SURGICAL_AUTOFILL");
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

    const result = await callSurgicalAIForJSON(
      SYSTEM_PROMPT,
      `Resume text to extract:\n\n${text}`
    );

    if (!result.success) {
      await refundUnits(req, cost);
      return NextResponse.json(
        { error: result.error || "AI could not parse the resume. Try uploading a clearer PDF or more text." },
        { status: 502 }
      );
    }

    let parsed: AutofillParsed;
    try {
      parsed = JSON.parse(result.json) as AutofillParsed;
    } catch {
      await refundUnits(req, cost);
      return NextResponse.json(
        { error: "Failed to parse AI response. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...parsed,
      creditsRemaining: deductResult.creditsRemaining,
    });
  } catch (err) {
    console.error("surgical-autofill error:", err);
    return NextResponse.json(
      { error: "Surgical Auto-Fill failed. Please try again." },
      { status: 500 }
    );
  }
}
