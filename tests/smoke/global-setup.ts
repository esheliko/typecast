import type { FullConfig } from "@playwright/test";
import { saveLogin } from "./auth";
import { configured, deleteRows, smokeClient, SCRATCH, SEED } from "./seed";

export default async function setup(config: FullConfig) {
  if (process.env.SMOKE_SKIP_SETUP) return; // the concurrent visual run only reads; the core run owns seeding and cleanup
  if (!configured()) { console.warn("Smoke: SMOKE_EMAIL/SMOKE_PASSWORD or Supabase env missing, authenticated pages are skipped."); return; }
  const { sb, userId } = await smokeClient();
  await deleteRows(sb, userId, SCRATCH); // leftovers of a crashed run
  const { error } = await sb.from("library_items").upsert(SEED.map((r) => ({ ...r, user_id: userId, note: "" })), { onConflict: "user_id,tmdb_type,tmdb_id" });
  if (error) throw new Error(`Smoke seed failed: ${error.message}`);
  await saveLogin(config.projects[0].use.baseURL ?? "http://localhost:3100"); // one login for every signed-in test of the core run
}
