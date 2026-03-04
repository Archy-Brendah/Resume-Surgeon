import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { ViewResume, type ViewProfile } from "./ViewResume";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const schema = "resume_surgeon";

async function getProfile(username: string): Promise<ViewProfile | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase
    .schema(schema)
    .from("public_profiles")
    .select("snapshot, is_paid, noindex")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  const snapshot = (data.snapshot as Record<string, unknown>) || {};
  return {
    fullName: typeof snapshot.fullName === "string" ? snapshot.fullName : undefined,
    targetRole: typeof snapshot.targetRole === "string" ? snapshot.targetRole : undefined,
    email: typeof snapshot.email === "string" ? snapshot.email : undefined,
    profileUrl: typeof snapshot.profileUrl === "string" ? snapshot.profileUrl : undefined,
    experience: typeof snapshot.experience === "string" ? snapshot.experience : undefined,
    sharpened: typeof snapshot.sharpened === "string" ? snapshot.sharpened : undefined,
    skills: typeof snapshot.skills === "string" ? snapshot.skills : undefined,
    is_paid: Boolean(data.is_paid),
    noindex: (data as { noindex?: boolean }).noindex !== false,
  };
}

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return { title: "Not Found" };
  const noindex = profile.noindex;
  return {
    title: `${profile.fullName || "Resume"} – Executive Resume`,
    description: `Executive resume${profile.targetRole ? ` · ${profile.targetRole}` : ""}`,
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}

export default async function ViewPage({ params }: Props) {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) notFound();
  return <ViewResume profile={profile} />;
}
