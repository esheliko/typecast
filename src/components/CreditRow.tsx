import Link from "next/link";
import { href, typeLabel } from "@/lib/img";
import { Avatar, Thumb } from "./ui";
import type { CastMember, EnrichedMember } from "@/lib/types";

/** One cast line. Tap to open their best-known credits (a native <details>, so it needs no JavaScript). */
export function CreditRow({ c, libKeys }: { c: EnrichedMember; libKeys: Record<string, string> }) {
  return (
    <li className="credit" data-q={`${c.name} ${c.role}`.toLowerCase()}>
      <details>
        <summary className="credit-main">
          <Avatar photo={c.photo} name={c.name} />
          <span className="credit-line"><span className="nm">{c.name}</span><span className="dots" /><span className="role">{c.role}</span></span>
        </summary>
        <div className="more">
          {c.top.length === 0 && <span className="muted small">No other credits found.</span>}
          {c.top.map((k) => (
            <Link key={k.key} className="row" href={href(k.key)}>
              <Thumb path={k.poster} w={92} />
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 16 }}>{k.title}</span>
                <span className="row-sub">{k.year} · {typeLabel(k.type)}{k.role ? ` · ${k.role}` : ""}</span>
              </span>
              {libKeys[k.key] && <span className={`pill ${libKeys[k.key]}`}>{libKeys[k.key] === "watchlist" ? "To watch" : libKeys[k.key]}</span>}
            </Link>
          ))}
          <Link className="btn sm" href={`/person/${c.id}`} style={{ marginTop: 8 }}>Full profile</Link>
        </div>
      </details>
      <div className="marks">
        {c.hits.length > 0 && <div className="seen">You know them from: {c.hits.slice(0, 4).map((h) => (h.year ? `${h.title} (${h.year})` : h.title)).join(", ")}</div>}
        {c.also.length > 0 && <div className="also">Also in: {c.also.join(", ")}</div>}
      </div>
    </li>
  );
}

/** One crew line (composer, cinematographer…): a link to their page with the job on the right. */
export function CrewRow({ c }: { c: CastMember }) {
  return (
    <li className="credit">
      <Link className="credit-main" href={`/person/${c.id}`}>
        <Avatar photo={c.photo} name={c.name} />
        <span className="credit-line"><span className="nm">{c.name}</span><span className="dots" /><span className="role">{c.role}</span></span>
      </Link>
    </li>
  );
}
