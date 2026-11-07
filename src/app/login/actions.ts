"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** Accounts are created by the owner in the Supabase dashboard; public sign-up is switched off there. */
export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  if (!email.trim() || !password) return { error: "Enter your email and password." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: "Wrong email or password." };
  redirect("/");
}
