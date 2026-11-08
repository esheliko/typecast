import { configured, smokeClient, SEED } from "./seed";

/** Removes only the rows the setup added, never anything else the account holds. */
export default async function teardown() {
  if (!configured()) return;
  const { sb, userId } = await smokeClient();
  for (const t of ["movie", "tv"] as const) {
    await sb.from("library_items").delete().eq("user_id", userId).eq("tmdb_type", t).in("tmdb_id", SEED.filter((r) => r.tmdb_type === t).map((r) => r.tmdb_id));
  }
}
