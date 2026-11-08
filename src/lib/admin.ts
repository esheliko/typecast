import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";

/** The one account allowed to manage users. Override with ADMIN_EMAIL. */
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "esheliko@gmail.com").toLowerCase();

export const isAdminEmail = (email?: string | null) => !!email && email.toLowerCase() === ADMIN_EMAIL;

/** Signed-in admin or throws. The service-role client is only ever built after this check. */
export async function requireAdmin() {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) throw new Error("Not allowed");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin, user };
}
