import DetailOrder from "@/components/DetailOrder";
import InstallButton from "@/components/InstallButton";
import LetterboxdPanel from "@/components/LetterboxdPanel";
import ProfileForm from "@/components/ProfileForm";
import ManageUsers from "@/components/ManageUsers";
import { signOut } from "@/app/actions";
import { listUsers } from "@/app/users-actions";
import { isAdminEmail } from "@/lib/admin";
import { getProfile } from "@/lib/library";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function Setup() {
  const [profile, { data }] = await Promise.all([getProfile(), supabaseServer().then((sb) => sb.auth.getClaims())]);
  const admin = isAdminEmail(data?.claims?.email as string | undefined);
  const users = admin ? await listUsers().catch(() => null) : null;
  return (
    <div className="page">
      <h2>Streaming</h2>
      <ProfileForm initial={profile} />
      <h2>Titles</h2>
      <details className="fold">
        <summary>Details shown</summary>
        <DetailOrder initial={profile.details} always />
      </details>
      <h2>Library</h2>
      <LetterboxdPanel link={profile.letterboxd} />
      {admin && <><h2>Users</h2>{users ? <ManageUsers users={users} /> : <p className="muted small">Couldn&apos;t load users. Check that SUPABASE_SERVICE_ROLE_KEY is set.</p>}</>}
      <h2>Account</h2>
      <div className="card pad">
        <div className="srow"><span className="muted small" style={{ overflowWrap: "anywhere" }}>{data?.claims?.email as string | undefined}</span></div>
        <div className="chips" style={{ marginTop: 10 }}>
          <a className="btn" href="/api/export" download>Export backup</a>
          <form action={signOut}><button className="btn" type="submit">Sign out</button></form>
        </div>
        <details className="small muted" style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer" }}>Install app</summary>
          <div style={{ marginTop: 6 }}><InstallButton /></div>
        </details>
      </div>
      <p className="foot">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.</p>
    </div>
  );
}
