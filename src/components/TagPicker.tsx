"use client";
import { useEffect, useRef, useState } from "react";
import type { Tag } from "@/lib/browse";

interface Opt { id: number; name: string; sub: string }

/** Type-ahead that collects a few people / studios / themes as removable chips. */
export default function TagPicker({ kind, label, placeholder, value, onChange }: {
  kind: "person" | "company" | "keyword"; label: string; placeholder: string; value: Tag[]; onChange: (t: Tag[]) => void;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setOpts([]); setBusy(false); return; }
    const mine = ++seq.current; setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?kind=${kind}&q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (mine === seq.current) setOpts(r.ok ? j.options : []);
      } catch { if (mine === seq.current) setOpts([]); }
      if (mine === seq.current) setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind]);

  const pick = (o: Opt) => { if (!value.some((v) => v.id === o.id)) onChange([...value, { id: o.id, name: o.name }]); setQ(""); setOpts([]); };
  const fresh = opts.filter((o) => !value.some((v) => v.id === o.id));

  return (
    <div className="picker">
      <label className="l">{label}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" enterKeyHint="search" style={{ width: "100%", marginTop: 4, textTransform: "none", letterSpacing: 0, fontFamily: "var(--body)", fontWeight: 400, fontSize: 16 }} />
      </label>
      {value.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {value.map((t) => (
            <button key={t.id} type="button" className="chip" aria-label={`Remove ${t.name}`} style={{ background: "var(--gold-fill)", color: "var(--on-gold)" }} onClick={() => onChange(value.filter((v) => v.id !== t.id))}>{t.name} ×</button>
          ))}
        </div>
      )}
      {busy && fresh.length === 0 && <p className="small muted" style={{ margin: "6px 0 0" }}><span className="spin" aria-hidden="true" />Searching…</p>}
      {fresh.length > 0 && (
        <ul className="suggest card">
          {fresh.map((o) => (
            <li key={o.id}><button type="button" onClick={() => pick(o)}>
              <span className="row-title" style={{ fontSize: 17 }}>{o.name}</span>
              {o.sub && <span className="row-sub">{o.sub}</span>}
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
