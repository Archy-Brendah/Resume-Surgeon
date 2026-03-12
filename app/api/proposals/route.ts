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
 * POST /api/proposals
 * Store a generated proposal snapshot. Auth required.
 */
export async function POST(req: Request) {
  try {
    const { db, userId } = await getDb(req);
    if (!db || !userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const clientName = typeof body.client_name === "string" ? body.client_name : null;
    const tenderRef = typeof body.tender_ref === "string" ? body.tender_ref : null;
    const tenderName = typeof body.tender_name === "string" ? body.tender_name : null;
    const track = body.track === "freelancer" ? "freelancer" : "firm";
    const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;

    if (!title) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }
    if (!snapshot) {
      return NextResponse.json({ error: "snapshot is required." }, { status: 400 });
    }

    const { data, error } = await db
      .from("proposals")
      .insert({
        user_id: userId,
        title,
        client_name: clientName,
        tender_ref: tenderRef,
        tender_name: tenderName,
        track,
        snapshot,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[proposals] insert error:", error);
      return NextResponse.json({ error: "Failed to save proposal." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id, created_at: data?.created_at });
  } catch (err) {
    console.error("[proposals] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * GET /api/proposals
 * List the user's proposals (for history).
 */
export async function GET(req: Request) {
  try {
    const { db, userId } = await getDb(req);
    if (!db || !userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { data, error } = await db
      .from("proposals")
      .select("id, title, client_name, tender_ref, tender_name, track, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[proposals] GET error:", error);
      return NextResponse.json({ error: "Failed to fetch proposals." }, { status: 500 });
    }

    return NextResponse.json({ proposals: data ?? [] });
  } catch (err) {
    console.error("[proposals] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
