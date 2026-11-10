export const metadata = { title: "Offline" };
export default function Offline() {
  return (
    <main className="login">
      <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
      <p className="muted">You are offline. Reconnect to look up cast and streaming details. Your library is safe on the server.</p>
      {/* A plain link, so it works with no JavaScript loaded: it asks for the home page again, and the worker brings this page back if still offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="btn gold" href="/">Try again</a>
    </main>
  );
}
