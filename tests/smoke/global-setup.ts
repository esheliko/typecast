import type { FullConfig } from "@playwright/test";
import { createSmokeAccount, deleteSmokeAccount, hasServiceKey, sweepStaleSmokeAccounts } from "./account";
import { saveLogin } from "./auth";
import { configured, deleteRows, smokeClient, SCRATCH, SEED } from "./seed";

async function seed(sb: Awaited<ReturnType<typeof smokeClient>>["sb"], userId: string) {
  const { error } = await sb.from("library_items").upsert(SEED.map((r) => ({ ...r, user_id: userId, note: "" })), { onConflict: "user_id,tmdb_type,tmdb_id" });
  if (error) throw new Error(`Smoke seed failed: ${error.message}`);
}

export default async function setup(config: FullConfig) {
  if (!configured()) { console.warn("Smoke: Supabase env, or SUPABASE_SERVICE_ROLE_KEY (or SMOKE_EMAIL/SMOKE_PASSWORD), missing: authenticated pages are skipped."); return; }
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3100";

  if (hasServiceKey()) {
    // A temporary account for THIS run only. The env vars are inherited by the workers, so every test signs in as it.
    const shared = { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD };
    let createdId: string | undefined;
    try {
      await sweepStaleSmokeAccounts();
      const acct = await createSmokeAccount();
      createdId = acct.userId;
      process.env.SMOKE_EMAIL = acct.email;
      process.env.SMOKE_PASSWORD = acct.password;
      process.env.SMOKE_USER_ID = acct.userId; // teardown deletes it; if that never runs, the next run's sweep does
      const { sb, userId } = await smokeClient();
      await seed(sb, userId);
      await saveLogin(baseURL, acct.userId);
      return;
    } catch (e) {
      // A bad secret must not turn all of main red: use the shared account if there is one, and say so loudly.
      delete process.env.SMOKE_USER_ID;
      if (createdId) await deleteSmokeAccount(createdId).catch(() => {}); // do not leak a half-made account
      for (const [k, v] of [["SMOKE_EMAIL", shared.email], ["SMOKE_PASSWORD", shared.password]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      const msg = `Smoke: temporary account failed (${(e as Error).message}); falling back to the shared SMOKE_EMAIL account.`;
      console.warn(`::warning::${msg}`);
      if (!(process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD)) throw e;
    }
  }

  // Fallback: the one shared account. Overlapping runs wipe each other's rows here, so the concurrent visual run only reads (SMOKE_SKIP_SETUP).
  if (process.env.SMOKE_SKIP_SETUP) return;
  console.warn("Smoke: using the shared SMOKE_EMAIL account (no SUPABASE_SERVICE_ROLE_KEY): do not run two smoke runs at once.");
  const { sb, userId } = await smokeClient();
  await deleteRows(sb, userId, SCRATCH); // leftovers of a crashed run
  await seed(sb, userId);
  await saveLogin(baseURL, userId);
}
