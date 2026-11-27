import type { Metadata } from "next";
import { RestorePopup } from "@/components/Modal";
import EpisodesWarm from "@/components/EpisodesWarm";
import { getLibraryItem } from "@/lib/library";
import BackButton from "@/components/BackButton";
import TitleView, { loadTitle, type TitleParams } from "@/components/TitleView";

type Props = { params: TitleParams; searchParams: Promise<{ p?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try { const t = await loadTitle(params); return { title: t.title }; } catch { return { title: "Title" }; }
}

export default async function TitlePage({ params, searchParams }: Props) {
  const [t, q] = await Promise.all([loadTitle(params), searchParams]);
  const focus = q.p && /^\d+$/.test(q.p) ? +q.p : null;
  // A series: its opening season is asked for while the page is replayed as a popup (components/EpisodesWarm.tsx), not after.
  const mine = t.type === "tv" && t.seasons.length > 0 ? await getLibraryItem(t.key).catch(() => null) : null;
  return (
    <>
      {t.type === "tv" && t.seasons.length > 0 && <EpisodesWarm id={t.id} seasons={t.seasons} progress={mine?.progress ?? null} />}
    <RestorePopup>
      <article className="page">
        <div className="pagebar"><BackButton /></div>
        <TitleView t={t} focus={focus} />
      </article>
    </RestorePopup>
    </>
  );
}
