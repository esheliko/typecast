import { createClient } from "@supabase/supabase-js";

/** Rows the smoke user is given and the tests create themselves. Empty in a new project: add `{ table, ... }` rows here as features appear
 *  and delete them in `deleteRows`. Temporary accounts (SUPABASE_SERVICE_ROLE_KEY) cascade-delete everything with the user. */
export const SEED: readonly { id: string }[] = [];
export const SCRATCH: readonly { id: string }[] = [];

/** Backstop cleanup for the shared-account fallback. Nothing to delete yet. */
export async function deleteRows(..._args: unknown[]) { /* extend when SEED/SCRATCH hold rows */ }

/** Signed-in tests can run: Supabase is configured and there is either the service-role key (a temporary account per run, account.ts)
 *  or the shared SMOKE_EMAIL/SMOKE_PASSWORD account. */
export function configured() {
  const base = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return base && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD));
}

/** Signed-in Supabase client for the smoke user. Refuses anything that does not look like a dedicated test account. */
export async function smokeClient() {
  const email = process.env.SMOKE_EMAIL!;
  if (!/smoke|test/i.test(email)) throw new Error(`SMOKE_EMAIL must be a dedicated test account (its address must contain "smoke" or "test"); got ${email}`);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: process.env.SMOKE_PASSWORD! });
  if (error || !data.user) throw new Error(`Smoke user cannot sign in: ${error?.message}`);
  return { sb, userId: data.user.id };
}
