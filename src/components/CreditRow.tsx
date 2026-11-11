import { SeenLine, TopCredits } from "./cast/CreditList";
import { Avatar } from "./ui";
import { PersonLink, PersonProvider } from "./Modal";
import Appearances from "./Appearances";
import { epsLabel } from "@/lib/episodes";
import { GlimpseButton } from "./Glimpse";
import { castSpec, personSpec } from "@/lib/glimpse";
import type { CastMember, EnrichedMember } from "@/lib/types";

/** One cast line. Tap to open their best-known credits (a native <details>, so it needs no JavaScript). */
/** `pending` means their other credits are still being looked up, so an empty list is not the final answer. */
/** In a series (`tv`), the line shows how many episodes they were in, and the opened row lists which episodes and when. */
/** `light` rows (the long tail of a series cast, shown when searched) skip the other-credits lookup. */
export function CreditRow({ c, title, pending, tv, light, hidden }: {
  c: EnrichedMember; libKeys?: Record<string, string>; title?: { title: string; year?: string | number; type: string }; pending?: boolean;
  tv?: { id: number; episodes: number }; light?: boolean; hidden?: boolean;
}) {
  const eps = tv ? epsLabel(c.eps, tv.episodes) : "";
  return (
    <li className={`credit has-gl${light ? " extra" : ""}`} hidden={hidden} data-q={`${c.name} ${c.role}`.toLowerCase()}>
      <span className="credit-gl"><GlimpseButton spec={castSpec(c.name, c.role, title, undefined, c.id)} label={title && c.role ? `About ${c.name} as ${c.role}: the role and images` : undefined} /></span>
      <details>
        <summary className="credit-main">
          <Avatar photo={c.photo} name={c.name} />
          <span className="credit-line"><span className="nm">{c.name}</span><span className="dots" /><span className="role">{c.role}{eps && <span className="eps">{c.role ? " · " : ""}{eps}</span>}</span></span>
        </summary>
        <div className="more">
          <div className="more-top"><PersonLink className="btn sm" pid={c.id} it={c}>Full profile →</PersonLink></div>
          {tv && c.credits && c.credits.length > 0 && <Appearances tv={tv.id} credits={c.credits} eps={c.eps} />}
          {!light && c.top.length === 0 && <span className="muted small">{pending ? "Finding their other credits…" : "No other credits found."}</span>}
          {c.top.length > 0 && tv && <div className="apps-head" style={{ marginTop: 10 }}>Also known for</div>}
          <PersonProvider id={c.id}><TopCredits items={c.top} actor={c.name} actorId={c.id} /></PersonProvider>
        </div>
      </details>
      <div className="marks">
        <SeenLine hits={c.hits} />
        {c.also.length > 0 && <div className="also">Also in: {c.also.join(", ")}</div>}
      </div>
    </li>
  );
}

/** One crew line (composer, cinematographer…): a link to their page with the job on the right. `plain` drops the job when the section label already says it (Director · Director). */
export function CrewRow({ c, plain }: { c: CastMember; plain?: boolean }) {
  return (
    <li className="credit has-gl">
      <span className="credit-gl"><GlimpseButton spec={personSpec(c.name, c.role, c.id)} /></span>
      <PersonLink className="credit-main" pid={c.id} it={c}>
        <Avatar photo={c.photo} name={c.name} />
        <span className="credit-line"><span className="nm">{c.name}</span>{!plain && c.role && <><span className="dots" /><span className="role">{c.role}</span></>}</span>
      </PersonLink>
    </li>
  );
}
