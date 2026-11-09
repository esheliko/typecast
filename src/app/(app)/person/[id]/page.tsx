import type { Metadata } from "next";
import BackButton from "@/components/BackButton";
import { RestorePopup } from "@/components/Modal";
import PersonView, { fromTitle, loadPerson, type PersonParams } from "@/components/PersonView";

type Props = { params: PersonParams; searchParams: Promise<{ pf?: string; pn?: string; py?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try { return { title: (await loadPerson(params)).name }; } catch { return { title: "Person" }; }
}

/** Opened directly (refresh, shared link) this restores the popup over the last page; ?full=1 shows this full page. */
export default async function PersonPage({ params, searchParams }: Props) {
  const [p, q] = await Promise.all([loadPerson(params), searchParams]);
  return (
    <RestorePopup>
      <article className="page">
        <div className="pagebar"><BackButton /></div>
        <PersonView p={p} from={fromTitle(q)} />
      </article>
    </RestorePopup>
  );
}
