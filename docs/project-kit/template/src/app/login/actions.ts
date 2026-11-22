"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** Accounts are created by the owner in the Supabase dashboard; public sign-up is switched off there. */
export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return { error: "Enter your email and password." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  // Only a refused login is "wrong password". A rate limit or an outage says so, instead of sending someone off to reset a password that is fine.
  if (error) {
    const st = (error as { status?: number }).status ?? 0;
    if (st === 429) return { error: "Too many tries. Wait a minute and try again." };
    if (st === 0 || st >= 500) { console.error("[error] signIn:", error.message); return { error: "Could not reach the sign-in service. Try again in a moment." }; }
    return { error: "Wrong email or password." };
  }
  redirect("/");
}
