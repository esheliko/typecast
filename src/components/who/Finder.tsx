"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLib } from "../cast/LibState";
import { Photo, SEEN_STATUS, Sk } from "./bits";
import { useWho } from "./WhoContext";
import { peopleHere, type FoundTitle } from "@/lib/who-common";
import { whoApi, type Recent } from "@/lib/who-client";
import { byGender, episodesLabel, groupWhoFaces, guestsOnly, matchFaces, type GenderFilter } from "@/lib/who-scope";
import { roleLabel } from "@/lib/roster";
import type { WhoFace, WhoRoster } from "@/lib/who-types";

const PER_GROUP = 12;

/** The left pane: finder input, filter chips, "recently opened", the face grid. The input filters and finds; it never answers. */
export function Finder({ roster, loading, err, q, setQ, inputRef, recents, onOpen, onRetry }: {
  roster: WhoRoster | null; loading: boolean; err: boolean; q: string; setQ: (q: string) => void; inputRef: React.RefObject<HTMLInputElement | null>;
  recents: Recent[]; onOpen: (f: { id: number; name: string; photo: string | null }, opts?: { hl?: string }) => void; onRetry: () => void;
}) {
  const { brief, pos, prefetchPerson } = useWho();
  const [gender, setGender] = useState<GenderFilter>("all");
  const [guests, setGuests] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const film = brief.type === "movie";
  const faces = useMemo(() => roster?.faces ?? [], [roster]);
  const shown = useMemo(() => matchFaces(guests ? guestsOnly(byGender(faces, gender)) : byGender(faces, gender), q), [faces, gender, guests, q]);
  const groups = useMemo(() => groupWhoFaces(shown, roster?.scope ?? null).map((g) => (film && g.id === "guest" ? { ...g, label: "Also in the cast" } : g)), [shown, roster?.scope, film]);
  const query = q.trim();

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
  const visible = useMemo(() => groups.flatMap((g) => g.faces.slice(0, open[g.id] ? g.faces.length : PER_GROUP)), [groups, open]);
  const [known, setKnown] = useState<Record<number, [string, string, string][]>>({});
  const askedKnown = useRef(new Set<number>());
  const ids = visible.map((f) => f.id).join(",");
  useEffect(() => {
    const need = ids.split(",").map(Number).filter((n) => n && !askedKnown.current.has(n));
    if (!need.length) return;
    need.forEach((n) => askedKnown.current.add(n));
    let live = true;
    for (let i = 0; i < need.length; i += 24) {
      const chunk = need.slice(i, i + 24);
      whoApi.known(chunk).then((r) => { if (live) setKnown((k) => ({ ...k, ...Object.fromEntries(chunk.map((id) => [id, r.known[id]?.top ?? []])) })); })
        .catch(() => { chunk.forEach((n) => askedKnown.current.delete(n)); });
    }
    return () => { live = false; };
  }, [ids]);

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

  const total = faces.length;
  return (
    <div className="wx-finder">
      <div className="wx-find">
        <input ref={inputRef} type="search" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Find in this cast"
          placeholder={film ? "Find by actor, character or another title…" : "Find by actor, character, or a title they were in…"} enterKeyHint="search" autoComplete="off" spellCheck={false} />
        <kbd className="wx-kbd" aria-hidden="true">/</kbd>
      </div>
      <div className="wx-chips" role="group" aria-label="Filter faces">
        <div className="seg" role="group" aria-label="Gender">
          {([["all", "All"], ["f", "Women"], ["m", "Men"]] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={gender === v} onClick={() => setGender(v)}>{t}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Guests">
          <button type="button" aria-pressed={!guests} onClick={() => setGuests(false)}>All</button>
          <button type="button" aria-pressed={guests} onClick={() => setGuests(true)}>{film ? "Not main cast" : "Guests only"}</button>
        </div>
        <span className="small muted wx-count" aria-live="polite">{roster ? (shown.length === total ? `${total} people` : `${shown.length} of ${total}`) : ""}</span>
      </div>
      {roster?.note && <p className="small wx-scopenote" role="note">{roster.note}</p>}
      {roster?.partial && <p className="small muted">TMDB had nothing for some seasons, so this list may be short.</p>}

      {recents.length > 0 && (
        <div className="wx-recent" aria-label="Recently opened">
          <span className="mc-label">Recently opened</span>
          <div className="wx-recent-row">
            {recents.map((r) => (
              <button key={r.id} type="button" className="wx-rchip" onClick={() => onOpen(r)} onMouseEnter={() => prefetchPerson(r.id)}>
                <Photo path={r.photo} name={r.name} className="wx-rimg" /><span>{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {common && (
        <section className="wx-common" aria-label="Titles in common">
          <h3 className="wx-gh">Titles in common</h3>
          {common.titles === null && <div className="wx-comrow" aria-hidden="true"><Sk w={34} h={51} /><Sk w="55%" h={16} /></div>}
          {common.titles?.map((t) => (
            <div key={t.key} className="wx-comrow">
              <Photo path={t.poster} name={t.title} w="w92" className="wx-cpos" />
              <div className="wx-ccol">
                <b>{t.title}{t.year && <span className="muted"> ({t.year})</span>}: {peopleHere(t.people.length)}</b>
                <div className="wx-cfaces">
                  {t.people.slice(0, 8).map((p) => {
                    const f = roster?.faces.find((x) => x.id === p.id);
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
          {common.titles && !common.titles.length && !common.err && <p className="small muted" style={{ margin: 0 }}>No one here was in a title named &ldquo;{query}&rdquo;.</p>}
          {common.err && <p className="small muted" style={{ margin: 0 }}>Couldn&rsquo;t search titles just now.</p>}
        </section>
      )}

      {loading && !roster && !err && <GridSkeleton />}
      {err && <p className="small muted wx-soft" role="alert">Couldn&rsquo;t load who&rsquo;s in it. <button type="button" className="linkish" onClick={onRetry}>Try again</button></p>}
      {roster && !groups.length && <p className="small muted">{query ? `No one in this cast matches “${query}”.` : "No one to show for this filter."}</p>}
      <div onKeyDown={arrows}>
        {groups.map((g) => {
          const all = !!open[g.id];
          const list = all ? g.faces : g.faces.slice(0, PER_GROUP);
          return (
            <section key={g.id} className="wx-group" aria-label={g.label}>
              <h3 className="wx-gh">{g.label}<span className="muted"> · {g.faces.length}</span></h3>
              <ul className="wx-grid">
                {list.map((f, i) => <Tile key={f.id} f={f} eager={i < 8} known={known[f.id]} onOpen={() => onOpen(f)} />)}
              </ul>
              {g.faces.length > PER_GROUP && <button type="button" className="chip wx-more" onClick={() => setOpen((o) => ({ ...o, [g.id]: !all }))}>{all ? "Show fewer" : `Show ${g.faces.length - PER_GROUP} more`}</button>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <ul className="wx-grid" aria-hidden="true" data-testid="who-skeleton">
      {Array.from({ length: 12 }, (_, i) => <li key={i}><div className="wx-tile"><span className="sk-b wx-ph" /><Sk w="70%" h={14} style={{ marginTop: 8 }} /><Sk w="50%" h={11} style={{ marginTop: 6 }} /><Sk w="60%" h={11} style={{ marginTop: 6 }} /></div></li>)}
    </ul>
  );
}

/** Seen: the user has seen them in something (gold). Otherwise their best-known title, muted. Reserves its line so nothing jumps when it arrives. */
function Tile({ f, known, eager, onOpen }: { f: WhoFace; known?: [string, string, string][]; eager: boolean; onOpen: () => void }) {
  const lib = useLib();
  const { brief, prefetchPerson } = useWho();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hover = () => { clearTimeout(timer.current); timer.current = setTimeout(() => prefetchPerson(f.id), 150); };
  const leave = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  const seen = known?.find(([k]) => k !== brief.key && SEEN_STATUS.has(lib.get(k)?.status ?? ""));
  const best = known?.find(([k]) => k !== brief.key);
  const role = roleLabel(f.role), eps = episodesLabel(f);
  return (
    <li>
      <button type="button" className="wx-tile" data-pid={f.id} onClick={onOpen} onMouseEnter={hover} onMouseLeave={leave} onFocus={hover} onBlur={leave}>
        <Photo path={f.photo} name={f.name} eager={eager} className="wx-ph" />
        <b>{f.name}</b>
        <span className="small muted wx-role">{role || " "}</span>
        {eps && !(f.part === "episode" && f.n <= 1) && <span className="wx-eps">{eps}{f.part === "episode" ? " so far" : ""}</span>}
        <span className="wx-known">
          {!known ? <Sk w="65%" h={11} /> : seen ? <span className="wx-seen">Seen in {seen[1]}</span> : best ? <span className="small muted">Best known: {best[1]}</span> : null}
        </span>
      </button>
    </li>
  );
}
