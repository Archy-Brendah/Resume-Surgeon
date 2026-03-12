import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

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

/**
 * POST /api/tender-cache
 * Store extracted tender data (JSON). Auth required.
 */
export async function POST(req: Request) {
  try {
    const { db, userId } = await getDb(req);
    if (!db || !userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await req.json();
    const source = body.source === "typed" ? "typed" : "pdf";
    const tenderKey = typeof body.tender_key === "string" ? body.tender_key : null;
    const tenderRef = typeof body.tender_ref === "string" ? body.tender_ref : null;
    const tenderData = body.tender_data && typeof body.tender_data === "object" ? body.tender_data : null;

    if (!tenderData) {
      return NextResponse.json({ error: "tender_data is required." }, { status: 400 });
    }

    const { data, error } = await db
      .from("tender_cache")
      .insert({
        user_id: userId,
        source,
        tender_key: tenderKey,
        tender_ref: tenderRef,
        tender_data: tenderData,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[tender-cache] insert error:", error);
      return NextResponse.json({ error: "Failed to save tender." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error("[tender-cache] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/tender-cache
 * Fetch the user's most recent tender from cache.
 */
export async function GET(req: Request) {
  try {
    const { db, userId } = await getDb(req);
    if (!db || !userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { data, error } = await db
      .from("tender_cache")
      .select("id, tender_data, tender_ref, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[tender-cache] GET error:", error);
      return NextResponse.json({ error: "Failed to fetch tender." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ tender: null });
    }

    return NextResponse.json({
      tender: {
        id: data.id,
        tender_data: data.tender_data,
        tender_ref: data.tender_ref,
        created_at: data.created_at,
      },
    });
  } catch (err) {
    console.error("[tender-cache] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
