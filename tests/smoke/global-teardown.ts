import { configured, deleteRows, smokeClient, SCRATCH, SEED } from "./seed";

/** Removes only the rows the setup seeded and the scratch titles the tests create, never anything else the account holds. */
export default async function teardown() {
  if (process.env.SMOKE_SKIP_SETUP || !configured()) return; // see global-setup: only the core run cleans up
  const { sb, userId } = await smokeClient();
  await deleteRows(sb, userId, SEED);
  await deleteRows(sb, userId, SCRATCH);
}
