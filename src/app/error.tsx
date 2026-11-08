"use client";
import ErrorView from "@/components/ErrorView";

/** The app layout itself failed (e.g. the database was unreachable): still inside the root layout, so fonts and styles load. */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
