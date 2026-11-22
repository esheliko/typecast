import { requireUser } from "@/lib/supabase/server";

export default async function Home() {
  const { user } = await requireUser();
  return (
    <main>
      <h1>{{NAME}}</h1>
      <p className="muted">Signed in as {user.email}. The first real feature goes here.</p>
    </main>
  );
}
