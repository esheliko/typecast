"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLib } from "../cast/LibState";
import { Photo, SEEN_STATUS, Sk } from "./bits";
import { useWho } from "./WhoContext";
import { peopleHere, titlesForQuery, titlesWithPeople, type FoundTitle } from "@/lib/who-common";
import { img } from "@/lib/img";
import { whoApi, type RecentTrail } from "@/lib/who-client";
import { byCast, byGender, groupWhoFaces, matchFaces, type CastFilter, type GenderFilter } from "@/lib/who-scope";
import { RecentRow } from "./Trail";
import { GlimpseButton } from "../Glimpse";
import { castSpec, scopeSpec } from "@/lib/glimpse";
import { getJson } from "@/lib/who-client";
import { isOldTitle } from "@/lib/then-photo";
import { useThen } from "./useThen";
import type { GlimpseImage } from "@/app/api/glimpse/route";
import { roleLabel } from "@/lib/roster";
import { pickSeenIn, seenInText, type KnownTitle } from "@/lib/who-known";
import type { WhoFace, WhoRoster } from "@/lib/who-types";

const PER_GROUP = 12;
/** How many faces a group shows before "Show more": about PER_GROUP, rounded up to whole rows of the grid as it is laid out now. */
const perGroup = (cols: number) => (cols > 0 ? cols * Math.max(1, Math.ceil(PER_GROUP / cols)) : PER_GROUP);

/** The left pane: finder input, filter chips, "recently opened", the face grid. The input filters and finds; it never answers. */
export function Finder({ roster, loading, err, q, setQ, inputRef, recents, onOpen, onRestore, onRetry }: {
  roster: WhoRoster | null; loading: boolean; err: boolean; q: string; setQ: (q: string) => void; inputRef: React.RefObject<HTMLInputElement | null>;
  recents: RecentTrail[]; onOpen: (f: { id: number; name: string; photo: string | null }, opts?: { hl?: string }) => void; onRestore: (r: RecentTrail) => void; onRetry: () => void;
}) {
  const { brief, pos, prefetchPerson, spoilers } = useWho();
  const [gender, setGender] = useState<GenderFilter>("all");
  const [cast, setCast] = useState<CastFilter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Columns the grid has right now (it is auto-fill, so it changes with the window): the folded view always ends on a full row.
  const wrap = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(0);
  const lim = perGroup(cols);
  const film = brief.type === "movie";
  const faces = useMemo(() => roster?.faces ?? [], [roster]);
  const shown = useMemo(() => matchFaces(byCast(byGender(faces, gender), cast), q), [faces, gender, cast, q]);
  const groups = useMemo(() => groupWhoFaces(shown, roster?.scope ?? null).map((g) => (film && g.id === "guest" ? { ...g, label: "Also in the cast" } : g)), [shown, roster?.scope, film]);
  const query = q.trim();

  // The enlarged photo on hover or keyboard focus (never on touch): fixed, so nothing in the grid moves.
  const [pop, setPop] = useState<{ f: WhoFace; r: DOMRect } | null>(null);

  // Titles in common: what the query names (a show, a film) searched on TMDB and met with the roster.
  const [common, setCommon] = useState<{ q: string; titles: FoundTitle[] | null; err?: boolean } | null>(null);
  const posRef = useRef(pos); posRef.current = pos;
  useEffect(() => {
    if (query.length < 3 || !roster) { setCommon(null); return; }
    let live = true;
    setCommon((c) => (c?.q === query ? c : { q: query, titles: null }));
    const t = setTimeout(() => {
      whoApi.common(query, brief.key, roster.pos).then((r) => { if (live) setCommon({ q: query, titles: r.titles }); }).catch(() => { if (live) setCommon({ q: query, titles: [], err: true }); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [query, brief.key, roster]);

  // "Known from": for the tiles on screen, matched against the user's marks in the browser.
  const visible = useMemo(() => groups.flatMap((g) => g.faces.slice(0, open[g.id] ? g.faces.length : lim)), [groups, open, lim]);
  const [known, setKnown] = useState<Record<number, KnownTitle[]>>({});
  const askedKnown = useRef(new Set<number>());
  const ids = visible.map((f) => f.id).join(",");
  useEffect(() => {
    const need = ids.split(",").map(Number).filter((n) => n && !askedKnown.current.has(n));
    if (!need.length) return;
    need.forEach((n) => askedKnown.current.add(n));
    for (let i = 0; i < need.length; i += 24) {
      const chunk = need.slice(i, i + 24);
      // Answers are kept even when the visible set has moved on, so a tile never waits for a reply that was thrown away.
      whoApi.known(chunk).then((r) => setKnown((k) => ({ ...k, ...Object.fromEntries(chunk.map((id) => [id, r.known[id]?.top ?? []])) })))
        .catch(() => { chunk.forEach((n) => askedKnown.current.delete(n)); });
    }
  }, [ids]);

  // "Then" photos: how each person looked in this title (the Glimpse "In the role" image search, cached 30 days server-side). Opt-in, only for older titles,
  // only the faces on screen, a few at a time. The tile keeps its box, so nothing moves; a face with no image keeps the profile photo.
  const old = isOldTitle(brief.first, new Date().getFullYear());
  const [then, flipThen] = useThen();
  const [thenOk, setThenOk] = useState(true);
  const [thenImg, setThenImg] = useState<Record<number, string | null>>({});
  const thenSpecs = useMemo(() => new Map(visible.map((f) => [f.id, castSpec(f.name, f.role, { title: brief.title, year: brief.year, type: brief.type, key: brief.key }, "Acting", f.id).tabs[0].q])), [visible, brief]);
  // A queue that outlives the effect: when the grid re-measures (`visible` changes) while lookups are running, nothing queued is lost or fetched twice.
  const askedThen = useRef(new Set<number>());
  const thenQueue = useRef<{ id: number; q: string }[]>([]);
  const thenBusy = useRef(0);
  const pumpThen = useRef<() => void>(() => {});
  pumpThen.current = () => {
    while (thenBusy.current < 3 && thenQueue.current.length) {
      const job = thenQueue.current.shift()!;
      thenBusy.current++;
      (async () => {
        // Retried twice: image search can fail for a moment (rate limit), and a face must not stay without its photo for that.
        for (let a = 0; a < 3; a++) {
          try {
            const r = await getJson<{ configured?: boolean; images?: GlimpseImage[] }>(`/api/glimpse?q=${encodeURIComponent(job.q)}`);
            if (r.configured === false) { thenQueue.current = []; setThenOk(false); return; }
            const url = r.images?.[0]?.thumb ?? null;
            if (url) { const pre = new Image(); pre.referrerPolicy = "no-referrer"; pre.src = url; }
            setThenImg((m) => ({ ...m, [job.id]: url }));
            return;
          } catch { await new Promise((ok) => setTimeout(ok, 700 * (a + 1))); }
        }
        askedThen.current.delete(job.id); // still failing: a later change of the visible faces asks again
      })().finally(() => { thenBusy.current--; pumpThen.current(); });
    }
  };
  useEffect(() => {
    // Fetched ahead for every face shown, whether or not "Then" is on, so the switch and the hover pop show them at once.
    if (!old || !thenOk) return;
    const asked = askedThen.current;
    for (const f of visible) {
      if (asked.has(f.id)) continue;
      asked.add(f.id);
      thenQueue.current.push({ id: f.id, q: thenSpecs.get(f.id) ?? "" });
    }
    pumpThen.current();
  }, [old, thenOk, visible, thenSpecs]);
  const showThen = then && old && thenOk;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const grid = el.querySelector<HTMLElement>(".wx-grid");
      if (!grid) return;
      const n = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (n > 0) setCols((c) => (c === n ? c : n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups.length]);

  const arrows = (ev: React.KeyboardEvent) => {
    const k = ev.key;
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(k)) return;
    const el = (ev.target as HTMLElement).closest<HTMLElement>(".wx-tile");
    if (!el) return;
    ev.preventDefault();
    const tiles = [...ev.currentTarget.querySelectorAll<HTMLElement>(".wx-tile")];
    const i = tiles.indexOf(el);
    if (k === "ArrowRight") return tiles[i + 1]?.focus();
    if (k === "ArrowLeft") return tiles[i - 1]?.focus();
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2;
    const cand = tiles.filter((t) => { const b = t.getBoundingClientRect(); return k === "ArrowDown" ? b.top > r.top + 8 : b.top < r.top - 8; });
    if (!cand.length) return;
    const rowTop = (k === "ArrowDown" ? Math.min : Math.max)(...cand.map((t) => t.getBoundingClientRect().top));
    cand.filter((t) => Math.abs(t.getBoundingClientRect().top - rowTop) < 8)
      .sort((a, b) => Math.abs(a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2 - cx) - Math.abs(b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2 - cx))[0]?.focus();
  };

  // Cast matches come first. Titles in common sit under them, and only when a title is what was asked for; with no cast match they are the answer.
  const faceById = useMemo(() => new Map(faces.map((f) => [f.id, f])), [faces]);
  const cmTitles = useMemo(() => (common?.titles ? titlesWithPeople(titlesForQuery(query, common.titles, shown.length > 0), (id) => { const f = faceById.get(id); return !!f && byGender([f], gender).length > 0; }) : null), [common, query, shown.length, gender, faceById]);
  const cmPending = !!common && common.titles === null && query.length >= 3;
  const noMatch = !!roster && !groups.length && !cmPending && !cmTitles?.length;
  const total = faces.length;
  return (
    <div className="wx-finder">
      <div className="wx-stick">
      <div className="wx-find">
        <input ref={inputRef} type="search" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Find in this cast"
          placeholder={film ? "Find by actor, character or another title…" : "Find by actor, character, or a title they were in…"} enterKeyHint="search" autoComplete="off" spellCheck={false} />
        <kbd className="wx-kbd" aria-hidden="true">/</kbd>
      </div>
      <div className="wx-chips" role="group" aria-label="Filter faces">
        <div className="seg" role="group" aria-label="Gender">
          {([["all", "All"], ["f", "Women"], ["m", "Men"]] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={gender === v} onClick={() => setGender(v)}>{t}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Cast">
          {([["all", "All"], ["main", "Main cast"], ["guests", film ? "Others" : "Guests"]] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={cast === v} onClick={() => setCast(v)}>{t}</button>)}
        </div>
        {old && thenOk && (
          <div className="seg" role="group" aria-label="Photos">
            {([[false, "Now"], [true, "Then"]] as const).map(([v, t]) => <button key={t} type="button" aria-pressed={then === v} onClick={() => flipThen(v)} title={v ? `How they looked in ${brief.title}` : "Current photos"}>{t}</button>)}
          </div>
        )}
        <span className="small muted wx-count" aria-live="polite">{roster ? (shown.length === total ? `${total} people` : `${shown.length} of ${total}`) : ""}</span>
      </div>
      </div>
      {roster?.note && !spoilers && <p className="small wx-scopenote" role="note">{roster.note}</p>}
      {roster?.partial && <p className="small muted">TMDB had nothing for some seasons, so this list may be short.</p>}

      <RecentRow recents={recents} onRestore={onRestore} onWarm={prefetchPerson} />

      {loading && !roster && !err && <GridSkeleton />}
      {err && <p className="small muted wx-soft" role="alert">Couldn&rsquo;t load who&rsquo;s in it. <button type="button" className="linkish" onClick={onRetry}>Try again</button></p>}
      {noMatch && <p className="small muted">{query ? `No one in this cast matches “${query}”.${common?.err ? " Couldn’t search titles just now." : ""}` : "No one to show for this filter."}</p>}
      <div ref={wrap} onKeyDown={arrows}>
        {groups.map((g) => {
          const all = !!open[g.id];
          const list = all ? g.faces : g.faces.slice(0, lim);
          return (
            <section key={g.id} className="wx-group" aria-label={g.label}>
              <h3 className="wx-gh">{g.label}<span className="muted"> · {g.faces.length}</span></h3>
              <ul className="wx-grid">
                {list.map((f, i) => <Tile key={f.id} f={f} eager={i < 12} known={known[f.id]} then={showThen ? thenImg[f.id] : undefined} year={brief.year} onOpen={() => onOpen(f)} onPop={setPop} />)}
              </ul>
              {g.faces.length > lim && <button type="button" className="chip wx-more" onClick={() => setOpen((o) => ({ ...o, [g.id]: !all }))}>{all ? "Show fewer" : `Show ${g.faces.length - lim} more`}</button>}
            </section>
          );
        })}
      </div>

      {query.length >= 3 && (cmPending && !groups.length ? (
        <section className="wx-common" aria-label="Titles in common" aria-hidden="true"><div className="wx-comrow"><Sk w={34} h={51} /><Sk w="55%" h={16} /></div></section>
      ) : cmTitles && cmTitles.length > 0 ? (
        <section className="wx-common" aria-label="Titles in common">
          <h3 className="wx-gh">Titles in common</h3>
          {cmTitles.map((t) => (
            <div key={t.key} className="wx-comrow">
              <Photo path={t.poster} name={t.title} w="w92" className="wx-cpos" />
              <div className="wx-ccol">
                <b>{t.title}{t.year && <span className="muted"> ({t.year})</span>}: {peopleHere(t.people.length)}</b>
                <div className="wx-cfaces">
                  {t.people.slice(0, 8).map((p) => {
                    const f = faceById.get(p.id);
                    return f ? (
                      <button key={p.id} type="button" className="wx-cface" onClick={() => onOpen(f, { hl: t.key })} onMouseEnter={() => prefetchPerson(f.id)}>
                        <Photo path={f.photo} name={f.name} className="wx-cimg" /><span><b>{f.name}</b><span className="small muted">{p.role ? `as ${p.role}` : ""}</span></span>
                      </button>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null)}

      {pop && <Pop f={pop.f} r={pop.r} then={old && thenOk ? thenImg[pop.f.id] : undefined} year={brief.year} />}
    </div>
  );
}

/** The larger photo beside a tile: to its right, or its left near the edge, always inside the window. */
function Pop({ f, r, then, year }: { f: WhoFace; r: DOMRect; then?: string | null; year?: string }) {
  const W = then ? 400 : 220, H = Math.round(W * 1.5) + 54;
  let left = r.right + 10;
  if (left + W > window.innerWidth - 8) left = r.left - W - 10;
  left = Math.max(8, left);
  const top = Math.min(Math.max(8, r.top + r.height / 2 - H / 2), Math.max(8, window.innerHeight - H - 8));
  return (
    <div className="wx-pop" style={{ left, top, width: W }} aria-hidden="true">
      <div className={then ? "wx-popduo" : undefined}>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.photo ? <img src={img(f.photo, "w342")} alt="" /> : <span className="wx-noph wx-popph">{f.name.charAt(0)}</span>}
          {then && <figcaption>Now</figcaption>}
        </figure>
        {then && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="wx-popthen" src={then} alt="" referrerPolicy="no-referrer" />
            <figcaption>Then{year ? ` · ${year}` : ""}</figcaption>
          </figure>
        )}
      </div>
      <b>{f.name}</b>
      {f.role && <span className="small muted">{roleLabel(f.role)}</span>}
    </div>
  );
}

function GridSkeleton() {
  return (
    <ul className="wx-grid" aria-hidden="true" data-testid="who-skeleton">
      {Array.from({ length: 14 }, (_, i) => <li key={i}><div className="wx-tile"><span className="sk-b wx-ph" /><Sk w="70%" h={13} style={{ marginTop: 6 }} /><Sk w="50%" h={11} style={{ marginTop: 5 }} /></div></li>)}
    </ul>
  );
}

/** One face: photo, name, character (one line each) and one muted line, "x4 · Character in Title" (gold only for the seen part). Nothing is drawn for what is not known. */
function Tile({ f, known, eager, then, year, onOpen, onPop }: { f: WhoFace; known?: KnownTitle[]; eager: boolean; then?: string | null; year?: string; onOpen: () => void; onPop: (p: { f: WhoFace; r: DOMRect } | null) => void }) {
  const lib = useLib();
  const { brief, prefetchPerson, clip, spoilers } = useWho();
  const [bad, setBad] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (el: HTMLElement) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      prefetchPerson(f.id);
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) onPop({ f, r: el.getBoundingClientRect() });
    }, 150);
  };
  const hide = () => { clearTimeout(timer.current); onPop(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const pick = known ? pickSeenIn(known, brief.key, (k) => { const m = lib.get(k); return m && SEEN_STATUS.has(m.status) ? m : undefined; }) : null;
  const seen = pick ? seenInText(pick) : "";
  const best = known?.find(([k]) => k !== brief.key);
  const role = roleLabel(f.role);
  const n = f.part === "main" || f.n < 1 || (f.part === "episode" && f.n <= 1) ? 0 : f.n;
  const spec = scopeSpec(castSpec(f.name, f.role, { title: brief.title, year: brief.year, type: brief.type, key: brief.key }, "Acting", f.id), { key: brief.key, title: brief.title, clip, spoilers });
  const ch = roleLabel(f.role);
  return (
    <li className="wx-tli">
      <button type="button" className="wx-tile" data-pid={f.id} onClick={() => { hide(); onOpen(); }} onMouseEnter={(ev) => show(ev.currentTarget)} onMouseLeave={hide}
        onFocus={(ev) => { if (ev.currentTarget.matches(":focus-visible")) show(ev.currentTarget); else { clearTimeout(timer.current); prefetchPerson(f.id); } }} onBlur={hide}>
        {then && !bad ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <span className="wx-thenw"><img className="wx-ph wx-then" src={then} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} />{year && <span className="wx-thenb">{year}</span>}</span>
        ) : <Photo path={f.photo} name={f.name} eager={eager} className="wx-ph" />}
        <b className="wx-nm">{f.name}</b>
        <span className="small muted wx-rl"><span className="wx-rlt">{role || " "}</span>{n > 0 && <span className="wx-rln" title={`${n} episode${n === 1 ? "" : "s"}`}>&nbsp;· x{n}</span>}</span>
        <span className="small muted wx-meta" title={seen || (best ? best[1] : undefined)}>
          {pick ? <span className="wx-seen">{pick.character ? <><span className="wx-sc">{pick.character}</span><span className="wx-st">in {pick.title}</span></> : <span className="wx-st">Seen in {pick.title}</span>}</span> : best ? best[1] : null}
        </span>
      </button>
      <span className="wx-tileg"><GlimpseButton spec={spec} label={`About ${f.name}${ch ? ` as ${ch}` : ""}: the character, episodes and images`} /></span>
    </li>
  );
}
