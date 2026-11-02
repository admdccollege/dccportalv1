import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/auth/callback", "/offline", "/verify", "/api/cron"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const remember = request.cookies.get("dcc-remember")?.value !== "0";
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            const opts = { ...options };
            if (!remember) { delete opts.maxAge; delete opts.expires; }
            response.cookies.set(name, value, opts);
          }
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" ? false : PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|sw.js|manifest.json|icons|templates|favicon.ico).*)"],
};
