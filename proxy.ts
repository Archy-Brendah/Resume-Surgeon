import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = ["/builder", "/proposals"];
const publicPaths = ["/", "/login", "/signup", "/view"];

/**
 * Refreshes the Supabase session and syncs auth cookies on each request.
 * Required so server actions and API routes can read the session from cookies.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() refreshes the session and updates cookies
  const { data: { session } } = await supabase.auth.getSession();
  // getUser() validates the token against Auth server; don't trust session for auth decisions
  const user = session?.access_token
    ? (await supabase.auth.getUser(session.access_token)).data?.user
    : null;

  const path = request.nextUrl.pathname;
  const isProtected = protectedPaths.some(
    (p) => p === path || path.startsWith(p + "/")
  );
  const isPublic = publicPaths.some(
    (p) => p === path || path.startsWith(p + "/")
  );

  if (isProtected && !user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isPublic && user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     * Include "/" so session is refreshed when user visits dashboard.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
