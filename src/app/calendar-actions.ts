"use server";
import { requireUser } from "@/lib/supabase/server";
import { newCalendarToken } from "@/lib/calendar-token";

type Res = { ok: true; token: string } | { ok: false; error: string };

async function save(token: string): Promise<Res> {
  try {
    const { sb, user } = await requireUser();
    const { error } = await sb.from("profiles").upsert({ user_id: user.id, calendar_token: token }, { onConflict: "user_id" });
    if (error) return { ok: false, error: /calendar_token/.test(error.message) ? "The calendar feed isn't set up on the server yet." : "Could not save the link. Try again." };
    return { ok: true, token };
  } catch {
    return { ok: false, error: "Could not save the link. Try again." };
  }
}

/** Keeps the link you already have; makes one the first time. */
export async function createCalendarLink(): Promise<Res> {
  try {
    const { sb, user } = await requireUser();
    const { data } = await sb.from("profiles").select("calendar_token").eq("user_id", user.id).maybeSingle();
    if (data?.calendar_token) return { ok: true, token: data.calendar_token as string };
  } catch { /* fall through to creating one */ }
  return save(newCalendarToken());
}

/** A new link; the old one stops working at once. */
export async function resetCalendarLink(): Promise<Res> {
  return save(newCalendarToken());
}
