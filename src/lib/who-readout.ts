/**
 * The timeline readout compares the reference (what is being watched) only with a row somebody chose on purpose. Pure; unit tested in
 * tests/unit/who-readout.test.ts.
 *
 * On open nobody has chosen, so the default is: the title highlighted from a "titles in common" pick, else the top "You know them from"
 * title, else nothing at all (no readout). A hover/focus preview wins over a click, a click over the default.
 */
export function defaultChoice(opts: { highlighted?: string | null; known: string[]; usable: (key: string) => boolean }): string | null {
  const { highlighted, known, usable } = opts;
  if (highlighted && usable(highlighted)) return highlighted;
  return known.find(usable) ?? null;
}

/** What the readout shows: preview, else selected, else the default, skipping any that cannot be compared. */
export function readoutChoice(opts: { preview?: string | null; selected?: string | null; fallback: string | null; usable: (key: string) => boolean }): string | null {
  for (const k of [opts.preview, opts.selected, opts.fallback]) if (k && opts.usable(k)) return k;
  return null;
}
