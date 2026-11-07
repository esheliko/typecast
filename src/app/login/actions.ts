"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function allowed(email: string) {
  const list = (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
}

export async function sendCode(email: string): Promise<{ error?: string }> {
  email = email.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (!allowed(email)) return { error: "This email is not on the access list." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? { error: error.message } : {};
}

export async function verifyCode(email: string, token: string): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
  if (error) return { error: "That code did not work. Check it and try again." };
  redirect("/");
}
