import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isSmokeAccount, isStaleSmokeAccount, smokeEmail } from "./account-rules";

/**
 * Temporary smoke accounts. With SUPABASE_SERVICE_ROLE_KEY set, every Playwright run creates its own user (email confirmed, random
 * password), the tests sign in as it, and teardown deletes it (the library, profile and import rows cascade). Runs never share a user,
 * so any number can run at once. Without the key the suite falls back to the shared SMOKE_EMAIL account (see seed.ts `configured`).
 * The key can touch every user, so this file only ever deletes addresses that match `isSmokeAccount`.
 */
export const hasServiceKey = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

/** The key as pasted into a secret: stray whitespace or quotes are a common slip. */
const serviceKey = () => (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim().replace(/^["']|["']$/g, "");

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createSmokeAccount() {
  const email = smokeEmail(randomBytes(6).toString("hex"));
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    const k = serviceKey();
    const hint = /^eyJ/.test(k) ? "" : ` (SUPABASE_SERVICE_ROLE_KEY does not look like the legacy service_role JWT: it should start with "eyJ", not "sb_" and not the anon key; it has ${k.length} characters)`;
    throw new Error(`Cannot create the smoke account: ${error?.message}${hint}`);
  }
  return { email, password, userId: data.user.id };
}

/** Deletes one smoke account by id, after checking it really is one. Safe to call twice. */
export async function deleteSmokeAccount(userId: string) {
  const a = admin();
  const { data } = await a.auth.admin.getUserById(userId);
  if (!data.user) return; // already gone
  if (!isSmokeAccount(data.user.email)) throw new Error(`Refusing to delete ${userId}: not a smoke account`);
  const { error } = await a.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Cannot delete the smoke account: ${error.message}`);
}

/** Removes smoke accounts left behind by crashed or killed runs. Best effort: never fails a run. */
export async function sweepStaleSmokeAccounts() {
  try {
    const a = admin();
    const now = Date.now();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data.users.length) break;
      for (const u of data.users) if (isStaleSmokeAccount(u.email, u.created_at, now)) await a.auth.admin.deleteUser(u.id);
      if (data.users.length < 200) break;
    }
  } catch (e) {
    console.warn(`Smoke: stale account sweep skipped: ${(e as Error).message}`);
  }
}
