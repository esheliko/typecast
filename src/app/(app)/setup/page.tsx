import DetailOrder from "@/components/DetailOrder";
import InstallButton from "@/components/InstallButton";
import LetterboxdPanel from "@/components/LetterboxdPanel";
import ProfileForm from "@/components/ProfileForm";
import { signOut } from "@/app/actions";
import { getProfile } from "@/lib/library";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Setup" };

export default async function Setup() {
  const [profile, { data }] = await Promise.all([getProfile(), supabaseServer().then((sb) => sb.auth.getClaims())]);
  return (
    <div className="page">
      <h2>Streaming</h2>
      <ProfileForm initial={profile} />
      <details className="fold">
        <summary>Title details <span className="muted">what shows on every title, and in what order</span></summary>
        <DetailOrder initial={profile.details} always />
      </details>
      <LetterboxdPanel link={profile.letterboxd} />
      <h2>Account</h2>
      <div className="card pad">
        <p className="small muted" style={{ margin: "0 0 10px" }}>Signed in as {data?.claims?.email as string | undefined}. Your library is stored on the server and follows you across devices.</p>
        <div className="chips">
          <a className="btn" href="/api/export" download>Export backup</a>
          <form action={signOut}><button className="btn" type="submit">Sign out</button></form>
        </div>
        <details className="small muted" style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer" }}>Install on your device</summary>
          <div style={{ marginTop: 6 }}><InstallButton /></div>
        </details>
      </div>
      <p className="foot" style={{ marginTop: 20 }}>This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.</p>
    </div>
  );
}
