import { getTitle } from "@/lib/tmdb";
import TitleView, { loadTitle, type TitleParams } from "@/components/TitleView";

export default async function TitleModal({ params, searchParams }: { params: TitleParams; searchParams: Promise<{ from?: string; fn?: string }> }) {
  const [t, q] = await Promise.all([loadTitle(params), searchParams]);
  const from = q.from && /^(movie|tv):\d+$/.test(q.from) && q.fn ? { k: q.from, name: q.fn.slice(0, 200) } : null;
  const origin = from ? await getTitle(from.k.startsWith("tv") ? "tv" : "movie", +from.k.split(":")[1]).catch(() => null) : null;
  return <article className="page"><TitleView t={t} origin={origin} /></article>;
}
