import { redirect } from "next/navigation";

/** The old address of the Watching now page: keep bookmarks and links working. */
export default async function OldWho({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const one = Array.isArray(v) ? v[0] : v; if (one != null) q.set(k, one); }
  redirect(`/watching${q.size ? `?${q}` : ""}`);
}
