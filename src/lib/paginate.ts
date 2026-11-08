/**
 * Supabase's PostgREST returns at most `max_rows` rows per request (1000 unless the project changes it; the real value
 * is not readable from here, so nothing depends on it). Any read that can match more rows must page.
 */
export const PAGE_SIZE = 1000;

/**
 * Reads every row by asking for `[from, to]` windows until a short page comes back. `fetchPage` must use a total order
 * (ties broken by a unique column) or rows can be skipped or repeated between pages. If the server caps a page below
 * `size`, the short page would end the loop early, so keep `size` at or under the cap.
 */
export async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}
