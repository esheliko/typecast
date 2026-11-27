"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TitleLink } from "./Modal";
import Collapse from "./Collapse";
import { readUi, saveUi } from "@/lib/ui-prefs";
import { img } from "@/lib/img";
import { setUpcomingBadges } from "@/lib/upcoming-badges";
import { countdown, dateLabel, groupUpcoming, isSoon, localDay, subLine, type UpEntry } from "@/lib/upcoming";

const SHOW = 8;

/**
 * Unreleased films and the next episodes of your series, grouped by date (see lib/upcoming.ts). Collapsed until you open it
 * (remembered on this device) and absent when nothing is coming. Not filtered by the Library's Films / Series switch.
 * `today` comes from the server and is corrected to the device's own day after mount, so "tomorrow" is right in any time zone.
 */
export default function Upcoming({ entries: all, picks = [], today: serverToday, open: initialOpen }: { entries: UpEntry[]; picks?: (UpEntry & { why: string })[]; today: string; open: boolean }) {
  const entries = all;
  const [open, setOpen] = useState(initialOpen);
  // Only one of Watch next / Upcoming is open at a time: opening the other closes this one.
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail !== "upcoming") { saveUi({ upOpen: false }); setOpen(false); } };
    window.addEventListener("lib-panel-open", on);
    return () => window.removeEventListener("lib-panel-open", on);
  }, []);
  const [all_, setAll] = useState(false);
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    setToday(localDay());
    setOpen(readUi().upOpen); // a cached render of this page may carry an older choice
  }, []);
  // Library rows show a small "Out Fri" / "S5 in 12 days" badge from the same data (all kinds, whatever the switch shows).
  useEffect(() => { setUpcomingBadges(all); return () => setUpcomingBadges([]); }, [all]);
  const live = entries.filter((e) => e.date >= today);
  // "You may like": unreleased titles not in the library that fit your taste (lib/upcoming-picks.ts). Not counted in the header number.
  const liked = picks.filter((e) => e.date > today);
  if (!live.length && !liked.length) return null;
  const peek = live[0] ?? liked[0];
  const toggle = () => { saveUi({ upOpen: !open }); setOpen(!open); if (!open) window.dispatchEvent(new CustomEvent("lib-panel-open", { detail: "upcoming" })); };
  const shown = all_ ? live : live.slice(0, SHOW);
  return (
    <section className="upnext upcoming" aria-label="Upcoming">
      <div className="upnext-bar">
        <button type="button" className="upnext-h" aria-expanded={open} aria-label={`Upcoming, ${live.length}. ${open ? "Hide" : "Show"}`} onClick={toggle}>
          <span className="upnext-k">Upcoming</span>
          {live.length > 0 && <span className="mono upnext-n">{live.length}</span>}
          {!open && <span className="upnext-peek">{peek.title} · {countdown(peek, today)}</span>}
          <span className="upnext-caret" aria-hidden="true">›</span>
        </button>
      </div>
      <Collapse open={open}>
        <>
          {groupUpcoming(shown, today).map((g) => (
            <div key={g.label}>
              <div className="up-grp mono">{g.label}</div>
              <ul className="rows card up-rows">
                {g.entries.map((e) => <Row key={e.key} e={e} today={today} />)}
              </ul>
            </div>
          ))}
          {!all_ && live.length > SHOW && <button type="button" className="upnext-restore up-more" onClick={() => setAll(true)}>Show all {live.length}</button>}
          {liked.length > 0 && (
            <div className="up-picks">
              <div className="up-grp mono">You may like <Link className="up-all" href="/?list=upcoming">See all</Link></div>
              <ul className="rows card up-rows">{liked.map((e) => <Row key={e.key} e={e} today={today} why={e.why} />)}</ul>
            </div>
          )}
        </>
      </Collapse>
    </section>
  );
}

function Row({ e, today, why }: { e: UpEntry; today: string; why?: string }) {
  return (
    <li>
      <TitleLink className="row up-row" k={e.key} it={e}>
        {e.poster
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="thumb" src={img(e.poster, "w92")} alt="" loading="lazy" decoding="async" />
          : <span className="thumb" />}
        <span className="row-main">
          <span className="row-title" title={e.title}>{e.title}</span>
          <span className="row-sub">{why ? <>{e.kind === "film" ? "Film" : "New series"} · {why}</> : subLine(e)}{e.svc && <span className="up-svc">{e.svc}</span>}</span>
        </span>
        <span className="up-when">
          <span className="mono up-date">{dateLabel(e, today)}</span>
          <span className={`pill${isSoon(e, today) ? " must" : ""}`}>{countdown(e, today)}</span>
        </span>
      </TitleLink>
    </li>
  );
}

/** A slim placeholder while the dates load. Only shown when the library holds something that may turn up. */
export function UpcomingSkeleton({ open }: { open: boolean }) {
  return (
    <section className="upnext upcoming" aria-hidden="true">
      <div className="upnext-bar"><span className="upnext-h"><span className="upnext-k">Upcoming</span></span></div>
      {open && <div className="up-sk-wrap"><div className="sk-b up-sk" /></div>}
    </section>
  );
}
