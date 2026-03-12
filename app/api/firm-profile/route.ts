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
 * GET /api/firm-profile
 * Returns the authenticated user's firm_profile as a formatted string for tender compliance.
 * Requires Authorization: Bearer <token>
 */
export async function GET(req: Request) {
  try {
    const { db, userId } = await getDb(req);
    if (!db || !userId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const { data, error } = await db
      .from("firm_profiles")
      .select("company_name, bio, core_services, past_projects")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("firm-profile GET error:", error);
      return NextResponse.json({ error: "Failed to fetch firm profile." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "No firm profile saved. Add your company profile first.", profileText: "" },
        { status: 404 }
      );
    }

    const companyName = typeof (data as { company_name?: string }).company_name === "string"
      ? (data as { company_name: string }).company_name
      : "";
    const bio = typeof (data as { bio?: string }).bio === "string"
      ? (data as { bio: string }).bio
      : "";
    const pastProjects = (data as { past_projects?: unknown }).past_projects;

    const parts: string[] = [];
    if (companyName.trim()) parts.push(`Company: ${companyName.trim()}`);
    if (bio.trim()) parts.push(bio.trim());
    const rawServices = (data as { core_services?: unknown }).core_services;
    if (Array.isArray(rawServices) && rawServices.length > 0) {
      const services = rawServices.map((s) => String(s ?? "")).filter(Boolean).join(", ");
      if (services) parts.push(`Core Services: ${services}`);
    }
    if (Array.isArray(pastProjects) && pastProjects.length > 0) {
      const projectText = pastProjects
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
        .join("\n");
      if (projectText) parts.push(`Past Projects:\n${projectText}`);
    }

    const profileText = parts.join("\n\n").trim();
    if (!profileText) {
      return NextResponse.json(
        { error: "Firm profile is empty. Add company name, bio, or past projects.", profileText: "" },
        { status: 404 }
      );
    }

    return NextResponse.json({ profileText });
  } catch (err) {
    console.error("firm-profile GET error:", err);
    return NextResponse.json({ error: "Failed to fetch firm profile." }, { status: 500 });
  }
}
