"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { normalizeDetails } from "@/lib/details";
import { fetchAll } from "@/lib/paginate";
import { parseItem, parseProfile, planItem, RESTORE_CHUNK, tally, type BackupItem, type Counts, type Plan } from "@/lib/backup";

type Res = { ok: true } | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Change the signed-in user's password. The current password is re-checked first (on a throwaway client, so the
 * browser's session is untouched), so a stolen session cannot silently take the account over.
 */
export async function changePassword(current: string, next: string, again: string): Promise<Res> {
  try {
    const { sb, user } = await requireUser();
    if (!user.email) return { ok: false, error: "This account has no email, so the password can't be checked." };
    if (typeof current !== "string" || typeof next !== "string" || !current) return { ok: false, error: "Enter your current password." };
    if (next.length < 8) return { ok: false, error: "The new password must be at least 8 characters." };
    if (next.length > 72) return { ok: false, error: "The new password must be at most 72 characters." };
    if (next !== again) return { ok: false, error: "The two new passwords don't match." };
    if (next === current) return { ok: false, error: "The new password is the same as the current one." };
    const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: bad } = await check.auth.signInWithPassword({ email: user.email, password: current });
    if (bad || data.user?.id !== user.id) return { ok: false, error: "The current password is wrong." };
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

type RestoreRes = ({ ok: true } & Counts) | { ok: false; error: string };

/**
 * Restore one chunk of a backup's library. `apply: false` only reports what would happen. Merge, never destroy: missing
 * titles are added, existing ones only get an empty rating / note / progress filled. Nothing is deleted or overwritten.
 */
export async function restoreChunk(raw: unknown, apply: boolean): Promise<RestoreRes> {
  try {
    const { sb, user } = await requireUser();
    if (!Array.isArray(raw) || raw.length > RESTORE_CHUNK) return { ok: false, error: "Bad chunk." };
    const items: BackupItem[] = [];
    for (const r of raw) { const p = parseItem(r); if (!p.ok) return { ok: false, error: `Bad title: ${p.error}.` }; items.push(p.item); }
    if (!items.length) return { ok: true, added: 0, filled: 0, same: 0 };
    // Read what is saved for exactly these titles (paged, ordered totally, so a response cap can never hide a row).
    const saved = new Map<string, Record<string, unknown>>();
    for (const t of ["movie", "tv"] as const) {
      const ids = items.filter((i) => i.type === t).map((i) => i.id);
      if (!ids.length) continue;
      const rows = await fetchAll<Record<string, unknown>>((from, to) => sb.from("library_items").select("*").eq("user_id", user.id).eq("tmdb_type", t).in("tmdb_id", ids).order("tmdb_id").range(from, to));
      for (const r of rows) saved.set(`${t}:${r.tmdb_id}`, r);
    }
    const plans: Plan[] = items.map((i) => {
      const s = saved.get(`${i.type}:${i.id}`);
      return planItem(s && { rating: Number(s.rating) || 0, note: String(s.note ?? ""), progress_season: (s.progress_season as number | null) ?? null }, i);
    });
    if (apply) {
      const now = new Date().toISOString();
      const iso = (ms: number) => new Date(ms).toISOString();
      const adds = items.flatMap((i, n) => plans[n].kind !== "add" ? [] : [{
        user_id: user.id, tmdb_type: i.type, tmdb_id: i.id, title: i.title, year: i.year, poster_path: i.poster, status: i.status, priority: i.priority,
        rating: i.rating, note: i.note, progress_season: i.progress?.s ?? null, progress_episode: i.progress?.e ?? null,
        ...(i.added ? { added_at: iso(i.added) } : {}), ...(i.watchedAt ? { watched_at: iso(i.watchedAt) } : {}), updated_at: now,
      }]);
      // ignoreDuplicates: if the title appeared meanwhile, keep what is there.
      if (adds.length) { const { error } = await sb.from("library_items").upsert(adds, { onConflict: "user_id,tmdb_type,tmdb_id", ignoreDuplicates: true }); if (error) throw new Error(error.message); }
      const fills = items.flatMap((i, n) => { const p = plans[n]; return p.kind !== "fill" ? [] : [{ ...saved.get(`${i.type}:${i.id}`)!, ...p.fills, updated_at: now }]; });
      if (fills.length) { const { error } = await sb.from("library_items").upsert(fills, { onConflict: "user_id,tmdb_type,tmdb_id" }); if (error) throw new Error(error.message); }
      if (adds.length || fills.length) revalidatePath("/", "layout");
    }
    return { ok: true, ...tally(plans) };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Optional: put the backup's country, services and detail order back. Replaces those settings (Letterboxd link is never touched). */
export async function restoreProfile(raw: unknown): Promise<Res> {
  try {
    const { sb, user } = await requireUser();
    const p = parseProfile(raw);
    if (!p.ok) return p;
    const { error } = await sb.from("profiles").upsert(
      { user_id: user.id, country: p.profile.country, services: p.profile.services, service_names: p.profile.serviceNames, detail_order: normalizeDetails(p.profile.details), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
