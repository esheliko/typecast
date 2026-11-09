import PersonView, { fromTitle, loadPerson, type PersonParams } from "@/components/PersonView";

export default async function PersonModal({ params, searchParams }: { params: PersonParams; searchParams: Promise<{ pf?: string; pn?: string; py?: string }> }) {
  const [p, q] = await Promise.all([loadPerson(params), searchParams]);
  return <article className="page"><PersonView p={p} from={fromTitle(q)} /></article>;
}
