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
 * GET /api/proposals/[id]
 * Fetch a single proposal by id for re-download. Auth required.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db, userId } = await getDb(req);
    if (!db || !userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Proposal id required." }, { status: 400 });
    }

    const { data, error } = await db
      .from("proposals")
      .select("id, title, snapshot, track, created_at")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[proposals] GET [id] error:", error);
      return NextResponse.json({ error: "Failed to fetch proposal." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      title: data.title,
      track: data.track,
      created_at: data.created_at,
      snapshot: data.snapshot,
    });
  } catch (err) {
    console.error("[proposals] GET [id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
