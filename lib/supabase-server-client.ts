import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for server-side use (Server Actions, Route Handlers, Server Components).
 * Uses cookies to read the user session. Call from server context only.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored when called from Server Component
          }
        },
      },
    }
  );
}

/**
 * Returns the validated user and access token. Uses getUser() to authenticate against
 * the Supabase Auth server instead of trusting getSession() from cookies.
 * Returns null if not authenticated or token is invalid.
 */
export async function getValidatedUser(): Promise<
  { user: User; accessToken: string } | null
> {
  const supabase = await createServerSupabaseClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) return null;

  const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
  if (userError || !user) return null;

  return { user, accessToken: session.access_token };
}
