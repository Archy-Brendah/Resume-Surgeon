import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const db = supabase.schema(schema);
  const { data: existing } = await db.from("user_assets").select("user_id").eq("user_id", user.id).maybeSingle();

  if (!existing) {
    const { error: insertError } = await db.from("user_assets").insert({
      user_id: user.id,
      is_paid: false,
      tier: "free",
      ai_credits: 0,
    });
    if (insertError) {
      console.error("ensure-user-asset insert error:", insertError);
      return NextResponse.json({ error: "Failed to create user asset" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
