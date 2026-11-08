import { TmdbError } from "@/lib/tmdb";
import { LbError } from "@/lib/letterboxd";

/** Shown instead of raw database / library messages, which can leak table names, SQL hints or keys. */
export const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";

/**
 * The message that is safe to show a user. Only our own friendly errors (TMDB, Letterboxd) pass through;
 * anything else is logged in full (it shows up in the Vercel runtime logs) and replaced by a plain sentence.
 */
export function userMessage(e: unknown, where = "request", fallback = GENERIC_ERROR): string {
  if (e instanceof TmdbError || e instanceof LbError) return e.message;
  console.error(`[error] ${where}:`, e);
  return fallback;
}

/** An Error to throw for a failed Supabase call: the real message is logged, the thrown one is friendly. */
export function dbError(error: { message: string }, where = "database"): Error {
  console.error(`[error] ${where}:`, error.message);
  return new Error("Could not save that. Please try again.");
}

/** JSON body + status for an API route's catch block. */
export function apiError(e: unknown, where: string): { body: { error: string }; status: number } {
  const status = e instanceof TmdbError ? e.status : 500;
  return { body: { error: userMessage(e, where) }, status };
}
