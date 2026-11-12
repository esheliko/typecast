"use client";
import { useContext, useEffect, useState } from "react";
import { TitleLink } from "./Modal";
import { saveUi } from "@/lib/ui-prefs";
import { img } from "@/lib/img";
import { ofKind } from "@/lib/kind";
import { KindContext } from "@/lib/kind-context";
import { setUpcomingBadges } from "@/lib/upcoming-badges";
import { countdown, dateLabel, groupUpcoming, isSoon, localDay, subLine, type UpEntry } from "@/lib/upcoming";

const SHOW = 8;

/**
 * Unreleased films and the next episodes of your series, grouped by date (see lib/upcoming.ts). Collapsed until you open it
 * (remembered on this device) and absent when nothing is coming. Follows the Library's Films / Series switch.
 * `today` comes from the server and is corrected to the device's own day after mount, so "tomorrow" is right in any time zone.
 */
export default function Upcoming({ entries: all, today: serverToday, open: initialOpen }: { entries: UpEntry[]; today: string; open: boolean }) {
  const entries = ofKind(all, useContext(KindContext));
  const [open, setOpen] = useState(initialOpen);
  const [all_, setAll] = useState(false);
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    setToday(localDay());
  }, []);
  // Library rows show a small "Out Fri" / "S5 in 12 days" badge from the same data (all kinds, whatever the switch shows).
  useEffect(() => { setUpcomingBadges(all); return () => setUpcomingBadges([]); }, [all]);
  const live = entries.filter((e) => e.date >= today);
  if (!live.length) return null;
  const toggle = () => { saveUi({ upOpen: !open }); setOpen(!open); };
  const shown = all_ ? live : live.slice(0, SHOW);
  return (
    <section className="upnext upcoming" aria-label="Upcoming">
      <div className="upnext-bar">
        <button type="button" className="upnext-h" aria-expanded={open} onClick={toggle}>
          <span className="upnext-k">Upcoming</span>
          <span className="mono upnext-n">{live.length}</span>
          <span className="upnext-caret" aria-hidden="true">{open ? "Hide" : "Show"}</span>
        </button>
      </div>
      {open && (
        <>
          {groupUpcoming(shown, today).map((g) => (
            <div key={g.label}>
              <div className="up-grp mono">{g.label}</div>
              <ul className="rows card up-rows">
                {g.entries.map((e) => (
                  <li key={e.key}>
                    <TitleLink className="row up-row" k={e.key} it={e}>
                      {e.poster
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img className="thumb" src={img(e.poster, "w92")} alt="" loading="lazy" decoding="async" />
                        : <span className="thumb" />}
                      <span className="row-main">
                        <span className="row-title">{e.title}</span>
                        <span className="row-sub">{subLine(e)}{e.svc && <span className="up-svc">{e.svc}</span>}</span>
                      </span>
                      <span className="up-when">
                        <span className="mono up-date">{dateLabel(e, today)}</span>
                        <span className={`pill${isSoon(e, today) ? " must" : ""}`}>{countdown(e, today)}</span>
                      </span>
                    </TitleLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!all_ && live.length > SHOW && <button type="button" className="upnext-restore up-more" onClick={() => setAll(true)}>Show all {live.length}</button>}
        </>
      )}
    </section>
  );
}

/** A slim placeholder while the dates load. Only shown when the library holds something that may turn up. */
export function UpcomingSkeleton() {
  return (
    <section className="upnext upcoming" aria-hidden="true">
      <div className="upnext-bar"><span className="upnext-h"><span className="upnext-k">Upcoming</span></span></div>
      <div className="sk-b up-sk" />
    </section>
  );
}
