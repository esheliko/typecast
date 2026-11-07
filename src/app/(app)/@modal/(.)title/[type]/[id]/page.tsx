import TitleView, { loadTitle, type TitleParams } from "@/components/TitleView";

export default async function TitleModal({ params }: { params: TitleParams }) {
  const t = await loadTitle(params);
  return <article className="page"><TitleView t={t} /></article>;
}
