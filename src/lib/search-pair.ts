/** "tom hanks + meg ryan", "heat and the irishman", "a vs b", "a, b": the two sides of a connection typed into the search box. */
const SEP = /\s*[+&×,/]\s*|\s+(?:and|with|vs\.?|versus)\s+/i;

export function splitPair(raw: string): [string, string] | null {
  const parts = raw.trim().split(SEP).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2 || parts.some((p) => p.length < 2)) return null;
  return [parts[0], parts[1]];
}
