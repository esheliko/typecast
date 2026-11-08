import type { CrewId } from "./details";

/**
 * Watching now, without AI: turn a typed (or spoken) question into one of a fixed set of answerable intents, and find the
 * people it is about among the cast, by actor name or character name ("Walter", "the Pinkman kid", "Hank's wife" all work).
 * Pure: unit tested in tests/unit/ask-intent.test.ts.
 */
export type Intent =
  | { kind: "who"; people: number[] }
  | { kind: "credits"; people: number[] }
  | { kind: "together"; people: number[] }
  | { kind: "castLinks" }
  | { kind: "castKnown" }
  | { kind: "common"; other: string }
  | { kind: "crew"; role: CrewId }
  | { kind: "age"; people: number[] }
  | { kind: "bio"; people: number[] }
  | { kind: "recap" } | { kind: "premise" } | { kind: "truth" } | { kind: "filmed" } | { kind: "stinger" } | { kind: "trivia" }
  | { kind: "length" } | { kind: "episode" } | { kind: "awards" } | { kind: "money" } | { kind: "rating" } | { kind: "stream" }
  | { kind: "song" } | { kind: "release" } | { kind: "language" }
  | { kind: "person"; q: string }
  | { kind: "search"; q: string };

export interface Who { id: number; name: string; role: string }

/** Lower case, no accents, no punctuation except spaces; possessive 's dropped. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’`]/g, "'").replace(/'s\b/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Words that never identify a person on their own, even when they are part of a name or a character. */
const NOT_A_NAME = new Set(("the a an and or of in on at to for with from by is are was were be been it its this that these those who whom whose what which where when why how " +
  "do does did have has had i me my you your he him his she her they them their we us our mr mrs ms dr miss sir lady lord young old little big man woman guy girl boy kid " +
  "voice uncredited self himself herself narrator another other one two three also just play plays played playing actor actress character cast know seen see watch film movie show series episode season " +
  "same before together worked work been where whats who's whos new more like real true story so far").split(" "));

function tokens(s: string): string[] { return norm(s).split(" ").filter(Boolean); }

/** Parts of a character credit: "Walter White / Heisenberg (voice)" -> ["walter white", "heisenberg"]. */
function roleParts(role: string): string[] {
  return role.replace(/\((?:voice|uncredited|archive[^)]*)\)/gi, "").split(/\s*(?:\/|;|,|\bas\b|\baka\b)\s*/i).map(norm).filter((p) => p.length >= 3);
}

/**
 * The cast members a question names, in the order it names them. Full names and full character names win; then single
 * words ("Walter", "Pinkman"), where a word shared by several people picks the top-billed one ("White" is Walter, not Skyler,
 * unless "Skyler" is also said). A word that is not part of any name is ignored.
 */
export function matchPeople(q: string, cast: Who[]): number[] {
  const words = tokens(q);
  const text = ` ${words.join(" ")} `;
  const used = new Array(words.length).fill(false);
  const hits: { id: number; at: number }[] = [];
  const mark = (phrase: string) => {
    const i = text.indexOf(` ${phrase} `);
    if (i < 0) return -1;
    const at = text.slice(0, i).split(" ").filter(Boolean).length;
    const n = phrase.split(" ").length;
    if (used.slice(at, at + n).some(Boolean)) return -1;
    for (let k = at; k < at + n; k++) used[k] = true;
    return at;
  };
  // 1. Whole names and whole character names, longest first so "Walter White Jr" beats "Walter White".
  const phrases = cast.flatMap((c) => [norm(c.name), ...roleParts(c.role)].filter((p) => p.includes(" ")).map((p) => ({ p, id: c.id })))
    .sort((a, b) => b.p.length - a.p.length);
  for (const { p, id } of phrases) { const at = mark(p); if (at >= 0 && !hits.some((h) => h.id === id)) hits.push({ id, at }); }
  // 2. Single words, top billing first.
  words.forEach((w, at) => {
    if (used[at] || w.length < 3 || NOT_A_NAME.has(w)) return;
    const who = cast.find((c) => tokens(c.name).includes(w) || roleParts(c.role).some((p) => p.split(" ").includes(w)));
    if (who && !hits.some((h) => h.id === who.id)) { hits.push({ id: who.id, at }); used[at] = true; }
  });
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}

const PRONOUN = /\b(him|her|he|she|they|them|his|hers|their|that (?:actor|actress|guy|woman|man)|this (?:actor|actress|guy|woman|man))\b/;

const has = (q: string, re: RegExp) => re.test(q);

/** Which crew job a question asks about, if any. */
function crewRole(q: string): CrewId | null {
  if (has(q, /\b(direct(ed|or|s)?|who made (it|this))\b/)) return "director";
  if (has(q, /\b(compos(er|ed)|score|music by|who did the music|scored)\b/)) return "composer";
  if (has(q, /\b(wr(ote|iter|itten)|screenplay|script)\b/)) return "writer";
  if (has(q, /\b(cinematograph\w*|dp|director of photography|shot it|camera)\b/)) return "cinematography";
  if (has(q, /\b(edit(ed|or)|editing)\b/)) return "editor";
  if (has(q, /\b(produc(ed|er|ers))\b/)) return "producer";
  return null;
}

/**
 * Classify a question. `cast` is everyone on screen (for name matching); `last` is who the previous answer was about,
 * so "and what else has he been in?" works.
 */
export function parseQuestion(raw: string, cast: Who[], last: number[] = []): Intent {
  const q = norm(raw);
  let people = matchPeople(raw, cast);
  if (!people.length && last.length && PRONOUN.test(q)) people = last.slice(0, 2);

  // Most specific first.
  if (has(q, /\b(post credits?|after (the )?credits|mid credits?|end credits?|credits scene|stinger|after the movie ends|anything after the credits)\b/)) return { kind: "stinger" };
  if (has(q, /\b(song|track|soundtrack|playing (right )?now|what music is|tune)\b/)) return { kind: "song" };
  if (has(q, /\b(in common with|same (cast|actors) as|shares? (cast|actors) with|anyone (from|in) (this|it) (in|from))\b/)) {
    const m = /(?:in common with|same (?:cast|actors) as|shares? (?:cast|actors) with|anyone (?:from|in) (?:this|it) (?:in|from))\s+(.+)$/.exec(q);
    if (m?.[1]) return { kind: "common", other: m[1].replace(/^(the (movie|film|show|series) )/, "").trim() };
  }
  if (has(q, /\b(worked|work|been|appeared|acted|starred|co ?starred|together|connected|connections?|link(ed)?|co ?stars?|in common)\b/) &&
      has(q, /\b(together|with each other|with|before|connections?|connected|link(ed)?|co ?stars?|in common|both)\b/) && !has(q, /\bwhere (do|have|did) i\b/)) {
    if (people.length >= 2) return { kind: "together", people: people.slice(0, 2) };
    if (people.length === 1) return { kind: "together", people };
    if (has(q, /\b(cast|actors|anyone|who|any of them|they)\b/)) return { kind: "castLinks" };
  }
  if (has(q, /\b(how old|age|born|birthday|alive|died|dead)\b/) && people.length) return { kind: "age", people };
  if (has(q, /\b(what else|other (films?|movies?|shows?|roles?|work)|filmography|known for|best known|famous for|been in|starred in|appeared in)\b/) && people.length) return { kind: "credits", people };
  if (has(q, /\b(tell me about|bio|biography|background|who is s?he really|life)\b/) && people.length) return { kind: "bio", people };
  if (has(q, /\b(where (do|have|did) i (know|seen|see|recogni[sz]e)|who (is|s|was|plays|played|playing)|who that|recogni[sz]e|familiar|which actor|what actor|who s that|whos that|that actor|seen (him|her|them) before)\b/)) {
    if (people.length) return { kind: "who", people };
    if (has(q, /\b(the cast|everyone|everybody|anyone|any of them|them all|these (people|actors)|the actors)\b/)) return { kind: "castKnown" };
    const role = crewRole(q); if (role) return { kind: "crew", role };
    const name = /\bwho (?:is|s|was) ([a-z][a-z .'-]{2,40})$/.exec(q)?.[1];
    if (name && !has(name, /\b(that|this|the|he|she|playing|in)\b/)) return { kind: "person", q: name };
    return { kind: "who", people: [] };
  }
  const role = crewRole(q);
  if (role) return { kind: "crew", role };
  if (has(q, /\b(recap|so far|catch me up|what (just )?happened|what did i miss|previously|last episode|story until now|up to (now|here))\b/)) return { kind: "recap" };
  if (has(q, /\b(true story|real (events?|story|life|person|people)|based on|inspired by|actually happen\w*|really happen\w*|book|novel|comic|adaptation|adapted|remake|historical(ly)?)\b/)) return { kind: "truth" };
  if (has(q, /\b(filmed|filming|shot (in|at|on)|locations?|where (was|is) (it|this) (made|shot|set)|set in|takes place|where does (it|this) take place)\b/)) return { kind: "filmed" };
  if (has(q, /\b(trivia|fun facts?|behind the scenes|did you know|interesting|easter eggs?|facts?)\b/)) return { kind: "trivia" };
  if (has(q, /\b(how many episodes|episodes (are )?left|how many seasons|how long|runtime|minutes left|how much longer|when does (it|this) end|time left|is it almost over)\b/)) return { kind: "length" };
  if (has(q, /\b(which episode|what episode|episode (name|title|called)|this episode|who directed this episode)\b/)) return { kind: "episode" };
  if (has(q, /\b(awards?|oscars?|emmys?|golden globes?|bafta|nominat\w*|won any)\b/)) return { kind: "awards" };
  if (has(q, /\b(budget|box office|gross(ed)?|cost|revenue|make money|made money|how much (did|money))\b/)) return { kind: "money" };
  if (has(q, /\b(rating|rated|reviews?|imdb|tmdb score|critics?|is (it|this) good|worth)\b/)) return { kind: "rating" };
  if (has(q, /\b(stream\w*|where (can|to) (i )?watch|available on|netflix|prime|hulu|disney|hbo|max|rent|buy)\b/)) return { kind: "stream" };
  if (has(q, /\b(when (did|was) (it|this) (come out|released|made|air(ed)?)|release date|what year|how old is (this|it))\b/)) return { kind: "release" };
  if (has(q, /\b(language|subtitles?|dubbed|original title)\b/)) return { kind: "language" };
  if (has(q, /\b(what (s |is )?(it|this) about|whats (it|this) about|plot|premise|synopsis|story|summary)\b/)) return { kind: "premise" };
  if (people.length) return { kind: "who", people };
  // A bare name ("Giancarlo Esposito") that is not in this cast.
  if (/^[a-z][a-z'-]+( [a-z][a-z'-]+){1,2}$/.test(q) && !q.split(" ").some((w) => NOT_A_NAME.has(w))) return { kind: "person", q };
  return { kind: "search", q: raw.trim().slice(0, 200) };
}

/** Follow-up questions offered under an answer, so the next tap is one tap. */
export function followUps(i: Intent, names: string[], type: "movie" | "tv"): string[] {
  const n = names[0];
  switch (i.kind) {
    case "who": case "person": return n ? [`What else has ${n} been in?`, `How old is ${n}?`, `Who has ${n} worked with in this cast?`] : [];
    case "credits": return n ? [`Who has ${n} worked with in this cast?`, `How old is ${n}?`] : [];
    case "castKnown": return ["Which of the cast have worked together before?", "Tell me some trivia"];
    case "together": case "castLinks": return ["Where do I know the cast from?", "Tell me some trivia"];
    case "truth": return ["Where was this filmed?", "Tell me some trivia"];
    case "filmed": return ["Is this based on a true story?", "Tell me some trivia"];
    case "recap": return type === "tv" ? ["What's this episode called?", "How many episodes are left?"] : ["How much longer is it?", "Is there a post-credits scene?"];
    default: return [];
  }
}
