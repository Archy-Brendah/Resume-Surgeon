import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

async function getDb(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { db: null, userId: null };
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { db: null, userId: null };
  return { db: supabase.schema(schema), userId: user.id };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { db, userId } = await getDb(request);
  if (!db || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { company_name?: string; job_title?: string; status?: string; date_applied?: string; link?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.company_name !== undefined) updates.company_name = String(body.company_name).trim();
  if (body.job_title !== undefined) updates.job_title = String(body.job_title).trim();
  if (["Applied", "Interview", "Offer", "Rejected"].includes(String(body.status ?? ""))) updates.status = body.status;
  if (body.date_applied !== undefined) updates.date_applied = body.date_applied;
  if (body.link !== undefined) updates.link = body.link ? String(body.link).trim() || null : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("applications")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, company_name, job_title, status, date_applied, link, created_at")
    .single();

  if (error) {
    console.error("applications PATCH error:", error);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { db, userId } = await getDb(request);
  if (!db || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await db
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("applications DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete application" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
