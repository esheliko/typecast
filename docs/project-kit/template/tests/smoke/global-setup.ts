import type { FullConfig } from "@playwright/test";
import { createSmokeAccount, deleteSmokeAccount, hasServiceKey, sweepStaleSmokeAccounts } from "./account";
import { saveLogin } from "./auth";
import { configured, smokeClient } from "./seed";

export default async function setup(config: FullConfig) {
  if (!configured()) { console.warn("Smoke: Supabase env, or SUPABASE_SERVICE_ROLE_KEY (or SMOKE_EMAIL/SMOKE_PASSWORD), missing: signed-in pages are skipped."); return; }
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3100";

  if (hasServiceKey()) {
    // A temporary account for THIS run only; the env vars are inherited by the workers. Teardown deletes it, the next run's sweep catches leftovers.
    const shared = { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD };
    let createdId: string | undefined;
    try {
      await sweepStaleSmokeAccounts();
      const acct = await createSmokeAccount();
      createdId = acct.userId;
      process.env.SMOKE_EMAIL = acct.email;
      process.env.SMOKE_PASSWORD = acct.password;
      process.env.SMOKE_USER_ID = acct.userId;
      await saveLogin(baseURL, acct.userId);
      return;
    } catch (e) {
      delete process.env.SMOKE_USER_ID;
      if (createdId) await deleteSmokeAccount(createdId).catch(() => {});
      for (const [k, v] of [["SMOKE_EMAIL", shared.email], ["SMOKE_PASSWORD", shared.password]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      console.warn(`::warning::Smoke: temporary account failed (${(e as Error).message}); falling back to the shared SMOKE_EMAIL account.`);
      if (!(process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD)) throw e;
    }
  }

  // Fallback: the one shared account. The concurrent visual run only reads (SMOKE_SKIP_SETUP).
  if (process.env.SMOKE_SKIP_SETUP) return;
  const { userId } = await smokeClient();
  await saveLogin(baseURL, userId);
}
