import { AwardPills, type Pill } from "@/components/AwardPills";
import { awardName, getAwards, hasAwards, type AwardEntry, type AwardGroup, type Awards } from "@/lib/awards";
import type { Title } from "@/lib/types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Trophy() {
  return (
    <svg className="aw-i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8" />
    </svg>
  );
}

function pills(a: Awards): Pill[] {
  const out: Pill[] = [];
  const lead = a.oscars.won + a.oscars.nominated > 0 ? { n: a.oscars, name: "Oscar", fam: "Academy Award" }
    : a.emmys.won + a.emmys.nominated > 0 ? { n: a.emmys, name: "Emmy", fam: "Primetime Emmy Award" } : null;
  const g = lead && a.groups.find((x) => x.name === lead.fam);
  if (lead && g) {
    const { n, name } = lead;
    // One pill per body; the nominations sit inside the wins' popover instead of taking a second pill.
    const sections = [
      ...(n.won ? [{ name: awardName(g.name), entries: g.won, won: true }] : []),
      ...(n.nominated ? [{ name: `${awardName(g.name)}, nominated`, entries: g.nominated, won: false }] : []),
    ];
    out.push({ text: n.won ? plural(n.won, name) : plural(n.nominated, `${name} nomination`), win: n.won > 0, sections });
  }
  const others = a.groups.filter((x) => x.name !== lead?.fam && x.won.length);
  const other = others.reduce((s, x) => s + x.won.length, 0);
  if (other) out.push({ text: plural(other, "other win"), win: false, sections: others.map((x) => ({ name: awardName(x.name), entries: x.won, won: true })) });
  return out;
}

/** Compact one-line summary for the title header; each pill opens a popover with what it counts. Renders nothing when there is nothing to say. */
export async function AwardChips({ t }: { t: Title }) {
  const a = await getAwards(t.imdbId);
  if (!hasAwards(a)) return null;
  const list = pills(a);
  return list.length ? <AwardPills pills={list} icon={<Trophy />} /> : null;
}

function Entries({ list, won }: { list: AwardEntry[]; won: boolean }) {
  if (!list.length) return null;
  return (
    <ul className="aw-list">
      {list.map((e, i) => (
        <li key={i} className={won ? "win" : ""}>
          <span className="aw-k">{won ? "Won" : "Nominated"}</span>
          <span className="aw-c">{e.category || "Top prize"}</span>
          {e.year && <span className="aw-y">{e.year}</span>}
        </li>
      ))}
    </ul>
  );
}

function Group({ g, open }: { g: AwardGroup; open: boolean }) {
  return (
    <details className="cw aw-g" open={open} data-aw={g.name}>
      <summary>{awardName(g.name)}<span className="cw-n">{g.won.length ? `${g.won.length} won` : `${g.nominated.length} nominated`}</span></summary>
      <Entries list={g.won} won />
      <Entries list={g.nominated} won={false} />
    </details>
  );
}

const FEATURED = ["Academy Award", "Primetime Emmy Award"];
const SHOWN = 4;

/** The headline body (Oscars, else Emmys): its wins in plain view (first few), everything else about it behind one "more" fold. */
function Featured({ g }: { g: AwardGroup }) {
  const wins = g.won.slice(0, SHOWN), restWon = g.won.slice(SHOWN);
  const hidden = restWon.length + g.nominated.length;
  const parts = [restWon.length ? plural(restWon.length, "more win") : "", g.nominated.length ? plural(g.nominated.length, "nomination") : ""].filter(Boolean).join(" · ");
  return (
    <div className="aw-feat" data-aw={g.name}>
      <div className="aw-fh">{awardName(g.name)}<span className="cw-n">{g.won.length ? `${g.won.length} won` : `${g.nominated.length} nominated`}</span></div>
      <Entries list={wins} won />
      {hidden > 0 && (
        <details className="aw-more">
          <summary>{parts}</summary>
          <Entries list={restWon} won />
          <Entries list={g.nominated} won={false} />
        </details>
      )}
    </div>
  );
}

/** The full list. Only the headline body's wins show by default; every other award body sits in one folded "Other awards". */
export async function AwardsSection({ t }: { t: Title }) {
  const a = await getAwards(t.imdbId);
  if (!hasAwards(a)) return null;
  const feat = a.groups.find((g) => g.name === FEATURED[0]) ?? a.groups.find((g) => g.name === FEATURED[1]);
  const rest = a.groups.filter((g) => g !== feat);
  const wins = rest.reduce((n, g) => n + g.won.length, 0);
  return (
    <div data-aw-section>
      <h2>Awards</h2>
      <div className="card pad">
        {feat && <Featured g={feat} />}
        {rest.length > 0 && (
          <details className="cw aw-other">
            <summary>{feat ? "Other awards" : "Awards"}<span className="cw-n">{wins ? `${wins} won` : `${rest.reduce((n, g) => n + g.nominated.length, 0)} nominated`}</span></summary>
            {rest.map((g) => <Group key={g.name} g={g} open={false} />)}
          </details>
        )}
        <p className="muted small" style={{ margin: "10px 0 0" }}>From Wikidata, so older or smaller awards may be missing.</p>
      </div>
    </div>
  );
}
