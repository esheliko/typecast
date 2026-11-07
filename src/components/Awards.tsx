import { AwardChip } from "@/components/AwardChip";
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

/** The few chips worth showing at a glance. Oscars lead; series fall back to Emmys; anything else is one "other wins" count. */
type Chip = { text: string; win: boolean; tip: string; groups: string[] };
function chips(a: Awards): Chip[] {
  const out: Chip[] = [];
  const lead = a.oscars.won + a.oscars.nominated > 0 ? { n: a.oscars, name: "Oscar", fam: "Academy Award" }
    : a.emmys.won + a.emmys.nominated > 0 ? { n: a.emmys, name: "Emmy", fam: "Primetime Emmy Award" } : null;
  if (lead) {
    const { n, name } = lead;
    if (n.won) out.push({ text: plural(n.won, name), win: true, tip: `Won ${plural(n.won, name)}${n.nominated ? `, plus ${plural(n.nominated, "more nomination")}` : ""}`, groups: [lead.fam] });
    if (n.nominated) out.push({ text: n.won ? `+${n.nominated} nominated` : plural(n.nominated, `${name} nomination`), win: false, tip: plural(n.nominated, `${name} nomination`), groups: [lead.fam] });
  }
  const others = a.groups.filter((g) => g.name !== lead?.fam && g.won.length);
  const other = others.reduce((s, g) => s + g.won.length, 0);
  if (other) out.push({ text: plural(other, "other win"), win: false, tip: "Wins at other award bodies", groups: others.map((g) => g.name) });
  return out;
}

/** Compact one-line summary for the title header. Renders nothing when there is nothing to say. */
export async function AwardChips({ t }: { t: Title }) {
  const a = await getAwards(t.imdbId);
  if (!hasAwards(a)) return null;
  const list = chips(a);
  if (!list.length) return null;
  return (
    <div className="aw-chips" aria-label="Awards">
      {list.map((c) => <AwardChip key={c.text} groups={c.groups} win={c.win} tip={c.tip}>{c.win && <Trophy />}{c.text}</AwardChip>)}
    </div>
  );
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

/** The full list, grouped by award body. Only the Oscars start open; everything else is folded away. */
export async function AwardsSection({ t }: { t: Title }) {
  const a = await getAwards(t.imdbId);
  if (!hasAwards(a)) return null;
  return (
    <div data-aw-section>
      <h2>Awards</h2>
      <div className="card pad">
        {a.groups.map((g) => <Group key={g.name} g={g} open={g.name === "Academy Award"} />)}
        <p className="muted small" style={{ margin: "10px 0 0" }}>From Wikidata, so older or smaller awards may be missing.</p>
      </div>
    </div>
  );
}
