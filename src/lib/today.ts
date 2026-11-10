/**
 * "Today" in the user's own time zone. The app has no time-zone setting: the country the user already picked for streaming
 * services (Settings) stands in for it. Countries with several zones use their capital or main population centre.
 * Pure (Intl only), so it runs on the server and in the browser.
 */

const TZ: Record<string, string> = {
  US: "America/New_York", GB: "Europe/London", CA: "America/Toronto", AU: "Australia/Sydney", NZ: "Pacific/Auckland", IE: "Europe/Dublin",
  DE: "Europe/Berlin", AT: "Europe/Vienna", CH: "Europe/Zurich", FR: "Europe/Paris", BE: "Europe/Brussels", NL: "Europe/Amsterdam",
  LU: "Europe/Luxembourg", ES: "Europe/Madrid", PT: "Europe/Lisbon", IT: "Europe/Rome", SE: "Europe/Stockholm", NO: "Europe/Oslo",
  DK: "Europe/Copenhagen", FI: "Europe/Helsinki", IS: "Atlantic/Reykjavik", PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava",
  HU: "Europe/Budapest", RO: "Europe/Bucharest", BG: "Europe/Sofia", GR: "Europe/Athens", HR: "Europe/Zagreb", SI: "Europe/Ljubljana",
  RS: "Europe/Belgrade", UA: "Europe/Kyiv", LT: "Europe/Vilnius", LV: "Europe/Riga", EE: "Europe/Tallinn", TR: "Europe/Istanbul",
  IL: "Asia/Jerusalem", AE: "Asia/Dubai", SA: "Asia/Riyadh", EG: "Africa/Cairo", ZA: "Africa/Johannesburg", IN: "Asia/Kolkata",
  JP: "Asia/Tokyo", KR: "Asia/Seoul", SG: "Asia/Singapore", HK: "Asia/Hong_Kong", TW: "Asia/Taipei", TH: "Asia/Bangkok",
  PH: "Asia/Manila", ID: "Asia/Jakarta", MX: "America/Mexico_City", BR: "America/Sao_Paulo", AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago", CO: "America/Bogota",
};

/** The IANA zone for a country code; UTC when unknown or empty. */
export const tzOf = (country?: string | null): string => TZ[(country ?? "").toUpperCase()] ?? "UTC";

const fmts = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD of a timestamp (ms) in a time zone ("UTC" by default, which is what TMDB air dates are written in). */
export function dayIn(t: number, tz = "UTC"): string {
  let f = fmts.get(tz);
  if (!f) {
    try { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); }
    catch { f = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }); }
    fmts.set(tz, f);
  }
  return f.format(new Date(t));
}

/** Today's date (YYYY-MM-DD) for a user in `country`. */
export const todayFor = (country?: string | null, now = Date.now()): string => dayIn(now, tzOf(country));
