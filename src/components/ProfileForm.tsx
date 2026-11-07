"use client";
import { useEffect, useState, useTransition } from "react";
import { saveProfile } from "@/app/actions";
import type { Profile } from "@/lib/types";

const COUNTRIES: [string, string][] = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"], ["DE", "Germany"], ["AT", "Austria"], ["CH", "Switzerland"], ["FR", "France"], ["BE", "Belgium"], ["NL", "Netherlands"], ["LU", "Luxembourg"], ["ES", "Spain"], ["PT", "Portugal"], ["IT", "Italy"], ["SE", "Sweden"], ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["IS", "Iceland"], ["PL", "Poland"], ["CZ", "Czechia"], ["SK", "Slovakia"], ["HU", "Hungary"], ["RO", "Romania"], ["BG", "Bulgaria"], ["GR", "Greece"], ["HR", "Croatia"], ["SI", "Slovenia"], ["RS", "Serbia"], ["UA", "Ukraine"], ["LT", "Lithuania"], ["LV", "Latvia"], ["EE", "Estonia"], ["TR", "Turkey"], ["IL", "Israel"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["EG", "Egypt"], ["ZA", "South Africa"], ["IN", "India"], ["JP", "Japan"], ["KR", "South Korea"], ["SG", "Singapore"], ["HK", "Hong Kong"], ["TW", "Taiwan"], ["TH", "Thailand"], ["PH", "Philippines"], ["ID", "Indonesia"], ["MX", "Mexico"], ["BR", "Brazil"], ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"]];
// Always listed (exact name, lowercase) regardless of TMDB display priority, which can bury them in some regions.
const PINNED = new Set(["disney plus", "disney+", "hotstar", "yes", "yes tv", "hot", "hot vod", "hot tv", "cellcom tv", "partner tv", "sting tv", "sting tv amazon channel", "keshet 12", "mako", "reshet 13", "kan 11", "kan", "next tv", "bezeq", "oh", "walla"]);
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
  const show = merged.filter((p) => (term ? p.name.toLowerCase().includes(term) : p.ids.some((i) => services.includes(i)) || p.pri < 25 || PINNED.has(p.name.toLowerCase()))).sort((a, b) => a.pri - b.pri).slice(0, 80);
  return (
    <div className="card pad" aria-busy={pending}>
      <label className="l" htmlFor="cc">Country</label>
      <select id="cc" value={country} onChange={(e) => pickCountry(e.target.value)}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
      <div className="sp" />
      <label className="l" htmlFor="svq">Your streaming services</label>
      <input id="svq" type="search" placeholder="Filter services" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
      <div className="chips">
        {error ? <span className="err small">{error}</span> : list === null ? <span className="small muted"><span className="spin" />Loading services</span>
          : show.length === 0 ? <span className="small muted">No services match.</span>
          : show.map((p) => <button key={p.ids[0]} className="chip" aria-pressed={p.ids.some((i) => services.includes(i))} onClick={() => toggle(p)}>{p.name}</button>)}
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>{pending ? "Saving…" : "Changes save automatically."}</p>
    </div>
  );
}
