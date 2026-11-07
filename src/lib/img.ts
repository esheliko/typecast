export const img = (p: string | null | undefined, size: string) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : "");
export const typeLabel = (t: string) => (t === "tv" ? "Series" : "Film");
export const href = (key: string) => { const [t, id] = key.split(":"); return `/title/${t}/${id}`; };
