/** How a credit's part is worded on the Watching now page. Pure; unit tested in tests/unit/roster.test.ts. */

/** Credits that are the actor playing themselves, or not credited: the classic cameo. */
export const CAMEO = /\b(cameo|himself|herself|themselves|self|uncredited|archive footage|special appearance|special guest)\b/i;

/** "Self" is a bare label; say what it means. Otherwise the character, tidied. */
export function roleLabel(role: string): string {
  const r = role.replace(/\s*\((uncredited|archive footage)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (!r) return CAMEO.test(role) ? "Uncredited" : "";
  if (/^(self|himself|herself|themselves)$/i.test(r)) return "Appears as themselves";
  if (/^(self|himself|herself|themselves)\b/i.test(r)) return `Appears as themselves ${r.replace(/^\w+\s*/, "")}`.trim();
  return r;
}
