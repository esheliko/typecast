"use client";
import { useContext, useEffect, useState } from "react";
import { TitleLink } from "./Modal";
import { img } from "@/lib/img";
import type { Pick } from "@/lib/upnext";
import { ofKind } from "@/lib/kind";
import { KindContext } from "@/lib/kind-context";

const SHOW = 16;
const KEY = "typecast:upnext-closed";
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
export default function UpNext({ picks: all }: { picks: Pick[] }) {
  const picks = ofKind(all, useContext(KindContext)); // follows the Library's Films / Series switch
  const [closed, setClosed] = useState(false);
  const [snoozed, setSnoozed] = useState<Snoozed>({});
  useEffect(() => {
    try { setClosed(localStorage.getItem(KEY) === "1"); } catch { /* storage unavailable */ }
    setSnoozed(loadSnoozed());
  }, []);
  const list = picks.filter((p) => !snoozed[p.key]).slice(0, SHOW);
  const hidden = picks.filter((p) => snoozed[p.key]).length;
  if (!list.length && !hidden) return null;
  const toggle = () => setClosed((c) => { try { localStorage.setItem(KEY, c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  const snooze = (k: string) => { const s = { ...loadSnoozed(), [k]: Date.now() + SNOOZE_MS }; saveSnoozed(s); setSnoozed(s); };
  const restore = () => { saveSnoozed({}); setSnoozed({}); };
  return (
    <section className="upnext" aria-label="Watch next">
      <div className="upnext-bar">
        <button type="button" className="upnext-h" aria-expanded={!closed} onClick={toggle}>
          <span className="upnext-k">Watch next</span>
          <span className="mono upnext-n">{list.length}</span>
          <span className="upnext-caret" aria-hidden="true">{closed ? "Show" : "Hide"}</span>
        </button>
        {!closed && hidden > 0 && <button type="button" className="upnext-restore" onClick={restore}>{hidden} hidden · bring back</button>}
      </div>
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
                  {p.kind === "new-eps" && <span className="upnext-badge">New eps</span>}
                  {p.tag && <span className="upnext-svc">{p.tag}</span>}
                </span>
                <span className="upnext-t">{p.title}</span>
                <span className="upnext-w">{p.why}</span>
                {p.length && <span className="mono upnext-len">{p.length}</span>}
              </TitleLink>
              <button type="button" className="upnext-x" aria-label={`Not now: ${p.title}`} title="Not now (hide for a month)" onClick={() => snooze(p.key)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
