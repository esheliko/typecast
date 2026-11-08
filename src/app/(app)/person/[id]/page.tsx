import type { Metadata } from "next";
import BackButton from "@/components/BackButton";
import { RestorePopup } from "@/components/Modal";
import PersonView, { loadPerson, type PersonParams } from "@/components/PersonView";

type Props = { params: PersonParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try { return { title: (await loadPerson(params)).name }; } catch { return { title: "Person" }; }
}

/** Opened directly (refresh, shared link) this restores the popup over the last page; ?full=1 shows this full page. */
export default async function PersonPage({ params }: Props) {
  const p = await loadPerson(params);
  return (
    <RestorePopup>
      <article className="page">
        <div className="pagebar"><BackButton /></div>
        <PersonView p={p} />
      </article>
    </RestorePopup>
  );
}
