import Link from "next/link";
import { TitleLink } from "./Modal";
import type { Counted } from "@/lib/stats";
import type { LibItem } from "@/lib/types";

/** Server-safe building blocks for the stats page: CSS bars where every bar also says its number. */

export function BarList({ rows, unit = "", empty = "Nothing yet." }: { rows: Counted[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.some((r) => r.n > 0)) return <p className="muted small" style={{ margin: 0 }}>{empty}</p>;
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-l">{r.label}</span>
          <span className="bar-t" aria-hidden="true"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b className="bar-v">{r.n}{unit}</b>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ value, label, note }: { value: React.ReactNode; label: string; note?: React.ReactNode }) {
  return <div className="stat"><b>{value}</b><span>{label}</span>{note && <small>{note}</small>}</div>;
}

export function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card stat-card" aria-label={title}><h3>{title}</h3>{children}</section>;
}

export function YearPicker({ years, current }: { years: number[]; current: number | "all" }) {
  const opts: [string, number | "all"][] = [...years.map((y) => [String(y), y] as [string, number]), ["All time", "all"]];
  return (
    <nav className="chips" aria-label="Year">
      {opts.map(([label, v]) => (
        <Link key={label} className="chip" href={v === "all" ? "/library/stats" : `/library/stats?y=${v}`} replace
          aria-current={v === current ? "true" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

export function Extreme({ label, it }: { label: string; it: LibItem | null }) {
  if (!it) return null;
  return <p className="small" style={{ margin: "4px 0" }}><span className="muted">{label}: </span><TitleLink k={it.key} it={it}><b>{it.title}</b></TitleLink> <span className="muted">({it.year})</span></p>;
}

export function PeopleList({ people, empty }: { people: { id: number; name: string; n: number; sub?: string }[]; empty: string }) {
  if (!people.length) return <p className="muted small" style={{ margin: 0 }}>{empty}</p>;
  return (
    <ul className="plain-list">
      {people.map((p) => (
        <li key={p.id}><Link href={`/person/${p.id}`}>{p.name}</Link> <span className="muted small">{p.n} {p.sub ?? "titles"}</span></li>
      ))}
    </ul>
  );
}
