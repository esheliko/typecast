/** Placeholders shaped like the real pages. Server-safe: no state, no data. */
const bar = (w: number | string, h = 14, extra?: React.CSSProperties) => <div className="sk-b" style={{ width: w, height: h, ...extra }} />;

export function GridSkeleton({ n = 12 }: { n?: number }) {
  return (
    <ul className="grid" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <li key={i}><div className="pc"><div className="pc-img sk" />{bar("80%", 14, { marginTop: 9 })}{bar("45%", 11, { marginTop: 6 })}</div></li>)}
    </ul>
  );
}

export function ChipsSkeleton({ n = 5, w = 84 }: { n?: number; w?: number }) {
  return <div className="chips" aria-hidden="true">{Array.from({ length: n }, (_, i) => <div key={i} className="sk-b pill" style={{ width: w, height: 34 }} />)}</div>;
}

export function RowsSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="card" aria-hidden="true"><ul className="rows">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}><div className="row">
          <div className="sk-b thumb" />
          <div style={{ flex: 1, display: "grid", gap: 8 }}>{bar("60%", 16)}{bar("35%", 11)}</div>
        </div></li>
      ))}
    </ul></div>
  );
}

export function TitleSkeleton({ title, poster, sub }: { title?: string; poster?: string; sub?: string }) {
  return (
    <div aria-busy="true">
      <div className="sh-top sh-compact" style={{ marginTop: 10 }}>
        {poster
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="sh-poster" src={poster} alt="" />
          : <div className="sh-poster sk-b" style={{ aspectRatio: "2 / 3" }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          {title ? <h1 className="sh-title">{title}</h1> : bar("70%", 34)}
          {sub ? <div className="sh-meta">{sub}</div> : bar("40%", 13, { marginTop: 12 })}
          {bar("90%", 12, { marginTop: 14 })}{bar("75%", 12, { marginTop: 6 })}
        </div>
      </div>
      <div className="chips" style={{ marginTop: 18 }}>{[0, 1, 2].map((i) => <div key={i} className="sk-b pill" style={{ width: 96, height: 38 }} />)}</div>
      <h2><span className="sk-b" style={{ width: 90, height: 12 }} /></h2>
      <RowsSkeleton n={5} />
    </div>
  );
}

export function PersonSkeleton({ name, photo }: { name?: string; photo?: string }) {
  return (
    <div aria-busy="true">
      <div className="sh-top" style={{ marginTop: 14 }}>
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="sh-poster" src={photo} alt="" />
          : <div className="sh-poster sk-b" style={{ aspectRatio: "2 / 3" }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          {name ? <h1 className="sh-title">{name}</h1> : bar("65%", 34)}
          {bar("30%", 13, { marginTop: 12 })}
        </div>
      </div>
      <h2><span className="sk-b" style={{ width: 90, height: 12 }} /></h2>
      <RowsSkeleton n={6} />
    </div>
  );
}

export function StatCardsSkeleton({ n = 3 }: { n?: number }) {
  return (
    <div className="stat-cards" style={{ marginTop: 20 }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <div key={i} className="card stat-card" style={{ display: "grid", gap: 10 }}>{bar("40%", 12)}{bar("100%", 10)}{bar("80%", 10)}{bar("60%", 10)}</div>)}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <div style={{ marginTop: 14 }}><ChipsSkeleton n={3} w={78} /></div>
      <div className="stat-grid">{Array.from({ length: 3 }, (_, i) => <div key={i} className="stat">{bar("50%", 32)}{bar("70%", 12)}</div>)}</div>
      <StatCardsSkeleton n={4} />
    </div>
  );
}
