import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  try {
    if (!CRON_SECRET) {
      console.error("CRON_SECRET is not set");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Supabase service env vars missing");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const expected = `Bearer ${CRON_SECRET}`;
    if (authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { fetch },
    });

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .schema("resume_surgeon")
      .from("tender_cache")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);

    if (error) {
      console.error("[admin/cleanup] tender_cache delete error:", error.message);
      return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (err) {
    console.error("[admin/cleanup] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

