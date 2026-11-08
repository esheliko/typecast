/** Pure helpers for matching a typed title against TMDB titles. No network: unit tested in tests/unit/title-match.test.ts. */

const NUM_WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
const DIGIT_WORDS = Object.fromEntries(Object.entries(NUM_WORDS).map(([w, d]) => [d, w]));
const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
const STOP = new Set(["the", "a", "an", "and", "of", "in"]);
const SEQ_WORD = new Set(["part", "pt", "chapter", "vol", "volume"]);

/**
 * A title as comparable words. Forgiving on purpose: case, accents, punctuation and apostrophes vanish, "&" is "and",
 * number words are digits ("Five Feet Apart" = "5 feet apart"), a trailing "II" is "2", "Part"/"Vol." before a final
 * number is dropped, and small words (the, a, and, of, in) are ignored wherever they stand.
 */
export function toks(s: string): string[] {
  let w = s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  w = w.map((x) => NUM_WORDS[x] ?? x);
  const keep = w.filter((x) => !STOP.has(x));
  if (keep.length) w = keep;
  const last = w.length - 1;
  if (last > 0 && ROMAN[w[last]]) w[last] = ROMAN[w[last]];
  if (last > 0 && /^\d+$/.test(w[last]) && SEQ_WORD.has(w[last - 1])) w.splice(last - 1, 1);
  return w;
}
/** The words of a title run together, so "Dead pool" and "Deadpool" and "Spider-Man" compare equal. */
export const normSeq = (s: string): string => toks(s).join("");

/** The part of a title before its subtitle: "Thor: Ragnarok" is "Thor". */
export const head = (t: string): string => t.split(/\s*[:–—-]\s+/)[0];

/** Edit distance between two short strings. */
export function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Do the title's first words, run together, spell `joined`? (Word boundaries must line up: "spy kids 3" starts "Spy Kids 3-D", not "Spy Kids 30".) */
function startsWith(tt: string[], joined: string): boolean {
  let acc = "";
  for (let i = 0; i < tt.length; i++) {
    acc += tt[i];
    if (acc === joined) return i < tt.length - 1;
    if (acc.length >= joined.length) return false;
  }
  return false;
}
/** Do the title's last words, run together, spell `joined`? */
function endsWith(tt: string[], joined: string): boolean {
  let acc = "";
  for (let i = tt.length - 1; i >= 0; i--) {
    acc = tt[i] + acc;
    if (acc === joined) return i > 0;
    if (acc.length >= joined.length) return false;
  }
  return false;
}
/** Does the longer title start with the shorter one's words ("Descendants 2" starts "Descendants")? */
export const startsWithWords = (long: string, short: string): boolean => { const s = toks(short).join(""); return !!s && startsWith(toks(long), s); };
/** Are all of `want` found in `tt`, in order (other words may sit between)? */
const inOrder = (want: string[], tt: string[]): boolean => { let i = 0; for (const x of tt) if (x === want[i]) i++; return i === want.length; };

/**
 * How well a TMDB result matches the typed name:
 * 3 the same title (sequel numbers, "&", number words, small words ignored; "Spy kids 3" is "Spy Kids 3-D: Game Over"),
 * 2 the typed name is the start, the end or the main words of a longer title ("Thor" and "Thor: Ragnarok", "Glass onion knives out"),
 * 1 a near miss (a typo, or the same words in another order), 0 no match.
 * A trailing " 1" also matches the first film.
 */
export function score(titles: (string | undefined)[], name: string): number {
  const nt = toks(name);
  if (!nt.length) return 0;
  const joined = nt.join("");
  const wants = [joined];
  const m = name.trim().match(/^(.{2,}?)\s+1$/);
  if (m) wants.push(normSeq(m[1]));
  const ts = titles.filter((t): t is string => !!t);
  const tts = ts.map(toks);
  if (tts.some((tt) => wants.includes(tt.join("")))) return 3;
  // A sequel number settles it: "Spy kids 3" is the title that starts "Spy Kids 3".
  const last = nt[nt.length - 1];
  if (nt.length >= 2 && /^\d+$/.test(last) && +last >= 2 && tts.some((tt) => startsWith(tt, joined))) return 3;
  if (ts.some((t) => wants.includes(normSeq(head(t))))) return 2;
  if (nt.length >= 3 && tts.some((tt) => startsWith(tt, joined) || inOrder(nt, tt))) return 2;
  if (nt.length >= 2 && tts.some((tt) => endsWith(tt, joined))) return 2;
  const sorted = [...nt].sort().join("|");
  if (nt.length >= 2 && tts.some((tt) => tt.length === nt.length && [...tt].sort().join("|") === sorted)) return 1;
  // A typo only: the numbers must agree, so "Avatar 2" never settles for "Avatar".
  const nums = (x: string) => x.replace(/\D/g, "");
  const near = (a: string, b: string) => a.length >= 6 && b.length >= 6 && nums(a) === nums(b) && 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.85;
  return ts.some((t, i) => wants.some((w) => near(w, tts[i].join("")) || near(w, normSeq(head(t))))) ? 1 : 0;
}

/** The title with only case, accents, punctuation and a leading "the" removed ("&" stays "and"): small words in the middle still count. */
const literal = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/^the /, "").replace(/ /g, "");
/** Is the typed name spelled exactly like one of the titles, small words and all? ("Fast & furious" is "Fast & Furious", not "The Fast and the Furious".) */
export const isLiteral = (titles: (string | undefined)[], name: string): boolean => { const n = literal(name); return !!n && titles.some((t) => !!t && literal(t) === n); };

/** 0 to 1: plain edit-distance similarity of two names (words run together), with no credit for one containing the other. */
export function charSim(a: string, b: string): number {
  const x = normSeq(a), y = normSeq(b);
  return x && y ? 1 - lev(x, y) / Math.max(x.length, y.length) : 0;
}
/** Do two names carry the same numbers? "The kissing booth 2" and "The Kissing Booth" do not; "Part 1" and "Part 2" do not. */
export const sameNumbers = (a: string, b: string): boolean => normSeq(a).replace(/\D+/g, " ").trim() === normSeq(b).replace(/\D+/g, " ").trim();

/** 0 to 1: how alike the other counts as fairly close when they are of similar length. */
export function sim(a: string, b: string): number {
  const x = normSeq(a), y = normSeq(b);
  if (!x || !y) return 0;
  const base = 1 - lev(x, y) / Math.max(x.length, y.length);
  const ratio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
  if ((x.includes(y) || y.includes(x)) && ratio >= 0.6) return Math.max(base, 0.6 + 0.3 * ratio);
  return base;
}

/** "Dead pool 2" to its base "Dead pool" and number 2 ("III" is 3). `null` when the name does not end in a sequel number. */
export function trailingNumber(name: string): { base: string; n: number } | null {
  const m = name.trim().match(/^(.{2,}?)(?:\s+(?:pt|part|vol|volume|chapter)\.?)?\s+(\d{1,2}|[ivx]{1,4})$/i);
  if (!m) return null;
  const n = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : parseInt(ROMAN[m[2].toLowerCase()] ?? "", 10);
  const base = m[1].replace(/[\s:–—-]+$/, "");
  return Number.isFinite(n) && base.length >= 2 ? { base, n } : null;
}
/** The name without a trailing "1" or "2": a base to search when TMDB's own search does not find "Dead pool 2". */
export const baseOf = (name: string): string | null => trailingNumber(name)?.base ?? null;

/**
 * Other spellings of the typed name worth one more TMDB query when the plain search found nothing convincing:
 * words run together ("Dead pool" is "Deadpool", "Moon rise kingdom" is "Moonrise kingdom"), and a number as a word or digit ("5 feet apart", "Furious seven").
 */
export function variants(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const add = (v: string) => { if (v && v !== name.trim() && !out.includes(v)) out.push(v); };
  // "The kissing booth pt. 2" is "The Kissing Booth 2" on TMDB.
  const seq = name.trim().match(/^(.*\S)\s+(?:pt|part|vol|volume|chapter)\.?\s+(\d{1,2})$/i);
  if (seq) { add(`${seq[1]} ${seq[2]}`); add(`${seq[1]} Part ${seq[2]}`); }
  if (words.length >= 2 && words.length <= 3) add(words.join(""));
  if (words.length >= 3) for (let i = 0; i < words.length - 1 && out.length < 4; i++) add([...words.slice(0, i), words[i] + words[i + 1], ...words.slice(i + 2)].join(" "));
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[^a-z0-9]/g, "");
    const swap = NUM_WORDS[w] ?? DIGIT_WORDS[w];
    if (swap && !(i === words.length - 1 && /^\d+$/.test(w) && i > 0)) add([...words.slice(0, i), swap, ...words.slice(i + 1)].join(" "));
  }
  return out.slice(0, 5);
}

/** "How to train your dragon live action" asks for the newest film of that name; the qualifier is not part of the title. */
export function splitQualifier(name: string): { name: string; newest: boolean } {
  const m = name.match(/^(.*\S)[\s(\-–:,]+(?:the\s+)?(?:live[\s-]?action|remake|reboot)\)?\s*$/i);
  return m ? { name: m[1].trim(), newest: true } : { name, newest: false };
}
