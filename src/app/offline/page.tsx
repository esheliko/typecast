export const metadata = { title: "Offline" };
export default function Offline() {
  return (
    <main className="login">
      <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
      <p className="muted">You are offline. Reconnect to look up cast and streaming details. Your library is safe on the server.</p>
    </main>
  );
}
