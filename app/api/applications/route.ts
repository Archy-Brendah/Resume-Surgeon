import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

export type ApplicationRow = {
  id: string;
  user_id: string;
  company_name: string;
  job_title: string;
  status: string;
  date_applied: string;
  link: string | null;
  created_at: string;
};

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

export async function GET(request: NextRequest) {
  const { db, userId } = await getDb(request);
  if (!db || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await db
    .from("applications")
    .select("id, company_name, job_title, status, date_applied, link, created_at")
    .eq("user_id", userId)
    .order("date_applied", { ascending: false });

  if (error) {
    console.error("applications GET error:", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
  return NextResponse.json({ applications: data ?? [] });
}

export async function POST(request: NextRequest) {
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
  const company_name = String(body.company_name ?? "").trim();
  const job_title = String(body.job_title ?? "").trim();
  const status = ["Applied", "Interview", "Offer", "Rejected"].includes(String(body.status ?? ""))
    ? body.status
    : "Applied";
  const date_applied = body.date_applied || new Date().toISOString().slice(0, 10);
  const link = body.link ? String(body.link).trim() || null : null;

  if (!company_name || !job_title) {
    return NextResponse.json({ error: "company_name and job_title are required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("applications")
    .insert({
      user_id: userId,
      company_name,
      job_title,
      status,
      date_applied,
      link,
    })
    .select("id, company_name, job_title, status, date_applied, link, created_at")
    .single();

  if (error) {
    console.error("applications POST error:", error);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }
  return NextResponse.json(data);
}
