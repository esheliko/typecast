/** Placeholder shaped like /who (top bar, finder with a face grid, right pane). Server-safe. */
export function WhoSkeleton({ title, poster }: { title?: string; poster?: string }) {
  return (
    <div className="wx" aria-hidden="true">
      <header className="wx-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster ? <img className="wx-poster" src={poster} alt="" /> : <span className="sk-b wx-poster" />}
        <div className="wx-ttl">{title ? <b className="wx-title">{title}</b> : <><span className="sk-b" style={{ width: 160, height: 18 }} /><span className="sk-b" style={{ width: 90, height: 12, marginTop: 6 }} /></>}</div>
        <span className="sk-b wx-pos-sk" />
      </header>
      <div className="wx-main">
        <div className="wx-left">
          <div className="sk-b" style={{ height: 44, borderRadius: 999 }} />
          <div style={{ display: "flex", gap: 8, margin: "12px 0 18px" }}><span className="sk-b pill" style={{ width: 150, height: 34 }} /><span className="sk-b pill" style={{ width: 150, height: 34 }} /></div>
          <ul className="wx-grid">{Array.from({ length: 10 }, (_, i) => <li key={i}><div className="wx-tile"><span className="sk-b wx-ph" /><span className="sk-b" style={{ width: "70%", height: 14, marginTop: 8 }} /><span className="sk-b" style={{ width: "50%", height: 11, marginTop: 6 }} /></div></li>)}</ul>
        </div>
        <aside className="wx-right" data-open="false">
          <div className="wx-trailbar"><span className="sk-b" style={{ width: 120, height: 16 }} /></div>
          <div className="wx-nodebody"><span className="sk-b" style={{ width: "60%", height: 28 }} /><span className="sk-b" style={{ width: "100%", height: 90, marginTop: 18 }} /><span className="sk-b" style={{ width: "100%", height: 90, marginTop: 12 }} /></div>
        </aside>
      </div>
    </div>
  );
}
