export const img = (p: string | null | undefined, size: string) => (p ? (/^https?:\/\//.test(p) ? p : `https://image.tmdb.org/t/p/${size}${p}`) : "");
export const typeLabel = (t: string) => (t === "tv" ? "Series" : "Film");
/** " · ★ 7.8" for a row's small line when TMDB's average is known, else "". */
export const avgLabel = (it: { avg?: number }) => (it.avg ? ` · ★ ${it.avg.toFixed(1)}` : "");
export const href = (key: string) => { const [t, id] = key.split(":"); return `/title/${t}/${id}`; };
