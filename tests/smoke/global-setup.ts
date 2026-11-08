import { configured, smokeClient, SEED } from "./seed";

export default async function setup() {
  if (!configured()) { console.warn("Smoke: SMOKE_EMAIL/SMOKE_PASSWORD or Supabase env missing, authenticated pages are skipped."); return; }
  const { sb, userId } = await smokeClient();
  const { error } = await sb.from("library_items").upsert(SEED.map((r) => ({ ...r, user_id: userId, note: "" })), { onConflict: "user_id,tmdb_type,tmdb_id" });
  if (error) throw new Error(`Smoke seed failed: ${error.message}`);
}
