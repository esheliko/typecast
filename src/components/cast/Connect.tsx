"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar, Thumb } from "../ui";
import QuickMark from "./QuickMark";
import RelatedButton from "./RelatedButton";
import { PersonLink, TitleLink } from "../Modal";
import { KindFilter } from "../KindSeg";
import { typeLabel } from "@/lib/img";
import type { Item, PeopleLink, PersonLite, Regular, SearchHit, TitlesLink } from "@/lib/types";

export type Mode = "people" | "titles";
type Pick = { kind: "person"; p: PersonLite } | { kind: "title"; t: Item };

/** Find what links two people, or which actors two titles share. */
export default function Connect({ initialMode, initialA }: { initialMode: Mode; initialA: Pick | null }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [a, setA] = useState<Pick | null>(initialA);
  const [b, setB] = useState<Pick | null>(null);
  const [res, setRes] = useState<PeopleLink | TitlesLink | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  function switchMode(m: Mode) { if (m === mode) return; setMode(m); setA(null); setB(null); setRes(null); }

  useEffect(() => {
    if (!a || !b) { setRes(null); return; }
    const ctl = new AbortController();
    const id = (x: Pick) => (x.kind === "person" ? String(x.p.id) : x.t.key);
    setState("loading"); setRes(null);
    fetch(`/api/connect?${mode === "people" ? "people" : "titles"}=${id(a)},${id(b)}`, { signal: ctl.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Lookup failed."); setRes(j); setState("idle"); })
      .catch((e) => { if (e.name !== "AbortError") { setError(e.message); setState("error"); } });
    return () => ctl.abort();
  }, [a, b, mode]);

  const kind = mode === "people" ? "person" : "title";
  return (
    <section aria-label="Connections">
      <div className="seg wide" role="group" aria-label="Connect">
        <button type="button" aria-pressed={mode === "people"} onClick={() => switchMode("people")}>Two people</button>
        <button type="button" aria-pressed={mode === "titles"} onClick={() => switchMode("titles")}>Two titles</button>
      </div>
      <p className="muted small" style={{ margin: "10px 0 12px" }}>
        {mode === "people" ? "See every title two people worked on together. If there are none, see who links them." : "See which actors were in both, and who they played."}
      </p>
      <div className="pair">
        <Picker kind={kind} value={a} onChange={setA} label={mode === "people" ? "First person" : "First title"} />
        <span className="pair-and" aria-hidden="true">+</span>
        <Picker kind={kind} value={b} onChange={setB} label={mode === "people" ? "Second person" : "Second title"} autoFocus={!!a && !b} />
      </div>

      {state === "loading" && <p className="muted" style={{ marginTop: 16 }}><span className="spin" />{mode === "people" ? "Comparing filmographies" : "Comparing casts"}</p>}
      {state === "error" && <p className="err" style={{ marginTop: 16 }}>{error}</p>}
      {res && "bridges" in res && <PeopleResult r={res} />}
      {res && !("bridges" in res) && <TitlesResult r={res} />}
      {!a && !b && <Regulars onPick={(p) => { switchMode("people"); setA({ kind: "person", p }); }} />}
    </section>
  );
}

function PeopleResult({ r }: { r: PeopleLink }) {
  if (r.shared.length) return (
    <>
      <h2>{r.shared.length} together</h2>
      <KindFilter items={r.shared}>{(shared) => <div className="card"><ul className="rows">
        {shared.map((s) => (
          <li key={s.key} className="row">
            <TitleLink k={s.key} it={s} className="row-link"><Thumb path={s.poster} />
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 17 }}>{s.title}</span>
                <span className="row-sub">{s.year} · {typeLabel(s.type)}</span>
                <span className="row-sub"><b>{r.a.name}</b>{s.roles[0] ? ` as ${s.roles[0]}` : ""} · <b>{r.b.name}</b>{s.roles[1] ? ` as ${s.roles[1]}` : ""}</span>
              </span>
            </TitleLink>
            <QuickMark it={s} variant="inline" /><RelatedButton it={s} />
          </li>
        ))}
      </ul></div>}</KindFilter>
    </>
  );
  return (
    <>
      <h2>Never in the same title</h2>
      {r.bridges.length === 0 ? <p className="muted">No co-star links them through their best-known titles.</p> : (
        <>
          <p className="muted small" style={{ marginTop: -4 }}>They are linked through these co-stars:</p>
          <div className="card"><ul className="rows">
            {r.bridges.map((x) => (
              <li key={x.person.id} className="bridge">
                <PersonLink pid={x.person.id} it={x.person} className="bridge-who"><Avatar photo={x.person.photo} name={x.person.name} /><span className="row-title" style={{ fontSize: 17 }}>{x.person.name}</span></PersonLink>
                <div className="bridge-via">
                  <TitleLink k={x.viaA.key}>with {r.a.name} in <b>{x.viaA.title}</b>{x.viaA.year ? ` (${x.viaA.year})` : ""}</TitleLink>
                  <TitleLink k={x.viaB.key}>with {r.b.name} in <b>{x.viaB.title}</b>{x.viaB.year ? ` (${x.viaB.year})` : ""}</TitleLink>
                </div>
              </li>
            ))}
          </ul></div>
        </>
      )}
    </>
  );
}

function TitlesResult({ r }: { r: TitlesLink }) {
  return (
    <>
      <h2>{r.shared.length ? `${r.shared.length} in both` : "No actors in both"}</h2>
      {r.shared.length > 0 && (
        <div className="card"><ul className="rows">
          {r.shared.map((p) => (
            <li key={p.id}><PersonLink className="row" pid={p.id} it={p}>
              <Avatar photo={p.photo} name={p.name} />
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 17 }}>{p.name}</span>
                <span className="row-sub">{p.roles[0] || "Unnamed role"} in {r.a.title}</span>
                <span className="row-sub">{p.roles[1] || "Unnamed role"} in {r.b.title}</span>
              </span>
            </PersonLink></li>
          ))}
        </ul></div>
      )}
    </>
  );
}

/** Actors who keep turning up in what you have watched. Loaded only when this view opens. */
function Regulars({ onPick }: { onPick: (p: PersonLite) => void }) {
  const [list, setList] = useState<Regular[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/connect?regulars=1").then((r) => r.json()).then((j) => { if (live) setList(j.regulars ?? []); }).catch(() => live && setList([]));
    return () => { live = false; };
  }, []);
  if (list === null) return <><h2>Your regulars</h2><p className="muted"><span className="spin" />Looking through your library</p></>;
  return (
    <>
      <h2>Your regulars</h2>
      {list.length === 0 ? <p className="muted small">Actors who turn up in two or more of the titles you have watched appear here. Mark a few titles Watched to fill this in.</p> : (
        <div className="card"><ul className="rows">
          {list.map((p) => (
            <li key={p.id} className="row">
              <PersonLink pid={p.id} it={p} className="row-link">
                <Avatar photo={p.photo} name={p.name} />
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 17 }}>{p.name}</span>
                  <span className="row-sub"><span className="seen-n">{p.titles.length} of yours</span> · {p.titles.slice(0, 4).map((t) => t.title).join(", ")}</span>
                </span>
              </PersonLink>
              <button type="button" className="btn sm" onClick={() => onPick(p)}>Connect</button>
            </li>
          ))}
        </ul></div>
      )}
    </>
  );
}

function Picker({ kind, value, onChange, label, autoFocus }: { kind: "person" | "title"; value: Pick | null; onChange: (p: Pick | null) => void; label: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setBusy(false); return; }
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/search?kind=${kind}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json()).then((j) => { setHits(j.hits ?? []); setActive(0); setBusy(false); })
        .catch(() => setBusy(false));
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, kind]);

  function pick(h: SearchHit) {
    onChange(h.kind === "person" ? { kind: "person", p: { id: h.id, name: h.name, photo: h.photo } } : { kind: "title", t: { key: h.key, type: h.type, id: h.id, title: h.title, year: h.year, poster: h.poster } });
    setQ(""); setHits([]); setOpen(false);
  }

  if (value) return (
    <div className="pick chosen">
      {value.kind === "person" ? <Avatar photo={value.p.photo} name={value.p.name} /> : <Thumb path={value.t.poster} />}
      <span className="row-main"><span className="row-title" style={{ fontSize: 17 }}>{value.kind === "person" ? value.p.name : value.t.title}</span>
        {value.kind === "title" && <span className="row-sub">{value.t.year} · {typeLabel(value.t.type)}</span>}</span>
      <button type="button" className="x" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)}>×</button>
    </div>
  );
  const id = `pk-${label.replace(/\s/g, "")}`;
  return (
    <div className="pick">
      <input ref={input} type="search" value={q} placeholder={kind === "person" ? "Search a person" : "Search a film or series"} aria-label={label}
        role="combobox" aria-expanded={open && hits.length > 0} aria-controls={id} aria-autocomplete="list" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active]); }
        }} />
      {busy && <span className="spin pick-spin" />}
      {open && hits.length > 0 && (
        <ul className="pick-list" id={id} role="listbox">
          {hits.map((h, i) => (
            <li key={h.kind === "person" ? `p${h.id}` : h.key} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}>
              {h.kind === "person" ? <><Avatar photo={h.photo} name={h.name} /><span className="row-main"><span className="row-title" style={{ fontSize: 16 }}>{h.name}</span><span className="row-sub">{h.knownFor.join(", ")}</span></span></>
                : <><Thumb path={h.poster} /><span className="row-main"><span className="row-title" style={{ fontSize: 16 }}>{h.title}</span><span className="row-sub">{h.year} · {typeLabel(h.type)}</span></span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
