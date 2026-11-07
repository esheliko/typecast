import { OpenedFrom } from "@/components/Modal";
import TitleView, { loadTitle, type TitleParams } from "@/components/TitleView";

export default async function TitleModal({ params, searchParams }: { params: TitleParams; searchParams: Promise<{ from?: string; fn?: string }> }) {
  const [t, q] = await Promise.all([loadTitle(params), searchParams]);
  const from = q.from && /^(movie|tv):\d+$/.test(q.from) && q.fn ? { k: q.from, name: q.fn.slice(0, 200) } : null;
  return <article className="page">{from && <OpenedFrom {...from} />}<TitleView t={t} /></article>;
}
