import type { Metadata } from "next";
import BackButton from "@/components/BackButton";
import TitleView, { loadTitle, type TitleParams } from "@/components/TitleView";

type Props = { params: TitleParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try { const t = await loadTitle(params); return { title: t.title }; } catch { return { title: "Title" }; }
}

export default async function TitlePage({ params }: Props) {
  const t = await loadTitle(params);
  return (
    <article className="page">
      <div className="pagebar"><BackButton /></div>
      <TitleView t={t} />
    </article>
  );
}
