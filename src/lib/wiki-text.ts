/**
 * Pure helpers for answering from a Wikipedia article without AI: split it into sections and sentences, then pick the
 * sentences that best match a question. Plot-like sections can be left out so answers stay spoiler-free. Unit tested.
 */
export interface Section { name: string; text: string }
export interface Found { section: string; text: string; score: number }

/** "plain text with == Heading == lines" (Wikipedia's explaintext + wiki section format) -> sections; the lead is "Summary". */
export function parseSections(extract: string): Section[] {
  const out: Section[] = [];
  let cur: Section = { name: "Summary", text: "" };
  let parent = "";
  for (const line of extract.split("\n")) {
    const h = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line);
    if (h) {
      if (cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
      // Sub-sections keep their parent's name for context: "Production / Filming".
      if (h[1].length === 2) parent = h[2];
      cur = { name: h[1].length === 2 || !parent ? h[2] : `${parent} / ${h[2]}`, text: "" };
    } else cur.text += line + "\n";
  }
  if (cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
  return out;
}

/** Sections that give the story away. */
export const SPOILER_SECTIONS = /\b(plot|synopsis|story|summary of|episodes?|ending|season \d|series overview|characters)\b/i;
/** Sections that are never an answer (lists of references and the like). */
const JUNK_SECTIONS = /\b(references|notes|external links|see also|further reading|bibliography|sources|citations)\b/i;

/** Sentences, without splitting at "Dr.", "St.", "U.S.", initials or decimals. */
export function sentences(text: string): string[] {
  const safe = text.replace(/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|No|Vol|Inc|Ltd|Co|Mt|ca|approx)\./g, "$1\u0001").replace(/\b([A-Z])\./g, "$1\u0001").replace(/(\d)\.(\d)/g, "$1\u0001$2");
  return safe.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((s) => s.replace(/\u0001/g, ".").trim()).filter((s) => s.length > 25 && s.length < 600);
}

const STOP = new Set(("a an the and or but of in on at to for with from by is are was were be been being it its this that these those there here who whom whose what which where when why how do does did " +
  "have has had i me my you your he him his she her they them their we us our can could would should will shall may might must about into over under than then so such very just also any some " +
  "tell know film movie show series episode season watch watching anything something really actually").split(" "));

/** Rough stem: "filmed", "filming", "films" -> "film". Good enough for matching questions to sentences. */
export function stem(w: string): string {
  return w.length > 4 ? w.replace(/(ings?|edly|ed|es|s|ly)$/, "").replace(/(.)\1$/, "$1") : w;
}
export function keywords(q: string): string[] {
  const words = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/);
  return [...new Set(words.filter((w) => w.length > 2 && !STOP.has(w)).map(stem))];
}

/**
 * The best-matching sentences for a question. A sentence scores for every distinct question word it contains (rarer, longer
 * words count more); `boost` lifts sections by name (e.g. /production|filming/ for "where was it filmed"); `spoilers: false`
 * leaves out plot sections. Returns at most `max`, in article order, only those scoring at least `min`.
 */
export function bestSentences(secs: Section[], q: string | string[], opts: { spoilers?: boolean; boost?: RegExp; only?: RegExp; max?: number; min?: number; extra?: RegExp } = {}): Found[] {
  const keys = Array.isArray(q) ? q : keywords(q);
  const { spoilers = false, boost, only, max = 3, min = 1, extra } = opts;
  const found: (Found & { i: number })[] = [];
  let i = 0;
  for (const s of secs) {
    if (JUNK_SECTIONS.test(s.name) || (!spoilers && SPOILER_SECTIONS.test(s.name)) || (only && !only.test(s.name))) { i += 1000; continue; }
    // A sentence under "Filming" is about filming even when it never says so.
    const head = new Set(keywords(s.name));
    const fromHead = keys.reduce((n, k) => n + (head.has(k) ? 0.75 * (1 + Math.min(k.length, 10) / 10) : 0), 0);
    for (const sen of sentences(s.text)) {
      i++;
      const words = new Set(keywords(sen));
      let score = fromHead;
      for (const k of keys) if (words.has(k) || (k.length > 5 && [...words].some((w) => w.startsWith(k)))) score += 1 + Math.min(k.length, 10) / 10;
      if (extra?.test(sen)) score += 1;
      if (score && boost?.test(s.name)) score *= 1.5;
      if (score >= min) found.push({ section: s.name, text: sen, score, i });
    }
  }
  return found.sort((a, b) => b.score - a.score).slice(0, max).sort((a, b) => a.i - b.i).map(({ i: _i, ...f }) => { void _i; return f; });
}

/** A short "is based on …" phrase from the article's opening, if it says so. */
export function basedOnPhrase(secs: Section[]): string | null {
  for (const sen of sentences(secs.find((s) => s.name === "Summary")?.text ?? "")) {
    const m = /\b((?:loosely |partly |partially )?(?:based on|inspired by|adapted from)\b[^;]{3,200})/i.exec(sen);
    if (m) return m[1].replace(/[.,\s]+$/, "").trim();
  }
  return null;
}
