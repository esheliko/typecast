/** The "Then" photos switch (Watching now cast faces) is offered only when the title is old enough for people to look different. */
export const OLD_YEARS = 8;

/** `first` is the film's release date or the series' first air date ("1981-06-12"); anything unreadable counts as not old. */
export function isOldTitle(first: string | undefined, thisYear: number, years = OLD_YEARS): boolean {
  const y = Number((first ?? "").slice(0, 4));
  return Number.isInteger(y) && y > 1800 && thisYear - y >= years;
}
