"use client";
import { useState, useTransition } from "react";
import { createCalendarLink, resetCalendarLink } from "@/app/calendar-actions";
import SettingRow from "./SettingRow";

/** Settings: the private address of your upcoming-releases calendar, to paste into Apple/Google/Outlook Calendar as a subscription. */
export default function CalendarFeed({ initial }: { initial: string | null }) {
  const [token, setToken] = useState(initial);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const link = token && typeof window !== "undefined" ? `${window.location.origin}/cal/${token}.ics` : "";

  const run = (f: () => ReturnType<typeof createCalendarLink>, ok: string) => { setErr(""); setMsg(""); start(async () => { const r = await f(); if (r.ok) { setToken(r.token); setMsg(ok); } else setErr(r.error); }); };
  async function copy() {
    try { await navigator.clipboard.writeText(link); setMsg("Link copied."); setErr(""); }
    catch { setErr("Couldn't copy. Select the link and copy it by hand."); }
  }
  return (
    <SettingRow label="Calendar feed" value={token ? "On" : "Off"}>
      <div className="small">
        <p className="muted" style={{ margin: "0 0 10px" }}>Subscribe in your calendar app to see unreleased films and the next episode of your series, kept up to date. The address is private: anyone who has it can see which titles are coming from your list.</p>
        {token ? (
          <>
            <input readOnly aria-label="Calendar link" value={link} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn gold" type="button" onClick={copy}>Copy link</button>
              <a className="btn" href={link.replace(/^https?:/, "webcal:")}>Subscribe</a>
              <button className="btn" type="button" disabled={pending} onClick={() => { if (confirm("Make a new link? The old one stops working and calendars using it will need the new one.")) run(resetCalendarLink, "New link made. The old one no longer works."); }}>Reset link</button>
            </div>
          </>
        ) : (
          <button className="btn gold" type="button" disabled={pending} onClick={() => run(createCalendarLink, "Link made.")}>Make my calendar link</button>
        )}
        {msg && <p className="small" role="status" style={{ margin: "10px 0 0" }}>{msg}</p>}
        {err && <p className="small err" role="alert" style={{ margin: "10px 0 0" }}>{err}</p>}
      </div>
    </SettingRow>
  );
}
