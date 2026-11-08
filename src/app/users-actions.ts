"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export type ManagedUser = { id: string; email: string; created: string; lastSignIn: string | null; isAdmin: boolean };
type Res = { ok: true } | { ok: false; error: string };

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const fail = (e: unknown): Res => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function listUsers(): Promise<ManagedUser[]> {
  const { admin, user } = await requireAdmin();
  const out: ManagedUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? "(no email)", created: u.created_at, lastSignIn: u.last_sign_in_at ?? null, isAdmin: u.id === user.id })));
    if (data.users.length < 200) break;
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

export async function addUser(email: string, password: string): Promise<Res> {
  try {
    const { admin } = await requireAdmin();
    email = email.trim().toLowerCase();
    if (!emailOk(email)) return { ok: false, error: "Enter a valid email." };
    if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/setup");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Change a user's email and/or password. Blank fields are left alone. */
export async function editUser(id: string, email: string, password: string): Promise<Res> {
  try {
    const { admin } = await requireAdmin();
    const attrs: { email?: string; password?: string; email_confirm?: boolean } = {};
    email = email.trim().toLowerCase();
    if (email) { if (!emailOk(email)) return { ok: false, error: "Enter a valid email." }; attrs.email = email; attrs.email_confirm = true; }
    if (password) { if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }; attrs.password = password; }
    if (!attrs.email && !attrs.password) return { ok: false, error: "Nothing to change." };
    const { error } = await admin.auth.admin.updateUserById(id, attrs);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/setup");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeUser(id: string): Promise<Res> {
  try {
    const { admin, user } = await requireAdmin();
    if (id === user.id) return { ok: false, error: "You can't remove your own account." };
    const { error } = await admin.auth.admin.deleteUser(id); // library and profile rows cascade
    if (error) return { ok: false, error: error.message };
    revalidatePath("/setup");
    return { ok: true };
  } catch (e) { return fail(e); }
}
