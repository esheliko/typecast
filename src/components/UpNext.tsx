"use client";
import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { saveUi, type UiPrefs } from "@/lib/ui-prefs";
import { TitleLink } from "./Modal";
import { img } from "@/lib/img";
import { newEpLabel } from "@/lib/new-episode";
import { bySource, onYourServices, SOURCES, type Pick, type Source } from "@/lib/upnext";
import { mixed, ofKind, type Kind } from "@/lib/kind";
import { KindSeg } from "./KindSeg";
import { KindContext } from "@/lib/kind-context";
import { useLib } from "./cast/LibState";

const SHOW = 16;
const SNOOZE_KEY = "typecast:upnext-snoozed";
const SNOOZE_MS = 30 * 24 * 3600 * 1000;

type Snoozed = Record<string, number>;
function loadSnoozed(now = Date.now()): Snoozed {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}");
    return Object.fromEntries(Object.entries(raw ?? {}).filter(([, until]) => typeof until === "number" && until > now)) as Snoozed;
  } catch { return {}; }
}
function saveSnoozed(s: Snoozed) { try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

/**
 * A swipeable strip of what to watch next, ranked on the server (see lib/upnext.ts). "Not now" hides a card on this device
 * for a month; the header can bring them back. Collapsible (remembered), so it never pushes the library down more than one slim row.
 */
/**
 * `services`: "yes" when the user picked streaming services and availability was looked up, "no" when they picked none
 * (the toggle is hidden), "pending" while the TMDB lookup is still streaming in, "failed" when it could not be done.
 */
export type ServicesState = "yes" | "no" | "pending" | "failed";

export default function UpNext({ picks: all, services, prefs }: { picks: Pick[]; services: ServicesState; prefs: UiPrefs }) {
  const base = ofKind(all, useContext(KindContext)); // follows the Library's Films / Series switch
  // Saved choices arrive from the server (cookie), so the first paint is already right: no open-then-close flash.
  const [kind, setKind] = useState<Kind>(prefs.unKind); // the strip has its own Films / Series choice
  const [closed, setClosed] = useState(prefs.unClosed);
  const [mineOnly, setMineOnly] = useState(prefs.unMine);
  const [src, setSrc] = useState<Source>(prefs.unSrc);
  const [snoozed, setSnoozed] = useState<Snoozed>({});
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set()); // "Move to Partly watched" done here: hidden until the server data catches up
  const { mark } = useLib();
  useEffect(() => {
    setSnoozed(loadSnoozed());
    // One-time move of the old localStorage choices into the cookie (they had no effect on the server render).
    try {
      if (localStorage.getItem("typecast:upnext-closed") !== null && document.cookie.indexOf("tc_ui=") < 0) {
        const old = { unClosed: localStorage.getItem("typecast:upnext-closed") === "1", unMine: localStorage.getItem("typecast:upnext-mine") === "1" };
        saveUi(old); setClosed(old.unClosed); setMineOnly(old.unMine);
      }
    } catch { /* storage unavailable */ }
  }, []);
  const canFilter = services !== "no";
  const mine = canFilter && mineOnly;
  const kindPicks = ofKind(base, kind);
  const sourced = bySource(kindPicks, src);
  const picks = mine ? onYourServices(sourced) : sourced;
  const list = picks.filter((p) => !snoozed[p.key] && !moved.has(p.key)).slice(0, SHOW);
  const hidden = picks.filter((p) => snoozed[p.key]).length;
  if (!base.length) return null;
  const chooseSrc = (s: Source) => { setSrc(s); saveUi({ unSrc: s }); };
  const chooseKind = (k: Kind) => { setKind(k); saveUi({ unKind: k }); };
  const toggleMine = () => { saveUi({ unMine: !mineOnly }); setMineOnly(!mineOnly); };
  const empty = !mine ? (sourced.length ? "Nothing left to suggest: everything here is hidden for now." : src === "new" ? "No new picks right now. They come from titles you rated highly." : "Nothing from your library to suggest right now.")
    : services === "pending" ? "Checking where these stream…"
    : services === "failed" ? "Couldn't check your services just now. Try again in a moment."
    : "Nothing from your list is streaming on your services right now.";
  const toggle = () => { saveUi({ unClosed: !closed }); setClosed(!closed); };
  const snooze = (k: string) => { const s = { ...loadSnoozed(), [k]: Date.now() + SNOOZE_MS }; saveSnoozed(s); setSnoozed(s); };
  const toPartly = (p: Pick) => { setMoved((m) => new Set(m).add(p.key)); void mark(p, "partial"); };
  const restore = () => { saveSnoozed({}); setSnoozed({}); };
  return (
    <section className="upnext" aria-label="Watch next">
      <div className="upnext-bar">
        <button type="button" className="upnext-h" aria-expanded={!closed} onClick={toggle}>
          <span className="upnext-k">Watch next</span>
          <span className="mono upnext-n">{list.length}</span>
          <span className="upnext-caret" aria-hidden="true">{closed ? "Show" : "Hide"}</span>
        </button>
        {!closed && (kind !== "all" || mixed(base)) && <div className="upnext-kind"><KindSeg value={kind} onChange={chooseKind} label="Films or series" /></div>}
        {!closed && <div className="seg upnext-src" role="group" aria-label="Show picks from">{SOURCES.map(([k, text]) => <button key={k} type="button" aria-pressed={src === k} onClick={() => chooseSrc(k)}>{text}</button>)}</div>}
        {!closed && canFilter && <button type="button" className="chip upnext-mine" aria-pressed={mine} onClick={toggleMine} title="Only what you can stream tonight on the services you picked in Settings">On my services</button>}
        {!closed && hidden > 0 && <button type="button" className="upnext-restore" onClick={restore}>{hidden} hidden · bring back</button>}
      </div>
      {!closed && !list.length && <p className="muted upnext-empty">{empty}{mine && services === "yes" && <> <button type="button" className="upnext-restore" onClick={toggleMine}>Show everything</button></>}</p>}
      {!closed && list.length > 0 && (
        <ul className="upnext-strip">
          {list.map((p) => (
            <li key={p.key} className={`upnext-card k-${p.kind}`}>
              <TitleLink className="upnext-link" k={p.key} it={p}>
                <span className="upnext-art">
                  {p.poster
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className="upnext-poster" src={img(p.poster, "w185")} alt="" loading="lazy" decoding="async" />
                    : <span className="upnext-poster" />}
                  {p.kind === "discover" && <span className="upnext-badge">New pick</span>}
                  {p.kind === "new-eps" && <span className="upnext-badge">{p.fresh ? newEpLabel({ season: p.fresh === "season" }) : "New eps"}</span>}
                  {p.tag && <span className="upnext-svc">{p.tag}</span>}
                </span>
                <span className="upnext-t">{p.title}</span>
                {!p.go && <span className="upnext-w">{p.why}</span>}
                {!p.go && p.length && <span className="mono upnext-len">{p.length}</span>}
              </TitleLink>
              {/* A continue card: the text line sits outside the popup link so it can hold a second link (never an anchor inside an anchor). Same one or two lines. */}
              {p.go && <span className="upnext-w">{p.why} <Link className="upnext-go" href={p.go}>Continue</Link></span>}
              {p.go && p.length && <span className="mono upnext-len">{p.length}</span>}
              {p.kind === "still" && (
                <span className="upnext-ask">
                  <button type="button" title="Keep watching: ask again in a month" onClick={() => snooze(p.key)}>Keep</button>
                  <button type="button" aria-label="Move to Partly watched" title="Move to Partly watched" onClick={() => toPartly(p)}>Move to Partly</button>
                </span>
              )}
              <button type="button" className="upnext-x" aria-label={`Not now: ${p.title}`} title="Not now (hide for a month)" onClick={() => snooze(p.key)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
