/** Film (clapperboard strip) or Series (TV) glyph. The label is the accessible name and the hover tooltip. */
export function KindIcon({ type, className = "kind-i" }: { type: string; className?: string }) {
  const tv = type === "tv", label = tv ? "Series" : "Film";
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      {tv ? <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="m8 2 4 5 4-5" /></> : <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>}
    </svg>
  );
}
