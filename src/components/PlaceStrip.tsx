"use client";
import { useEffect, useState } from "react";
import { useLib } from "./cast/LibState";
import { PositionPicker } from "./who/PositionControl";
import { useSavedPlace } from "./who/useSavedPlace";
import { getJson } from "@/lib/who-client";
import { airsText, epTag, pct, placeCard, subLine } from "@/lib/place-strip";
import type { Item } from "@/lib/types";
import type { WhoEp } from "@/lib/who-data";

type Ep = { s: number; e: number };

/**
 * The place card at the top of a Watching series' popup (docs/features/place-card.md): where you are, one tap to mark it watched. The S/E headline comes from the
 * saved place alone and is on screen at once; the episode name, runtime and air date are fetched afterwards (only up to the shown episode) and fail soft.
 * It shows nothing unless the series is Watching in the library, so it appears the moment you start watching, with no reload.
 */
export default function PlaceStrip({ item, runtime, seasons, progress, status, latest, next, today }: {
  item: Item; runtime: number | null; seasons: { n: number; eps: number }[]; progress: Ep | null; status: string; today: string;
  latest: Ep | null; next: (Ep & { air: string }) | null;
}) {
  const lib = useLib();
  const m = lib.get(item.key);
  const watching = m?.status === "watching";
  const prog = m?.progress === undefined ? progress : m.progress;
  const { next: markNext, jump } = useSavedPlace(item, runtime, seasons, progress);
  const card = placeCard({ progress: prog, seasons, lastEp: latest, next, status });
  const place = card.kind === "done" ? null : card.place;
  const placeKey = place ? `${place.s}.${place.e}` : "";
  const [ep, setEp] = useState<{ key: string; v: WhoEp | null } | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!watching || !place) return;
    let live = true;
    getJson<{ episodes: WhoEp[] }>(`/api/who/season?tv=${item.id}&s=${place.s}&upto=${place.e}`)
      .then((r) => { if (live) setEp({ key: placeKey, v: r.episodes.find((x) => x.e === place.e) ?? null }); })
      .catch(() => { /* the S/E headline stands alone */ });
    return () => { live = false; };
  }, [watching, item.id, placeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBusy(""); }, [placeKey, card.kind]);

  if (!watching) return null;
  const e = ep && ep.key === placeKey ? ep.v : null;
  const ahead = !!e?.air && e.air > today; // TMDB's newest-aired episode can lag: the episode's own date has the last word
  const out = card.kind === "next" && !ahead;
  const air = card.kind === "unaired" ? card.air || e?.air || "" : card.kind === "next" && ahead ? e!.air : "";
  const done = card.kind === "done";
  const pos = place ?? (prog ?? { s: 1, e: 1 });
  const brief = { id: item.id, status, seasons: seasons.map((x) => ({ n: x.n, eps: x.eps, name: "", air: "" })) };
  const headline = place ? `${epTag(place)}${e?.name ? ` · ${e.name}` : ""}` : "All caught up";
  const sub = place
    ? out ? subLine(e?.runtime ?? runtime, card.watched, card.total) : (airsText(air, today) || "not aired yet")
    : done && !card.ended ? [airsText(card.air, today) ? `Next episode ${airsText(card.air, today).replace("airs ", "")}` : "No new episode scheduled yet", subLine(null, card.watched, card.total)].join(" · ") : subLine(null, card.watched, card.total);
  const label = card.kind === "next" || card.kind === "unaired" ? "Up next" : "Your place";
  const p = pct(card.watched, card.total);

  return (
    <section className="ps-card" aria-label="Your place in this series">
      <div className="ps-row">
        <div className="ps-text">
          <PositionPicker brief={brief} pos={{ s: pos.s, e: pos.e }} seasons={brief.seasons} onChange={(x) => { if (x.s != null && x.e != null) jump({ s: x.s, e: x.e }); }}
            strip={{ hideAfter: pos, children: <>{label} <span aria-hidden="true">▾</span></> }} />
          <b className="ps-head">{headline}</b>
          <span className="ps-sub">{sub}</span>
        </div>
        {out && place && (
          <button type="button" className="btn gold ps-btn" disabled={busy === placeKey} onClick={() => { setBusy(placeKey); markNext(place, null, { engage: false }); }} aria-label={`Mark ${epTag(place)} watched`}>Watched ✓</button>
        )}
        {done && card.ended && <button type="button" className="btn gold ps-btn" onClick={() => { void lib.mark(item, "watched"); }}>Mark series watched</button>}
      </div>
      <div className="ps-bar" role="progressbar" aria-label="Series watched" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}><i style={{ width: `${p}%` }} /></div>
    </section>
  );
}
