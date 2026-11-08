import DetailOrder from "@/components/DetailOrder";
import InstallButton from "@/components/InstallButton";
import LetterboxdPanel from "@/components/LetterboxdPanel";
import ProfileForm from "@/components/ProfileForm";
import SettingRow from "@/components/SettingRow";
import { DETAIL_IDS } from "@/lib/details";
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
      <h2>Preferences</h2>
      <ProfileForm initial={profile} />
      <div className="card set" style={{ marginTop: 10 }}>
        <SettingRow label="Details shown" value={`${profile.details.length} of ${DETAIL_IDS.length}`}>
          <DetailOrder initial={profile.details} always />
        </SettingRow>
      </div>
      <h2>Library</h2>
      <div className="card set"><LetterboxdPanel link={profile.letterboxd} /></div>
      {admin && <><h2>Users</h2>{users ? <div className="card set"><ManageUsers users={users} /></div> : <p className="muted small">Couldn&apos;t load users. Check that SUPABASE_SERVICE_ROLE_KEY is set.</p>}</>}
      <h2>Account</h2>
      <div className="card set">
        <div className="srow"><span>Signed in</span><span className="sval"><span>{data?.claims?.email as string | undefined}</span></span></div>
        <a className="srow" href="/api/export" download><span>Export backup</span><span className="sval"><span className="chev" aria-hidden="true">›</span></span></a>
        <SettingRow label="Install app"><div className="small muted"><InstallButton /></div></SettingRow>
        <form action={signOut}><button className="srow link" type="submit"><span>Sign out</span><span className="sval"><span className="chev" aria-hidden="true">›</span></span></button></form>
      </div>
      <p className="foot">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.</p>
    </div>
  );
}
