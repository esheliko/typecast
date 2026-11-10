"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { dbError, userMessage } from "@/lib/errors";
import { normalizeDetails } from "@/lib/details";
import { fetchAll } from "@/lib/paginate";
import { parseItem, parseProfile, planItem, RESTORE_CHUNK, tally, type BackupItem, type Counts, type Plan } from "@/lib/backup";

type Res = { ok: true } | { ok: false; error: string };
/** Database and library errors are logged and replaced by a plain sentence (see lib/errors). */
const msg = (e: unknown) => userMessage(e, "account-actions");

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
    if (error) { console.error("[error] changePassword:", error.message); return { ok: false, error: "Could not change the password. Try again in a moment." }; }
    // A changed password must end every other login (a stolen or forgotten device); this one stays signed in.
    const { error: out } = await sb.auth.signOut({ scope: "others" });
    if (out) console.error("[error] changePassword sign-out others:", out.message);
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
      if (adds.length) { const { error } = await sb.from("library_items").upsert(adds, { onConflict: "user_id,tmdb_type,tmdb_id", ignoreDuplicates: true }); if (error) throw dbError(error, "restoreChunk"); }
      // Fills touch only the empty field and only while it is still empty in the database, so an edit made while the
      // restore runs is never overwritten (the old code wrote back the whole row it had read earlier).
      const fills = items.flatMap((i, n) => { const p = plans[n]; return p.kind !== "fill" ? [] : [{ type: i.type, id: i.id, f: p.fills }]; });
      const updates = fills.flatMap(({ type, id, f }) => {
        const q = (values: Record<string, unknown>, empty: string) =>
          sb.from("library_items").update({ ...values, updated_at: now }).eq("user_id", user.id).eq("tmdb_type", type).eq("tmdb_id", id).or(empty);
        const list: PromiseLike<{ error: { message: string } | null }>[] = [];
        if (f.rating !== undefined) list.push(q({ rating: f.rating }, "rating.is.null,rating.eq.0"));
        if (f.note !== undefined) list.push(q({ note: f.note }, "note.is.null,note.eq."));
        if (f.progress_season !== undefined) list.push(q({ progress_season: f.progress_season, progress_episode: f.progress_episode }, "progress_season.is.null,progress_season.eq.0"));
        return list;
      });
      for (let k = 0; k < updates.length; k += 25) {
        for (const r of await Promise.all(updates.slice(k, k + 25))) if (r.error) throw dbError(r.error, "restoreChunk");
      }
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
    if (error) { console.error("[error] restoreProfile:", error.message); return { ok: false, error: "Could not restore your settings. Try again in a moment." }; }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
