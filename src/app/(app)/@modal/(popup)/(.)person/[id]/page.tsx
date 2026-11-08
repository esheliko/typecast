import PersonView, { loadPerson, type PersonParams } from "@/components/PersonView";

export default async function PersonModal({ params }: { params: PersonParams }) {
  const p = await loadPerson(params);
  return <article className="page"><PersonView p={p} /></article>;
}
