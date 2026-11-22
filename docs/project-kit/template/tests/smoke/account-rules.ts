/** Pure rules for the temporary smoke accounts (unit tested). No imports: used by the smoke setup and by tests/unit. */

/** Every temporary account looks exactly like this. Cleanup only ever touches addresses that match, never a real user. */
export const SMOKE_EMAIL_RE = /^smoke-[a-z0-9]{8,}@example\.com$/;
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function smokeEmail(token: string) {
  const e = `smoke-${token.toLowerCase()}@example.com`;
  if (!SMOKE_EMAIL_RE.test(e)) throw new Error(`bad smoke token: ${token}`);
  return e;
}

export const isSmokeAccount = (email: string | null | undefined) => !!email && SMOKE_EMAIL_RE.test(email);

/** A leftover of a crashed run: a smoke account older than two hours (a live run never lasts that long: CI times out at 20 min). */
export function isStaleSmokeAccount(email: string | null | undefined, createdAt: string | null | undefined, now: number) {
  if (!isSmokeAccount(email) || !createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t > STALE_AFTER_MS;
}
