import { TitleLink } from "./Modal";
import QuickMark from "./cast/QuickMark";
import LivePill from "./cast/LivePill";
import RelatedButton from "./cast/RelatedButton";
import { GlimpseButton } from "./Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { avgLabel, img, typeLabel } from "@/lib/img";
import { markLabel, type Item, type LibItem } from "@/lib/types";

export function Pill({ lib }: { lib?: LibItem | null }) {
  return lib ? <span className={`pill ${lib.status === "watchlist" && lib.priority === "must" ? "must" : lib.status}`}>{markLabel(lib.status, lib.priority)}</span> : null;
}

export function Thumb({ path, w = 92 }: { path: string | null; w?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return path ? <img className="thumb" src={img(path, `w${w}`)} alt="" loading="lazy" decoding="async" /> : <span className="thumb" />;
}

export function Avatar({ photo, name }: { photo: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return photo ? <img className="avatar" src={img(photo, "w185")} alt="" loading="lazy" decoding="async" /> : <span className="avatar">{name.charAt(0)}</span>;
}

export function TitleRow({ it, sub, small }: { it: Item; sub?: string; small?: boolean }) {
  return (
    <div className="row mark-row">
      <TitleLink className="row-link" k={it.key} it={it}>
        <Thumb path={it.poster} />
        <span className="row-main">
          <span className="row-title" style={small ? { fontSize: 17 } : undefined}>{it.title}</span>
          <span className="row-sub">{it.year} · {typeLabel(it.type)}{avgLabel(it)}{sub ? ` · ${sub}` : ""}</span>
        </span>
        <LivePill k={it.key} />
      </TitleLink>
      <QuickMark it={it} variant="inline" />
      <GlimpseButton spec={titleSpec(it)} />
      <RelatedButton it={it} />
    </div>
  );
}
