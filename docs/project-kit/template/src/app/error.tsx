"use client";
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <h1>Something went wrong on our side</h1>
      {error.digest && <p className="muted">Reference {error.digest}</p>}
      <button className="btn" onClick={reset}>Try again</button>
    </main>
  );
}
