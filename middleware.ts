import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = ["/", "/builder", "/proposals"];
const publicPaths = ["/login", "/signup", "/view"];

export async function middleware(request: NextRequest) {
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

  const { data: { session } } = await supabase.auth.getSession();
  const path = request.nextUrl.pathname;
  const isProtected = protectedPaths.some((p) => p === path || path.startsWith(p + "/"));
  const isPublic = publicPaths.some((p) => p === path || path.startsWith(p + "/"));

  if (isProtected && !session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isPublic && session && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/", "/builder", "/builder/:path*", "/proposals", "/proposals/:path*", "/login", "/signup", "/view", "/view/:path*"],
};
