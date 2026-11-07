import { img } from "@/lib/img";
import type { Profile, Provider, Title } from "@/lib/types";

export function Where({ t, profile }: { t: Title; profile: Profile }) {
  const cc = profile.country;
  const p = t.prov[cc];
  let country = cc;
  try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc; } catch { /* keep code */ }
  const mine = new Set(profile.services);
  const stream: Provider[] = [...(p?.flatrate ?? []), ...(p?.free ?? []), ...(p?.ads ?? [])];
  const hit = [...new Set(stream.filter((x) => mine.has(x.id)).map((x) => x.name))];
  const logos = stream.filter((x, i) => stream.findIndex((y) => y.id === x.id) === i);
  const label = hit.length ? "On your services" : stream.length ? "Other services" : p && (p.rent || p.buy) ? "Rent or buy only" : "Not available";
  const extra = [p?.rent?.length ? "Rent" : "", p?.buy?.length ? "Buy" : ""].filter(Boolean).join(" · ");
  return (
    <div className={`sh-where ${hit.length ? "ok" : "no"}`}>
      <b>{label}</b>
      {logos.map((x) => x.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={x.id} src={img(x.logo, "w92")} alt={x.name} title={x.name} />
        : <span key={x.id} className="pill">{x.name}</span>)}
      {extra && logos.length > 0 && <span className="muted">+ {extra}</span>}
      <span className="mono muted">{country}</span>
      {p?.link && <a href={p.link} target="_blank" rel="noopener noreferrer">All options</a>}
    </div>
  );
}
