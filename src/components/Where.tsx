import { img } from "@/lib/img";
import type { Profile, Provider, Title } from "@/lib/types";
import { whereVerdict } from "@/lib/where";

function regionName(cc: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc; } catch { return cc; }
}

function Logo({ x }: { x: Provider }) {
  return x.logo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={img(x.logo, "w92")} alt={x.name} title={x.name} />
    : <span className="pill">{x.name}</span>;
}

/**
 * Where to watch. The data is JustWatch's, through TMDB, and it has gaps: a country with no entry is "we don't know",
 * never "not available". When the user's country has nothing we say where it streams elsewhere and that we can't tell for theirs.
 */
export function Where({ t, profile }: { t: Title; profile: Profile }) {
  const cc = profile.country;
  const country = regionName(cc);
  const mine = new Set(profile.services);
  const v = whereVerdict(t.prov, cc);
  const p = t.prov[cc];
  const src = <span className="muted" title="Streaming data comes from JustWatch via TMDB. It can be incomplete or out of date.">via JustWatch</span>;

  if (v.kind === "here") {
    const hit = [...new Set(v.stream.filter((x) => mine.has(x.id)).map((x) => x.name))];
    const logos = [...v.stream].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)));
    // With no services picked in Settings there is no "yours" and "others": just say where it streams, without the red.
    const label = hit.length ? "On your services" : mine.size ? "Other services" : "Streaming on";
    const extra = [p?.rent?.length ? "Rent" : "", p?.buy?.length ? "Buy" : ""].filter(Boolean).join(" · ");
    return (
      <div className={`sh-where ${hit.length ? "ok" : !mine.size ? "any" : "no"}`}>
        <b>{label}</b>
        {logos.map((x) => <Logo key={x.id} x={x} />)}
        {extra && <span className="muted">+ {extra}</span>}
        {p?.link ? <a href={p.link} target="_blank" rel="noopener noreferrer">All options in {country}</a> : <span className="muted">in {country}</span>}
        {src}
      </div>
    );
  }

  if (v.kind === "paid") {
    return (
      <div className="sh-where no">
        <b>Rent or buy only</b>
        <span className="muted">No streaming service listed in {country}.</span>
        {p?.link && <a href={p.link} target="_blank" rel="noopener noreferrer">All options in {country}</a>}
        {src}
      </div>
    );
  }

  if (v.kind === "elsewhere") {
    const names = v.countries.slice(0, 3).map(regionName);
    const more = v.countries.length - names.length;
    return (
      <div className="sh-where any">
        <b>Not listed in {country}</b>
        {v.services.map((x) => <Logo key={x.id} x={x} />)}
        <span className="muted">
          Streams on {v.services.map((x) => x.name).join(", ")} in {names.join(", ")}{more > 0 ? ` and ${more} more` : ""}.
          We don&apos;t have data for {country}, so we can&apos;t tell whether it&apos;s available there.
        </span>
        {src}
      </div>
    );
  }

  return (
    <div className="sh-where any">
      <b>No streaming data</b>
      <span className="muted">No streaming service is listed for this title in any country. That may mean it isn&apos;t streaming, or that the data is missing.</span>
      {src}
    </div>
  );
}
