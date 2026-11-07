"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, supabaseServer } from "@/lib/supabase/server";
import type { MediaType, Priority, Status } from "@/lib/types";

const STATUSES = ["watching", "partial", "watchlist", "watched"];
const where = (type: MediaType, id: number) => ({ tmdb_type: type, tmdb_id: id });
const done = () => revalidatePath("/", "layout");

export async function setStatus(item: { type: MediaType; id: number; title: string; year: string; poster: string | null }, status: Status | null, priority?: Priority) {
  const { sb, user } = await requireUser();
  if (status === null) {
    const { error } = await sb.from("library_items").delete().eq("user_id", user.id).match(where(item.type, item.id));
    if (error) throw new Error(error.message);
  } else {
    if (!STATUSES.includes(status)) throw new Error("Bad status");
    if (priority !== undefined && priority !== "someday" && priority !== "must") throw new Error("Bad priority");
    const { error } = await sb.from("library_items").upsert(
      { user_id: user.id, ...where(item.type, item.id), title: item.title, year: item.year, poster_path: item.poster, status, ...(priority ? { priority } : {}), updated_at: new Date().toISOString() },
      { onConflict: "user_id,tmdb_type,tmdb_id" },
    );
    if (error) throw new Error(error.message);
  }
  done();
}

async function patch(type: MediaType, id: number, values: Record<string, unknown>) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("library_items").update({ ...values, updated_at: new Date().toISOString() }).eq("user_id", user.id).match(where(type, id));
  if (error) throw new Error(error.message);
}
export async function setPriority(type: MediaType, id: number, priority: Priority) {
  if (priority !== "someday" && priority !== "must") throw new Error("Bad priority");
  await patch(type, id, { priority }); done();
}
export async function setRating(type: MediaType, id: number, rating: number) {
  await patch(type, id, { rating: Math.max(0, Math.min(5, Math.round(rating))) }); done();
}
export async function setNote(type: MediaType, id: number, note: string) {
  await patch(type, id, { note: note.slice(0, 5000) });
}
export async function setProgress(type: MediaType, id: number, season: number, episode: number) {
  await patch(type, id, { progress_season: season, progress_episode: episode }); done();
}

export async function saveProfile(p: { country: string; services: number[]; serviceNames: Record<string, string> }) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").upsert(
    { user_id: user.id, country: p.country, services: p.services, service_names: p.serviceNames, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  done();
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
