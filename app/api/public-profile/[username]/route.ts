import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

export type PublicProfileSnapshot = {
  fullName?: string;
  targetRole?: string;
  email?: string;
  profileUrl?: string;
  experience?: string;
  sharpened?: string;
  skills?: string;
};

export type PublicProfileResponse = PublicProfileSnapshot & {
  is_paid: boolean;
  noindex: boolean;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  if (!username?.trim()) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const db = supabase.schema(schema);

  const { data, error } = await db
    .from("public_profiles")
    .select("snapshot, is_paid, noindex")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("public-profile GET error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const snapshot = (data.snapshot as PublicProfileSnapshot) || {};
  const response: PublicProfileResponse = {
    ...snapshot,
    is_paid: Boolean(data.is_paid),
    noindex: Boolean(data.noindex),
  };

  return NextResponse.json(response);
}
