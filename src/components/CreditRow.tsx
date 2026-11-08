import Link from "next/link";
import MarkRow from "./cast/MarkRow";
import { SeenLine } from "./cast/CreditList";
import { Avatar } from "./ui";
import { GlimpseButton } from "./Glimpse";
import { castSpec, personSpec } from "@/lib/glimpse";
import type { CastMember, EnrichedMember } from "@/lib/types";

/** One cast line. Tap to open their best-known credits (a native <details>, so it needs no JavaScript). */
/** `pending` means their other credits are still being looked up, so an empty list is not the final answer. */
export function CreditRow({ c, title, pending }: { c: EnrichedMember; libKeys?: Record<string, string>; title?: { title: string; year?: string | number; type: string }; pending?: boolean }) {
  return (
    <li className="credit has-gl" data-q={`${c.name} ${c.role}`.toLowerCase()}>
      <span className="credit-gl"><GlimpseButton spec={castSpec(c.name, c.role, title)} label={title && c.role ? `See ${c.name} as ${c.role}` : `See images of ${c.name}`} /></span>
      <details>
        <summary className="credit-main">
          <Avatar photo={c.photo} name={c.name} />
          <span className="credit-line"><span className="nm">{c.name}</span><span className="dots" /><span className="role">{c.role}</span></span>
        </summary>
        <div className="more">
          <div className="more-top"><Link className="btn sm" href={`/person/${c.id}`}>Full profile →</Link></div>
          {c.top.length === 0 && <span className="muted small">{pending ? "Finding their other credits…" : "No other credits found."}</span>}
          {c.top.map((k) => <MarkRow key={k.key} it={k} sub={k.role} actor={c.name} small />)}
        </div>
      </details>
      <div className="marks">
        <SeenLine hits={c.hits} />
        {c.also.length > 0 && <div className="also">Also in: {c.also.join(", ")}</div>}
      </div>
    </li>
  );
}

/** One crew line (composer, cinematographer…): a link to their page with the job on the right. */
export function CrewRow({ c }: { c: CastMember }) {
  return (
    <li className="credit has-gl">
      <span className="credit-gl"><GlimpseButton spec={personSpec(c.name, c.role)} label={`See images of ${c.name}`} /></span>
      <Link className="credit-main" href={`/person/${c.id}`}>
        <Avatar photo={c.photo} name={c.name} />
        <span className="credit-line"><span className="nm">{c.name}</span><span className="dots" /><span className="role">{c.role}</span></span>
      </Link>
    </li>
  );
}
