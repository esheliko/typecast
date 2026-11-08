import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component: the proxy refreshes the session */ }
      },
    },
  });
}

export async function requireUser() {
  const sb = await supabaseServer();
  // Verified locally from the signed token: no extra round trip before every write. RLS is still the backstop.
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) throw new Error("Not signed in");
  return { sb, user: { id: data.claims.sub, email: data.claims.email as string | undefined } };
}
