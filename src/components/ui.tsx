import Link from "next/link";
import { img, typeLabel, href } from "@/lib/img";
import { STATUS_LABEL, type Item, type LibItem } from "@/lib/types";

export function Pill({ lib }: { lib?: LibItem | null }) {
  return lib ? <span className={`pill ${lib.status}`}>{STATUS_LABEL[lib.status]}</span> : null;
}

export function Thumb({ path, w = 92 }: { path: string | null; w?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return path ? <img className="thumb" src={img(path, `w${w}`)} alt="" loading="lazy" /> : <span className="thumb" />;
}

export function Avatar({ photo, name }: { photo: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return photo ? <img className="avatar" src={img(photo, "w185")} alt="" loading="lazy" /> : <span className="avatar">{name.charAt(0)}</span>;
}

export function TitleRow({ it, lib, sub, small }: { it: Item; lib?: LibItem | null; sub?: string; small?: boolean }) {
  return (
    <Link className="row" href={href(it.key)}>
      <Thumb path={it.poster} />
      <span className="row-main">
        <span className="row-title" style={small ? { fontSize: 17 } : undefined}>{it.title}</span>
        <span className="row-sub">{it.year} · {typeLabel(it.type)}{sub ? ` · ${sub}` : ""}</span>
      </span>
      <Pill lib={lib} />
    </Link>
  );
}

export function PosterStrip({ items, sub }: { items: (Item & { sub?: string })[]; sub?: (i: Item) => string }) {
  return (
    <div className="strip">
      {items.map((t) => (
        <Link key={t.key} className="tile" href={href(t.key)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {t.poster ? <img src={img(t.poster, "w342")} alt="" loading="lazy" /> : <div className="ph" />}
          <span className="row-title">{t.title}</span>
          <span className="row-sub mono">{sub ? sub(t) : `${t.year} · ${typeLabel(t.type)}`}</span>
        </Link>
      ))}
    </div>
  );
}
