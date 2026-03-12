import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProfileStatus } from "@/lib/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

function generateUsername(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export type PublicProfileSnapshot = {
  fullName?: string;
  targetRole?: string;
  email?: string;
  profileUrl?: string;
  experience?: string;
  sharpened?: string;
  skills?: string;
  education?: string;
  projects?: string;
  certification?: string;
};

async function getAuthUser(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id };
}

/**
 * Create or update public profile (live portfolio). No Surgical Units (SUs) are deducted—
 * SUs are only consumed for AI-generation tasks (Sharpen, Match, LinkedIn, etc.).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { username?: string; noindex?: boolean; snapshot?: PublicProfileSnapshot };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const snapshot = body.snapshot ?? {};
  const noindex = body.noindex !== false;
  const status = await getProfileStatus(user.userId);
  const is_paid = status.is_paid;

  const db = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
  }).schema(schema);

  let username = typeof body.username === "string" ? body.username.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "") : null;
  if (username && username.length < 2) username = null;

  const { data: existing } = await db
    .from("public_profiles")
    .select("id, username")
    .eq("user_id", user.userId)
    .maybeSingle();

  if (existing) {
    const updates: { snapshot: PublicProfileSnapshot; noindex: boolean; is_paid: boolean; updated_at: string; username?: string } = {
      snapshot,
      noindex,
      is_paid,
      updated_at: new Date().toISOString(),
    };
    if (username && username !== existing.username) {
      const { data: conflict } = await db.from("public_profiles").select("id").eq("username", username).maybeSingle();
      if (conflict) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      updates.username = username;
    }
    const { error: updateError } = await db
      .from("public_profiles")
      .update(updates)
      .eq("user_id", user.userId);
    if (updateError) {
      console.error("public-profile POST update error:", updateError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
    const finalUsername = updates.username ?? existing.username;
    return NextResponse.json({
      url: `${APP_URL.replace(/\/$/, "")}/view/${finalUsername}`,
      username: finalUsername,
    });
  }

  if (!username) {
    let candidate = generateUsername();
    for (let i = 0; i < 5; i++) {
      const { data: taken } = await db.from("public_profiles").select("id").eq("username", candidate).maybeSingle();
      if (!taken) break;
      candidate = generateUsername();
    }
    username = candidate;
  } else {
    const { data: taken } = await db.from("public_profiles").select("id").eq("username", username).maybeSingle();
    if (taken) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  const { error: insertError } = await db.from("public_profiles").insert({
    user_id: user.userId,
    username,
    snapshot,
    noindex,
    is_paid,
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error("public-profile POST insert error:", insertError);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  return NextResponse.json({
    url: `${APP_URL.replace(/\/$/, "")}/view/${username}`,
    username,
  });
}
