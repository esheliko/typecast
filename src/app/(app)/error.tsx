"use client";
import ErrorView from "@/components/ErrorView";

/** A page failed: the header and tabs stay, only the content is replaced. */
export default function PageError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
