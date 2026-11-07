import { TitleLink } from "./Modal";
import QuickMark from "./cast/QuickMark";
import RelatedButton from "./cast/RelatedButton";
import { img, typeLabel } from "@/lib/img";
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
    <div className="row">
      <TitleLink className="row-link" k={it.key}>
        <Thumb path={it.poster} />
        <span className="row-main">
          <span className="row-title" style={small ? { fontSize: 17 } : undefined}>{it.title}</span>
          <span className="row-sub">{it.year} · {typeLabel(it.type)}{sub ? ` · ${sub}` : ""}</span>
        </span>
        <Pill lib={lib} />
      </TitleLink>
      <QuickMark it={it} variant="inline" />
      <RelatedButton it={it} />
    </div>
  );
}
