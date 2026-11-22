import { deleteSmokeAccount } from "./account";
import { clearLogin } from "./auth";
import { configured, deleteRows, smokeClient, SCRATCH, SEED } from "./seed";

/** Deletes the run's temporary account (rows cascade). On the shared-account fallback it removes only the rows the setup seeded and the scratch titles. */
export default async function teardown() {
  if (!configured()) return;
  const tempId = process.env.SMOKE_USER_ID;
  if (tempId) {
    clearLogin(tempId);
    await deleteSmokeAccount(tempId);
    return;
  }
  if (process.env.SMOKE_SKIP_SETUP) return; // fallback mode: only the core run cleans up
  const { sb, userId } = await smokeClient();
  clearLogin(userId);
  await deleteRows(sb, userId, SEED);
  await deleteRows(sb, userId, SCRATCH);
}
