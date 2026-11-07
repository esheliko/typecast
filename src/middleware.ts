import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const OPEN = ["/login", "/offline"];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Typecast is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.", { status: 500 });

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  // getClaims() checks the signed token locally (the project uses asymmetric signing keys), so there is no round trip to Supabase on every request.
  const { data } = await sb.auth.getClaims();
  const user = data?.claims ?? null;
  const path = req.nextUrl.pathname;
  const open = OPEN.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !open) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const to = req.nextUrl.clone(); to.pathname = "/login"; to.search = "";
    return NextResponse.redirect(to);
  }
  if (user && path === "/login") {
    const to = req.nextUrl.clone(); to.pathname = "/"; to.search = "";
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|api/version|manifest.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
