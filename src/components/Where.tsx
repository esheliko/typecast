import { img } from "@/lib/img";
import type { Profile, Provider, Title } from "@/lib/types";

const GROUPS = [["flatrate", "Stream"], ["free", "Free"], ["ads", "With ads"], ["rent", "Rent"], ["buy", "Buy"]] as const;

export function Where({ t, profile }: { t: Title; profile: Profile }) {
  const cc = profile.country;
  const p = t.prov[cc];
  let country = cc;
  try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc; } catch { /* keep code */ }
  const mine = new Set(profile.services);
  const stream: Provider[] = [...(p?.flatrate ?? []), ...(p?.free ?? []), ...(p?.ads ?? [])];
  const hit = [...new Set(stream.filter((x) => mine.has(x.id)).map((x) => x.name))];
  return (
    <section>
      <h2>Where to watch <span className="mono" style={{ textTransform: "none", letterSpacing: 0 }}>{country}</span></h2>
      {hit.length > 0 ? <div className="banner ok"><b>On your services</b>{hit.join(", ")}</div>
        : stream.length > 0 ? <div className="banner no"><b>Not on your services</b>{mine.size ? "Available on other services, or rent and buy below." : "Pick your services in Setup to see a match."}</div>
        : p && (p.rent || p.buy) ? <div className="banner no"><b>Rent or buy only</b>It is not on a subscription service in {country}.</div>
        : <div className="banner no"><b>Not available</b>No listing for {country}. You will need another way to watch.</div>}
      {p && GROUPS.map(([k, label]) => p[k]?.length ? (
        <div className="prov" key={k}>
          <span className="g">{label}</span>
          {p[k]!.map((x) => x.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img key={x.id} src={img(x.logo, "w92")} alt={x.name} title={x.name} loading="lazy" />
            : <span key={x.id} className="pill">{x.name}</span>)}
        </div>
      ) : null)}
      {p?.link && <p className="small muted" style={{ margin: "12px 0 0" }}>Data from JustWatch. <a href={p.link} target="_blank" rel="noopener noreferrer">See all options</a></p>}
    </section>
  );
}
