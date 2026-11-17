/** "Not what you were after? Search Google": a plain new-tab link with the typed text, for when our own answer is thin. */
export default function GoogleLink({ term, suffix = "" }: { term: string; suffix?: string }) {
  const q = `${term.trim()}${suffix}`;
  return (
    <p className="muted small" style={{ marginTop: 12 }}>
      Not what you were after?{" "}
      <a className="linkish" href={`https://www.google.com/search?q=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer">Search Google for &quot;{q}&quot;</a>
    </p>
  );
}
