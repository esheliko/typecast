"use client";
import { useEffect, useState, useTransition } from "react";
import { saveProfile } from "@/app/actions";
import { PRIORITY_LABEL, type Priority, type Profile } from "@/lib/types";
import SettingRow from "@/components/SettingRow";
import { PRIO_KEY } from "@/components/cast/LibState";

const COUNTRIES: [string, string][] = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"], ["DE", "Germany"], ["AT", "Austria"], ["CH", "Switzerland"], ["FR", "France"], ["BE", "Belgium"], ["NL", "Netherlands"], ["LU", "Luxembourg"], ["ES", "Spain"], ["PT", "Portugal"], ["IT", "Italy"], ["SE", "Sweden"], ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["IS", "Iceland"], ["PL", "Poland"], ["CZ", "Czechia"], ["SK", "Slovakia"], ["HU", "Hungary"], ["RO", "Romania"], ["BG", "Bulgaria"], ["GR", "Greece"], ["HR", "Croatia"], ["SI", "Slovenia"], ["RS", "Serbia"], ["UA", "Ukraine"], ["LT", "Lithuania"], ["LV", "Latvia"], ["EE", "Estonia"], ["TR", "Turkey"], ["IL", "Israel"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["EG", "Egypt"], ["ZA", "South Africa"], ["IN", "India"], ["JP", "Japan"], ["KR", "South Korea"], ["SG", "Singapore"], ["HK", "Hong Kong"], ["TW", "Taiwan"], ["TH", "Thailand"], ["PH", "Philippines"], ["ID", "Indonesia"], ["MX", "Mexico"], ["BR", "Brazil"], ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"]];
// Always listed (exact name, lowercase) regardless of TMDB display priority, which can bury them in some regions.
const PINNED = new Set(["disney plus", "disney+", "hotstar", "yes", "yes tv", "hot", "hot vod", "hot tv", "cellcom tv", "partner tv", "sting tv", "sting tv amazon channel", "keshet 12", "mako", "reshet 13", "kan 11", "kan", "next tv", "bezeq", "oh", "walla", "freetv"]);
// Services TMDB has no data for; label-only (negative ids never match TMDB availability).
const MANUAL_IL: [number, string][] = [[-1, "Yes+"], [-2, "Kan 11 (כאן 11)"], [-3, "Keshet 12"], [-4, "Reshet 13"], [-5, "HOT"], [-6, "Cellcom tv"], [-7, "Partner TV"], [-8, "Sting TV"], [-9, "Disney+"], [-10, "Freetv"]];
interface Svc { id: number; name: string; pri: number; ids: number[] }
const norm = (n: string) => n.toLowerCase().replace(/\bplus\b/g, "+").replace(/[^a-z0-9+]/g, "");

export default function ProfileForm({ initial }: { initial: Profile }) {
  const [country, setCountry] = useState(initial.country);
  const [services, setServices] = useState<number[]>(initial.services);
  const [names, setNames] = useState<Record<string, string>>(initial.serviceNames);
  const [list, setList] = useState<Svc[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [prio, setPrio] = useState<Priority>("someday");
  useEffect(() => { try { if (localStorage.getItem(PRIO_KEY) === "must") setPrio("must"); } catch { /* storage unavailable */ } }, []);
  function pickPrio(p: Priority) { setPrio(p); try { localStorage.setItem(PRIO_KEY, p); } catch { /* storage unavailable */ } }

  useEffect(() => {
    let live = true; setList(null); setError("");
    fetch(`/api/providers?cc=${country}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); if (live) setList(j.providers); })
      .catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [country]);

  function persist(c: string, s: number[], n: Record<string, string>) { start(async () => { await saveProfile({ country: c, services: s, serviceNames: n }); }); }
  function pickCountry(c: string) { setCountry(c); persist(c, services, names); }
  function toggle(p: Svc) {
    const on = p.ids.some((i) => services.includes(i));
    const s = on ? services.filter((x) => !p.ids.includes(x)) : [...services, ...p.ids];
    const n = { ...names }; p.ids.forEach((i) => { n[i] = p.name; });
    setServices(s); setNames(n); persist(country, s, n);
  }

  const term = q.trim().toLowerCase();
  // Merge providers that differ only in spelling (e.g. "Disney+" and "Disney Plus") into one chip covering all their ids.
  const merged = (() => {
    const m = new Map<string, Svc>();
    for (const p of list ?? []) {
      const k = norm(p.name), o = m.get(k);
      if (!o) m.set(k, { ...p, ids: [p.id] });
      else { o.ids.push(p.id); if (p.pri < o.pri) { o.pri = p.pri; o.name = p.name; } }
    }
    return [...m.values()];
  })();
  const extra: Svc[] = [
    ...(country === "IL" ? MANUAL_IL : []).filter(([, n]) => !merged.some((m) => norm(m.name) === norm(n))).map(([id, name]) => ({ id, name, pri: 1000, ids: [id] })),
    ...services.filter((i) => i < 0 && !MANUAL_IL.some(([x]) => x === i)).map((id) => ({ id, name: names[id] ?? "Custom", pri: 1000, ids: [id] })),
  ];
  function addCustom(text: string) {
    const v = text.trim(); if (!v) return;
    const id = -(1000 + Math.abs([...v].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 1e6);
    toggle({ id, name: v, pri: 1000, ids: [id] }); setQ("");
  }
  const show = [...merged, ...extra].filter((p) => (term ? p.name.toLowerCase().includes(term) : p.ids.some((i) => services.includes(i)) || p.pri < 25 || PINNED.has(p.name.toLowerCase()))).sort((a, b) => Number(b.ids.some((i) => services.includes(i))) - Number(a.ids.some((i) => services.includes(i))) || a.pri - b.pri).slice(0, 80);
  const chosen = services.map((i) => names[i]).filter(Boolean);
  const summary = chosen.length ? chosen.slice(0, 2).join(", ") + (chosen.length > 2 ? ` +${chosen.length - 2}` : "") : "None";
  return (
    <div className="card set" aria-busy={pending}>
      <div className="srow">
        <label htmlFor="cc">Country</label>
        <select id="cc" value={country} onChange={(e) => pickCountry(e.target.value)}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
      </div>
      <div className="srow stack">
        <span id="dp">Default for “To watch”</span>
        <div className="seg" role="group" aria-labelledby="dp">
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <button key={p} type="button" aria-pressed={prio === p} onClick={() => pickPrio(p)}>{PRIORITY_LABEL[p]}</button>)}
        </div>
      </div>
      <SettingRow label="Your services" value={summary}>
        <input id="svq" type="search" aria-label="Search or add a service" placeholder="Search or add a service" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && show.length === 0 && addCustom(q)} style={{ width: "100%", marginBottom: 8 }} />
        <div className="chips">
          {error ? <span className="err small">{error}</span> : list === null ? <span className="small muted"><span className="spin" />Loading</span>
            : <>
              {show.map((p) => <button key={p.ids[0]} type="button" className="chip" aria-pressed={p.ids.some((i) => services.includes(i))} onClick={() => toggle(p)}>{p.name}</button>)}
              {term && !show.some((p) => p.name.toLowerCase() === term) && <button type="button" className="chip" onClick={() => addCustom(q)}>+ Add “{q.trim()}”</button>}
            </>}
        </div>
        {pending && <p className="small muted" style={{ margin: "8px 0 0" }}>Saving…</p>}
      </SettingRow>
    </div>
  );
}
