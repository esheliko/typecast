import { getAwards } from "./awards";
import { linkPeople, linkTitles } from "./connect";
import { fillCrew } from "./crew-fill";
import { enrich } from "./enrich";
import { detailLabel, type CrewId } from "./details";
import { fmtDate, plural } from "./episodes";
import { followUps, parseQuestion, type Intent, type Who } from "./ask-intent";
import { getAllCredits, getEpisode, getPersonBasics, getSeason, getTitle, getTitleFacts, search, type TitleFacts } from "./tmdb";
import { getArticle, getWikiFacts, type Article } from "./wiki";
import { basedOnPhrase, bestSentences, sentences, SPOILER_SECTIONS } from "./wiki-text";
import { elapsedMin, type Watch } from "./watching";
import type { CastMember, Credit, Item, LibItem, Profile, Status, Title } from "./types";

/**
 * Watching now, without AI: answers built from TMDB, Wikidata and Wikipedia plus the user's own library.
 * Each answer is a few lines of light markdown, optional tappable cards (titles, people) and links for going further.
 */
export type AnswerCard =
  | ({ kind: "title"; sub?: string; status?: Status | null } & Item)
  | { kind: "person"; id: number; name: string; photo: string | null; sub?: string };
export interface Answer { text: string; cards?: AnswerCard[]; links?: { label: string; url: string }[]; about?: number[]; next?: string[] }

/** Everyone on screen: for a series, this episode's cast and guest stars first, then the regulars. */
async function onScreen(w: Watch, t: Title): Promise<(CastMember & { guest?: boolean })[]> {
  if (w.type !== "tv" || !w.s || !w.e) return t.people;
  const ep = await getEpisode(w.id, w.s, w.e).catch(() => null);
  if (!ep) return t.people;
  const seen = new Set<number>();
  return [...ep.cast, ...ep.guests.map((g) => ({ ...g, guest: true })), ...t.people].filter((p) => !seen.has(p.id) && seen.add(p.id));
}

const SEEN: Status[] = ["watched", "watching", "partial"];
const yr = (x: { year?: string }) => (x.year ? ` (${x.year})` : "");
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} billion` : n >= 1e6 ? `$${Math.round(n / 1e6)} million` : `$${n.toLocaleString("en-US")}`);
const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const ageAt = (birth: string, at: Date) => { const b = new Date(birth); let a = at.getUTCFullYear() - b.getUTCFullYear(); if (at.getUTCMonth() < b.getUTCMonth() || (at.getUTCMonth() === b.getUTCMonth() && at.getUTCDate() < b.getUTCDate())) a--; return a; };

interface Ctx {
  w: Watch; t: Title; lib: LibItem[]; status: Map<string, Status>; cast: (CastMember & { guest?: boolean })[];
  spoilers: boolean; profile: Profile | null; q: string;
  facts: () => Promise<TitleFacts | null>; article: () => Promise<Article | null>;
}

function titleCard(c: Credit | Item, ctx: Ctx, sub?: string): AnswerCard {
  return { kind: "title", key: c.key, type: c.type, id: c.id, title: c.title, year: c.year, poster: c.poster, sub, status: ctx.status.get(c.key) ?? null };
}
const roleIn = (ctx: Ctx, id: number) => ctx.cast.find((c) => c.id === id)?.role ?? "";
async function nameOf(ctx: Ctx, id: number) { return ctx.cast.find((c) => c.id === id)?.name ?? (await getAllCredits(id)).name; }
const linksFor = (ctx: Ctx, a: Article | null, q?: string) => [
  ...(a ? [{ label: "Wikipedia", url: a.url }] : []),
  ...(ctx.t.imdbId ? [{ label: "IMDb trivia", url: `https://www.imdb.com/title/${ctx.t.imdbId}/trivia/` }] : []),
  { label: "Search Google", url: google(`${ctx.t.title}${yr(ctx.t)} ${q ?? ctx.q}`) },
];

/** "Where do I know them from": the part here, what the user has seen them in, and what they are best known for. */
async function who(ctx: Ctx, ids: number[], notHere = false): Promise<Answer> {
  if (!ids.length) {
    return { text: "Who do you mean? Tap a face above, or type a name or a character (\"Jesse\", \"the detective's partner\").", next: ["Where do I know the cast from?"] };
  }
  const parts: string[] = []; const cards: AnswerCard[] = [];
  for (const id of ids.slice(0, 3)) {
    const p = await getAllCredits(id);
    const role = roleIn(ctx, id);
    const others = p.known.filter((k) => k.key !== ctx.t.key);
    const seen = others.filter((k) => SEEN.includes(ctx.status.get(k.key)!));
    const listed = others.filter((k) => ctx.status.get(k.key) === "watchlist");
    const famous = others.filter((k) => !ctx.status.has(k.key)).slice(0, 4);
    const here = ctx.cast.some((c) => c.id === id);
    let s = here ? `**${p.name}**${role ? ` plays **${role}**` : " is in this"}.` : `**${p.name}** ${notHere ? "isn't in this cast." : ""}`.trim();
    s += seen.length ? ` You've seen them in ${and(seen.slice(0, 4).map((k) => `**${k.title}**${yr(k)}${k.role ? ` as ${k.role}` : ""}`))}${seen.length > 4 ? ` and ${seen.length - 4} more` : ""}.`
      : " Nothing you've watched yet.";
    if (listed.length) s += ` On your watchlist: ${and(listed.slice(0, 3).map((k) => k.title))}.`;
    if (famous.length) s += ` Best known for ${and(famous.map((k) => `${k.title}${yr(k)}`))}.`;
    parts.push(s);
    cards.push({ kind: "person", id: p.id, name: p.name, photo: p.photo, sub: role || undefined });
    cards.push(...seen.slice(0, 4).map((k) => titleCard(k, ctx, k.role ? `as ${k.role}` : undefined)), ...famous.slice(0, ids.length > 1 ? 2 : 4).map((k) => titleCard(k, ctx, k.role ? `as ${k.role}` : undefined)));
  }
  return { text: parts.join("\n\n"), cards, about: ids.slice(0, 3) };
}

async function credits(ctx: Ctx, id: number): Promise<Answer> {
  const p = await getAllCredits(id);
  const list = p.known.filter((k) => k.key !== ctx.t.key);
  const seen = list.filter((k) => SEEN.includes(ctx.status.get(k.key)!)).length;
  return {
    text: `**${p.name}** has ${plural(list.length, "other credit")} on TMDB${seen ? `; you've seen ${seen} of them` : ""}. The best known:`,
    cards: list.slice(0, 12).map((k) => titleCard(k, ctx, [k.role && `as ${k.role}`, k.eps ? plural(k.eps, "ep") : ""].filter(Boolean).join(" · ") || undefined)),
    about: [id], links: [{ label: `${p.name} on TMDB`, url: `https://www.themoviedb.org/person/${id}` }],
  };
}

/** Who else in this cast someone has worked with before, and where. */
async function withCast(ctx: Ctx, id: number): Promise<Answer> {
  const a = await getAllCredits(id);
  const mine = new Map(a.known.filter((k) => k.key !== ctx.t.key).map((k) => [k.key, k]));
  const others = ctx.cast.filter((c) => c.id !== id).slice(0, 18);
  const rows = (await Promise.all(others.map(async (c) => {
    const b = await getAllCredits(c.id).catch(() => null);
    const both = (b?.known ?? []).filter((k) => mine.has(k.key));
    return { c, both };
  }))).filter((r) => r.both.length).sort((x, y) => y.both.length - x.both.length);
  if (!rows.length) return { text: `As far as TMDB knows, **${a.name}** hasn't worked with anyone else in this cast before.`, about: [id] };
  const titles = new Map<string, { k: Credit; with: string[] }>();
  for (const r of rows) for (const k of r.both) titles.set(k.key, { k, with: [...(titles.get(k.key)?.with ?? []), r.c.name] });
  return {
    text: `**${a.name}** has worked with ${plural(rows.length, "of this cast", "of this cast")} before:\n` +
      rows.slice(0, 8).map((r) => `- **${r.c.name}**${r.c.role ? ` (${r.c.role})` : ""}: ${and(r.both.slice(0, 3).map((k) => `${k.title}${yr(k)}`))}${r.both.length > 3 ? ` +${r.both.length - 3}` : ""}`).join("\n"),
    cards: [...titles.values()].sort((x, y) => y.with.length - x.with.length || y.k.votes - x.k.votes).slice(0, 6).map(({ k, with: w }) => titleCard(k, ctx, `with ${and(w.slice(0, 3))}`)),
    about: [id],
  };
}

async function together(ctx: Ctx, [a, b]: number[]): Promise<Answer> {
  const l = await linkPeople(a, b);
  const shared = l.shared.filter((s) => s.key !== ctx.t.key);
  if (shared.length) {
    return {
      text: `Yes: **${l.a.name}** and **${l.b.name}** have ${plural(shared.length, "other title")} together.`,
      cards: shared.slice(0, 10).map((s) => titleCard(s, ctx, `${s.roles[0] || "?"} · ${s.roles[1] || "?"}`)), about: [a, b],
    };
  }
  if (l.bridges.length) {
    return {
      text: `Not together before this, but they're linked through:\n` + l.bridges.slice(0, 5).map((br) => `- **${br.person.name}**: ${br.viaA.title} with ${l.a.name}, ${br.viaB.title} with ${l.b.name}`).join("\n"),
      cards: l.bridges.slice(0, 4).map((br) => ({ kind: "person" as const, id: br.person.id, name: br.person.name, photo: br.person.photo })), about: [a, b],
    };
  }
  return { text: `As far as TMDB knows, this is the first time **${l.a.name}** and **${l.b.name}** have worked together.`, about: [a, b] };
}

/** Where the user knows the cast from, everyone at once. */
async function castKnown(ctx: Ctx): Promise<Answer> {
  const rich = await enrich(ctx.cast.slice(0, 20), ctx.lib, ctx.t.key);
  const known = rich.filter((p) => p.hits.length);
  if (!known.length) return { text: "You haven't watched anything else with this cast yet (from your library). Tap a face to see what each of them is best known for." };
  return {
    text: `You know ${plural(known.length, "of the cast", "of the cast")} from your library:\n` + known.slice(0, 10).map((p) => `- **${p.name}**${p.role ? ` (${p.role})` : ""}: ${and(p.hits.slice(0, 3).map((h) => `${h.title}${h.ep ? ` (${h.ep})` : yr(h)}`))}${p.hits.length > 3 ? ` +${p.hits.length - 3}` : ""}`).join("\n"),
    cards: known.slice(0, 8).map((p) => ({ kind: "person" as const, id: p.id, name: p.name, photo: p.photo, sub: p.hits[0] ? `seen in ${p.hits[0].title}${p.hits[0].ep ? ` (${p.hits[0].ep})` : ""}` : p.role })),
  };
}

/** Which of the cast have been in something else together. Titles the user has seen come first. */
async function castLinks(ctx: Ctx): Promise<Answer> {
  const top = ctx.cast.slice(0, 14);
  const all = await Promise.all(top.map((c) => getAllCredits(c.id).catch(() => null)));
  const by = new Map<string, { k: Credit; people: string[] }>();
  all.forEach((p, i) => p?.known.forEach((k) => { if (k.key === ctx.t.key) return; const e = by.get(k.key) ?? { k, people: [] }; e.people.push(top[i].name); by.set(k.key, e); }));
  const links = [...by.values()].filter((e) => e.people.length >= 2)
    .sort((x, y) => Number(SEEN.includes(ctx.status.get(y.k.key)!)) - Number(SEEN.includes(ctx.status.get(x.k.key)!)) || y.people.length - x.people.length || y.k.votes - x.k.votes);
  if (!links.length) return { text: "None of the main cast have been in anything else together, as far as TMDB knows." };
  return {
    text: `${plural(links.length, "other title")} share cast with this. The biggest overlaps:\n` + links.slice(0, 6).map((e) => `- **${e.k.title}**${yr(e.k)}: ${and(e.people.slice(0, 4))}${SEEN.includes(ctx.status.get(e.k.key)!) ? " (you've seen it)" : ""}`).join("\n"),
    cards: links.slice(0, 8).map((e) => titleCard(e.k, ctx, and(e.people.slice(0, 3)))),
  };
}

async function common(ctx: Ctx, other: string): Promise<Answer> {
  const hit = (await search(other, "title")).find((h) => h.kind === "title");
  if (!hit || hit.kind !== "title") return { text: `I couldn't find "${other}" on TMDB.` };
  const l = await linkTitles({ type: ctx.t.type, id: ctx.t.id }, { type: hit.type, id: hit.id });
  if (!l.shared.length) return { text: `No one is in both this and **${l.b.title}**${yr(l.b)}.`, cards: [titleCard(l.b, ctx)] };
  return {
    text: `${plural(l.shared.length, "actor")} in both this and **${l.b.title}**${yr(l.b)}:\n` + l.shared.slice(0, 10).map((s) => `- **${s.name}**: ${s.roles[0] || "?"} here, ${s.roles[1] || "?"} there`).join("\n"),
    cards: [titleCard(l.b, ctx), ...l.shared.slice(0, 6).map((s) => ({ kind: "person" as const, id: s.id, name: s.name, photo: s.photo, sub: s.roles[0] }))],
    about: l.shared.slice(0, 2).map((s) => s.id),
  };
}

async function crew(ctx: Ctx, role: CrewId): Promise<Answer> {
  const by = await fillCrew(ctx.t.type, ctx.t.imdbId, ctx.t.crewBy).catch(() => ctx.t.crewBy);
  const ppl = by[role] ?? [];
  const label = detailLabel(role, ctx.t.type);
  if (!ppl.length) return { text: `TMDB doesn't list the ${label.toLowerCase()} for this.`, links: linksFor(ctx, null, label) };
  let extra = "";
  if (ctx.t.type === "tv" && role === "director" && ctx.w.s && ctx.w.e) {
    const ep = (await getSeason(ctx.w.id, ctx.w.s).catch(() => null))?.episodes.find((e) => e.e === ctx.w.e);
    if (ep?.directors.length) extra = ` This episode was directed by ${and(ep.directors)}${ep.writers.length ? ` and written by ${and(ep.writers)}` : ""}.`;
  }
  const famous = await getAllCredits(ppl[0].id).then((p) => p.known.filter((k) => k.key !== ctx.t.key).slice(0, 4)).catch(() => []);
  return {
    text: `**${label}:** ${and(ppl.slice(0, 5).map((p) => p.name))}.${extra}${famous.length ? ` ${ppl[0].name} also made ${and(famous.map((k) => `${k.title}${yr(k)}`))}.` : ""}`,
    cards: [...ppl.slice(0, 4).map((p) => ({ kind: "person" as const, id: p.id, name: p.name, photo: p.photo, sub: p.role || label })), ...famous.map((k) => titleCard(k, ctx))],
    about: ppl.slice(0, 1).map((p) => p.id),
  };
}

async function age(ctx: Ctx, ids: number[]): Promise<Answer> {
  const out: string[] = []; const cards: AnswerCard[] = [];
  for (const id of ids.slice(0, 3)) {
    const p = await getPersonBasics(id);
    cards.push({ kind: "person", id, name: p.name, photo: p.photo, sub: roleIn(ctx, id) || undefined });
    if (!p.birthday) { out.push(`TMDB doesn't have a birthday for **${p.name}**.`); continue; }
    const end = p.deathday ? new Date(p.deathday) : new Date();
    const out_ = ctx.t.year ? new Date(`${ctx.t.year}-07-01`) : null;
    const after = !!(out_ && p.deathday && new Date(p.deathday) < out_);
    const made = out_ && !after ? ageAt(p.birthday, out_) : null;
    out.push(`**${p.name}** ${p.deathday ? `died on ${fmtDate(p.deathday)}, aged ${ageAt(p.birthday, end)}` : `is ${ageAt(p.birthday, end)}`} (born ${fmtDate(p.birthday)}${p.place ? ` in ${p.place}` : ""}).` +
      (after ? ` This came out after their death, in ${ctx.t.year}.` : made !== null && made > 0 ? ` About ${made} when this came out in ${ctx.t.year}.` : ""));
  }
  return { text: out.join("\n\n"), cards, about: ids.slice(0, 3) };
}

async function bio(ctx: Ctx, id: number): Promise<Answer> {
  const p = await getPersonBasics(id);
  const s = sentences(p.bio).slice(0, 4).join(" ");
  return {
    text: s ? `**${p.name}**: ${s}` : `TMDB has no biography for **${p.name}**.`,
    cards: [{ kind: "person", id, name: p.name, photo: p.photo, sub: roleIn(ctx, id) || undefined }], about: [id],
    links: [{ label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.name.replace(/ /g, "_"))}` }, ...(p.imdbId ? [{ label: "IMDb", url: `https://www.imdb.com/name/${p.imdbId}/` }] : [])],
  };
}

/** The story so far. Series: the episodes before this one (TMDB's synopses). Films: Wikipedia's plot, cut to how far in you are. */
async function recap(ctx: Ctx): Promise<Answer> {
  const { w, t } = ctx;
  if (w.type === "tv" && w.s && w.e) {
    const season = await getSeason(w.id, w.s).catch(() => null);
    let before = (season?.episodes ?? []).filter((e) => e.e < w.e! && e.overview);
    let label = `Season ${w.s}`;
    if (!before.length && w.s > 1) { const prev = await getSeason(w.id, w.s - 1).catch(() => null); before = (prev?.episodes ?? []).filter((e) => e.overview).slice(-3); label = `End of season ${w.s - 1}`; }
    const cur = season?.episodes.find((e) => e.e === w.e);
    if (!before.length) return { text: `You're at the very start${cur ? ` (**${cur.name}**)` : ""}, so there's nothing to recap yet. ${t.overview ? `The premise: ${t.overview}` : ""}`.trim() };
    return {
      text: `**${label} so far:**\n` + before.slice(-5).map((e) => `- **E${e.e} · ${e.name}**: ${e.overview}`).join("\n") +
        (before.length > 5 ? `\n\n(${before.length - 5} earlier episodes not shown.)` : "") +
        (ctx.spoilers && cur?.overview ? `\n\n**This episode (${cur.name}):** ${cur.overview}` : ""),
    };
  }
  const a = await ctx.article();
  const plot = a?.sections.find((s) => /^(plot|synopsis|story)/i.test(s.name));
  const lines = plot ? sentences(plot.text) : [];
  const runtime = w.runtime || t.runtime || 0;
  const frac = runtime ? Math.min(1, elapsedMin(w) / runtime) : 0;
  // Stay well behind where you are: Wikipedia's plot does not move at the film's pace.
  const n = ctx.spoilers ? Math.round(lines.length * frac) : Math.floor(lines.length * Math.max(0, frac - 0.15));
  if (!lines.length || n < 1) {
    return { text: `${frac < 0.15 ? "You're near the start, so here's just the premise: " : ""}${t.overview || "TMDB has no synopsis for this."}`, links: a ? [{ label: "Full plot on Wikipedia (spoilers)", url: `${a.url}#Plot` }] : undefined };
  }
  return {
    text: `**Roughly the story up to ${Math.round(frac * 100)}% of the way in** (from Wikipedia's plot${ctx.spoilers ? "" : ", kept a little behind you to be safe"}):\n\n${lines.slice(0, n).join(" ")}`,
    links: a ? [{ label: "Wikipedia plot (spoilers)", url: `${a.url}#Plot` }] : undefined,
  };
}

const KW = {
  truth: ["based on true story", "based on a true story", "true story", "based on real events", "based on real person", "biography", "biographical", "historical event", "historical figure"],
  book: ["based on novel or book", "based on novel", "based on book", "based on young adult novel", "based on short story", "based on memoir or autobiography"],
  comic: ["based on comic", "based on graphic novel", "based on manga", "superhero"],
  other: ["based on play or musical", "based on video game", "based on tv series", "remake", "based on movie", "based on cartoon", "based on song, poem or rhyme"],
};
async function truth(ctx: Ctx): Promise<Answer> {
  const [f, wf, a] = await Promise.all([ctx.facts(), getWikiFacts(ctx.t.imdbId), ctx.article()]);
  const kw = new Set(f?.keywords ?? []);
  const hit = (l: string[]) => l.filter((k) => kw.has(k));
  const phrase = a ? basedOnPhrase(a.sections) : null;
  const real = hit(KW.truth), src = [...hit(KW.book), ...hit(KW.comic), ...hit(KW.other)];
  const lines: string[] = [];
  const source = phrase ? phrase : wf?.basedOn.length ? `based on ${and(wf.basedOn)}`
    : src.some((k) => k.startsWith("based on")) ? `based on a ${and(src.filter((k) => k.startsWith("based on")).map((k) => k.slice(9)))}` : src.includes("remake") ? "a remake" : "";
  if (real.length) lines.push(`**Yes, it's drawn from real events or people** (TMDB tags it ${and(real.map((k) => `"${k}"`))}).${source ? ` It's ${source}.` : ""}`);
  else if (source) lines.push(`**Not a true story**: it's ${source}${phrase ? " (Wikipedia)" : wf?.basedOn.length ? " (Wikidata)" : " (TMDB)"}.`);
  if (!lines.length) lines.push("**Not as far as TMDB, Wikidata or Wikipedia say**: it looks like an original story.");
  const acc = a ? bestSentences(a.sections, ["real", "true", "histor", "accura", "based", "inspir", "actual", "event"], { spoilers: ctx.spoilers, boost: /histor|accura|development|background|inspiration/i, max: 2, min: 2.5 }) : [];
  if (acc.length) lines.push(...acc.map((s) => `> ${s.text}`));
  return { text: lines.join("\n\n"), links: linksFor(ctx, a, "based on true story") };
}

async function filmed(ctx: Ctx): Promise<Answer> {
  const [f, wf, a] = await Promise.all([ctx.facts(), getWikiFacts(ctx.t.imdbId), ctx.article()]);
  const lines: string[] = [];
  if (wf?.filmedIn.length) lines.push(`**Filmed in** ${and(wf.filmedIn)}.`);
  if (wf?.setIn.length) lines.push(`**Set in** ${and(wf.setIn)}.`);
  if (!lines.length && f?.countries.length) lines.push(`Produced in ${and(f.countries)}.`);
  const s = a ? bestSentences(a.sections, ["film", "shot", "location", "studio", "principal", "photography", "set", "scene"], { spoilers: ctx.spoilers, boost: /production|filming|location|photography/i, max: 3, min: 2 }) : [];
  lines.push(...s.map((x) => `> ${x.text}`));
  if (!lines.length) lines.push("Neither Wikidata nor Wikipedia says where this was filmed.");
  return { text: lines.join("\n\n"), links: linksFor(ctx, a, "filming locations") };
}

async function stinger(ctx: Ctx): Promise<Answer> {
  const [f, a] = await Promise.all([ctx.facts(), ctx.article()]);
  const kw = new Set(f?.keywords ?? []);
  const during = kw.has("duringcreditsstinger") || kw.has("mid-credits scene"), after = kw.has("aftercreditsstinger") || kw.has("post-credits scene");
  const wiki = a?.sections.some((s) => /\b(mid|post|after)[- ]credits?\b/i.test(s.text));
  let text: string;
  if (during || after) text = `**Yes**: ${and([during && "a mid-credits scene", after && "a scene after the credits"].filter(Boolean) as string[])} (TMDB). Stay for the credits.`;
  else if (wiki) text = "**Probably yes**: Wikipedia mentions a credits scene, though TMDB doesn't tag one. Worth staying a minute.";
  else text = ctx.t.type === "tv" ? "Series rarely have them, and TMDB doesn't tag one for this show." : "**Probably not.** TMDB tags films with mid- and post-credits scenes, and this one has neither tag.";
  return { text, links: [{ label: "Check on Google", url: google(`${ctx.t.title}${yr(ctx.t)} post credits scene`) }] };
}

const JUICY = /\b(originally|initially|first|only|record|improvi[sz]\w*|turned down|declined|was cast|cast as|auditioned|real|actual(ly)?|inspired|nickname|cameo|rewr\w+|insisted|refused|accident\w*|injur\w*|secret\w*|reportedly|according to|surpris\w*|unusual|tribute|homage|easter egg|reference|died|lost|weeks|days|months)\b/i;
async function trivia(ctx: Ctx): Promise<Answer> {
  const a = await ctx.article();
  if (!a) return { text: "There's no Wikipedia article to pull trivia from.", links: linksFor(ctx, null, "trivia") };
  const picks: string[] = []; const used = new Set<string>();
  const secs = a.sections.filter((s) => /production|development|casting|filming|writing|pre-production|design|effects|music|soundtrack|release|legacy|reception|inspiration|background|accolades/i.test(s.name) && (ctx.spoilers || !SPOILER_SECTIONS.test(s.name)));
  const ranked = secs.flatMap((s) => sentences(s.text).map((t) => ({ s: s.name.split(" / ")[0], t, score: (t.match(new RegExp(JUICY.source, "gi"))?.length ?? 0) + (/\d/.test(t) ? 0.5 : 0) })))
    .filter((x) => x.score >= 1).sort((x, y) => y.score - x.score);
  for (const r of ranked) { if (picks.length >= 4) break; if (used.has(r.s) && ranked.length > 6) continue; used.add(r.s); picks.push(`- ${r.t}`); }
  if (!picks.length) picks.push(...(a.sections[0] ? sentences(a.sections[0].text).slice(1, 4).map((t) => `- ${t}`) : []));
  return { text: `**Behind the scenes** (Wikipedia${ctx.spoilers ? "" : ", plot sections left out"}):\n${picks.join("\n")}`, links: linksFor(ctx, a, "trivia") };
}

async function length(ctx: Ctx): Promise<Answer> {
  const { w, t } = ctx;
  const runtime = w.runtime || t.runtime;
  const m = elapsedMin(w);
  if (w.type === "movie") {
    if (!runtime) return { text: `TMDB doesn't list a runtime. You're about ${m} min in.` };
    const left = runtime - m;
    return { text: left > 0 ? `**About ${left} min left** (${m} of ${runtime} min). Off by a bit? Fix it with −5 / +5 above.` : `It's ${runtime} min long and you're ${m} min in, so you're in the credits by now (or tap −5 if you paused).` };
  }
  const season = t.seasons.find((s) => s.n === w.s);
  const lines = [`**Season ${w.s}, episode ${w.e}** of ${season ? season.eps : "?"}: ${season ? plural(Math.max(0, season.eps - (w.e ?? 1)), "episode") + " left this season" : ""}.`];
  if (t.show) lines.push(`The show has ${plural(t.show.seasons, "season")} and ${plural(t.show.episodes, "episode")} (${t.show.status || "status unknown"})${t.show.next ? `; next new episode ${fmtDate(t.show.next.air)}` : ""}.`);
  if (runtime) lines.push(`Episodes run about ${runtime} min; you're ${m} min into this one${runtime > m ? ` (~${runtime - m} min left)` : ""}.`);
  return { text: lines.join(" ") };
}

async function episode(ctx: Ctx): Promise<Answer> {
  const { w } = ctx;
  if (w.type !== "tv" || !w.s || !w.e) return premise(ctx);
  const ep = (await getSeason(w.id, w.s).catch(() => null))?.episodes.find((e) => e.e === w.e);
  if (!ep) return { text: `TMDB has nothing on S${w.s} E${w.e}. Check the episode with the − / + buttons above.` };
  const bits = [ep.air && `aired ${fmtDate(ep.air)}`, ep.runtime && `${ep.runtime} min`, ep.rating && ep.votes > 5 && `rated ${ep.rating.toFixed(1)}/10 on TMDB`].filter(Boolean);
  return {
    text: `**S${w.s} E${w.e} · ${ep.name}**${bits.length ? `: ${bits.join(", ")}` : ""}.` +
      (ep.directors.length ? ` Directed by ${and(ep.directors)}.` : "") + (ep.writers.length ? ` Written by ${and(ep.writers)}.` : "") +
      (ep.guests.length ? ` Guest stars: ${and(ep.guests.slice(0, 5).map((g) => `${g.name}${g.role ? ` (${g.role})` : ""}`))}.` : "") +
      (ctx.spoilers && ep.overview ? `\n\n${ep.overview}` : ""),
    cards: ep.guests.slice(0, 6).map((g) => ({ kind: "person" as const, id: g.id, name: g.name, photo: g.photo, sub: g.role })),
  };
}

async function awards(ctx: Ctx): Promise<Answer> {
  const a = await getAwards(ctx.t.imdbId);
  if (!a || !a.groups.length) return { text: "Wikidata lists no awards or nominations for this.", links: linksFor(ctx, null, "awards") };
  const lines = a.groups.slice(0, 4).map((g) => `- **${g.name}**: ${g.won.length ? `won ${and(g.won.slice(0, 4).map((x) => x.category || "the award"))}${g.won.length > 4 ? ` +${g.won.length - 4}` : ""}` : ""}${g.won.length && g.nominated.length ? "; " : ""}${g.nominated.length ? `${plural(g.nominated.length, "other nomination")}` : ""}`);
  const head = a.oscars.won || a.oscars.nominated ? `**${plural(a.oscars.won, "Oscar")} won** from ${plural(a.oscars.won + a.oscars.nominated, "nomination")}.` : a.emmys.won || a.emmys.nominated ? `**${plural(a.emmys.won, "Emmy", "Emmys")} won** from ${plural(a.emmys.won + a.emmys.nominated, "nomination")}.` : "";
  return { text: `${head}\n${lines.join("\n")}`.trim() };
}

async function moneyQ(ctx: Ctx): Promise<Answer> {
  const f = await ctx.facts();
  if (!f || (!f.budget && !f.revenue)) return { text: ctx.t.type === "tv" ? "TMDB doesn't track budgets for series." : "TMDB doesn't have budget or box office numbers for this.", links: linksFor(ctx, null, "budget box office") };
  const x = f.budget && f.revenue ? ` That's ${(f.revenue / f.budget).toFixed(1)}× its budget.` : "";
  return { text: [f.budget && `**Budget:** ${money(f.budget)}.`, f.revenue && `**Box office:** ${money(f.revenue)} worldwide.`].filter(Boolean).join(" ") + x };
}

async function rating(ctx: Ctx): Promise<Answer> {
  const f = await ctx.facts();
  const mine = ctx.lib.find((l) => l.key === ctx.t.key)?.rating;
  return {
    text: [f?.votes ? `**${f.rating}/10 on TMDB** from ${f.votes.toLocaleString("en-US")} votes.` : "Not enough TMDB votes for a rating.", mine ? `You gave it ${"★".repeat(mine)}.` : ""].filter(Boolean).join(" "),
    links: [...(ctx.t.imdbId ? [{ label: "IMDb", url: `https://www.imdb.com/title/${ctx.t.imdbId}/` }] : []), { label: "Rotten Tomatoes", url: google(`${ctx.t.title}${yr(ctx.t)} rotten tomatoes`) }],
  };
}

function stream(ctx: Ctx): Answer {
  const cc = ctx.profile?.country ?? "US";
  const g = ctx.t.prov[cc];
  if (!g) return { text: `JustWatch lists nowhere to watch this in ${cc}.` };
  const names = (l?: { name: string }[]) => and((l ?? []).slice(0, 5).map((p) => p.name));
  const lines = [g.flatrate?.length && `**Streaming:** ${names(g.flatrate)}`, g.free?.length && `**Free:** ${names(g.free)}`, g.ads?.length && `**With ads:** ${names(g.ads)}`, g.rent?.length && `**Rent:** ${names(g.rent)}`, g.buy?.length && `**Buy:** ${names(g.buy)}`].filter(Boolean);
  return { text: `In ${cc}: ${lines.join(". ")}.`, links: g.link ? [{ label: "JustWatch", url: g.link }] : undefined };
}

async function song(ctx: Ctx): Promise<Answer> {
  const a = await ctx.article();
  const by = ctx.t.crewBy.composer;
  const s = a ? bestSentences(a.sections, ["song", "music", "soundtrack", "score", "track", "featur"], { spoilers: ctx.spoilers, only: /music|soundtrack|score/i, max: 2, min: 1 }) : [];
  const ep = ctx.w.type === "tv" ? ` S${ctx.w.s}E${ctx.w.e}` : "";
  return {
    text: `I can't hear what's playing, so the fastest fix is **Shazam** (or Control Centre's music recognition) right now. Tunefind lists the songs by scene${ep ? " and episode" : ""}.` +
      (by.length ? ` The score is by **${and(by.map((p) => p.name))}**.` : "") + (s.length ? `\n\n${s.map((x) => `> ${x.text}`).join("\n\n")}` : ""),
    links: [{ label: "Tunefind", url: `https://www.tunefind.com/search/site?q=${encodeURIComponent(ctx.t.title)}` }, { label: "Search Google", url: google(`${ctx.t.title}${ep} songs`) }],
  };
}

async function release(ctx: Ctx): Promise<Answer> {
  const f = await ctx.facts();
  if (ctx.t.type === "tv" && ctx.t.show) return { text: `It first aired **${fmtDate(ctx.t.show.first)}**${ctx.t.show.last ? `; the latest episode aired ${fmtDate(ctx.t.show.last)}` : ""} (${ctx.t.show.status}).` };
  return { text: f?.release ? `Released **${fmtDate(f.release)}**.` : `It came out in ${ctx.t.year || "an unknown year"}.` };
}

async function language(ctx: Ctx): Promise<Answer> {
  const f = await ctx.facts();
  return { text: `${f?.languages.length ? `**Spoken:** ${and(f.languages)}.` : ""}${f?.original && f.original !== ctx.t.title ? ` Original title: *${f.original}*.` : ""}${f?.countries.length ? ` Made in ${and(f.countries)}.` : ""}`.trim() || "TMDB has no language details." };
}

function premise(ctx: Ctx): Answer {
  const { t } = ctx;
  return { text: [t.tagline && `*${t.tagline}*`, t.overview || "TMDB has no synopsis.", t.genres.length && `${and(t.genres)}.`].filter(Boolean).join("\n\n") };
}

/** Anything else: the Wikipedia sentences that match the question best, with ways to look further. */
async function lookup(ctx: Ctx, q: string): Promise<Answer> {
  const a = await ctx.article();
  const found = a ? bestSentences(a.sections, q, { spoilers: ctx.spoilers, max: 3, min: 2.2 }) : [];
  if (!found.length) return { text: `I couldn't find that in TMDB or Wikipedia${ctx.spoilers ? "" : " (with plot sections left out to avoid spoilers)"}. Try the links, or rephrase with a name.`, links: linksFor(ctx, a, q) };
  return { text: `From Wikipedia:\n\n${found.map((f) => `> ${f.text} *(${f.section})*`).join("\n\n")}`, links: linksFor(ctx, a, q) };
}

async function personQ(ctx: Ctx, q: string): Promise<Answer> {
  const hit = (await search(q, "person")).find((h) => h.kind === "person");
  if (!hit || hit.kind !== "person") return lookup(ctx, q);
  return who(ctx, [hit.id], !ctx.cast.some((c) => c.id === hit.id));
}

export interface AskQuery { q: string; last: number[]; spoilers: boolean }

/** Answer one question about the current watch. Never throws: a failed lookup becomes a short note with links. */
export async function answer(w: Watch, lib: LibItem[], profile: Profile | null, input: AskQuery): Promise<Answer> {
  const t = await getTitle(w.type, w.id);
  const cast = await onScreen(w, t);
  const everyone: Who[] = [...cast, ...(t.extras ?? []).filter((x) => !cast.some((c) => c.id === x.id))].map((c) => ({ id: c.id, name: c.name, role: c.role }));
  const once = <T,>(f: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= f()); };
  const ctx: Ctx = {
    w, t, lib, cast, profile, spoilers: input.spoilers, q: input.q,
    status: new Map(lib.map((l) => [l.key, l.status])),
    facts: once(() => getTitleFacts(w.type, w.id).catch(() => null)),
    article: once(async () => getArticle((await getWikiFacts(t.imdbId))?.article ?? null)),
  };
  // A person named who is beyond the on-screen list (series regulars past the top 24) still counts as "in this cast".
  for (const p of everyone) if (!ctx.cast.some((c) => c.id === p.id)) ctx.cast.push({ ...p, photo: null });
  const intent: Intent = parseQuestion(input.q, everyone, input.last);
  let res: Answer;
  try {
    res = await route(ctx, intent);
  } catch (e) {
    console.error(JSON.stringify({ ask_error: String((e as Error)?.message ?? e).slice(0, 300), intent: intent.kind }));
    res = { text: "That lookup failed (TMDB or Wikipedia didn't answer). Try again in a moment.", links: linksFor(ctx, null) };
  }
  const names = await Promise.all((res.about ?? []).slice(0, 1).map((id) => nameOf(ctx, id).catch(() => "")));
  res.next ??= followUps(intent, names.filter(Boolean), w.type);
  return res;
}

function route(ctx: Ctx, i: Intent): Promise<Answer> | Answer {
  switch (i.kind) {
    case "who": return who(ctx, i.people);
    case "person": return personQ(ctx, i.q);
    case "credits": return credits(ctx, i.people[0]);
    case "together": return i.people.length >= 2 ? together(ctx, i.people) : withCast(ctx, i.people[0]);
    case "castLinks": return castLinks(ctx);
    case "castKnown": return castKnown(ctx);
    case "common": return common(ctx, i.other);
    case "crew": return crew(ctx, i.role);
    case "age": return age(ctx, i.people);
    case "bio": return bio(ctx, i.people[0]);
    case "recap": return recap(ctx);
    case "premise": return premise(ctx);
    case "truth": return truth(ctx);
    case "filmed": return filmed(ctx);
    case "stinger": return stinger(ctx);
    case "trivia": return trivia(ctx);
    case "length": return length(ctx);
    case "episode": return episode(ctx);
    case "awards": return awards(ctx);
    case "money": return moneyQ(ctx);
    case "rating": return rating(ctx);
    case "stream": return stream(ctx);
    case "song": return song(ctx);
    case "release": return release(ctx);
    case "language": return language(ctx);
    case "search": return lookup(ctx, i.q);
  }
}
