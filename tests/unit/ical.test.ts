import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, escapeText, eventUid, fold, icsFileName, nextDay, utcStamp } from "../../src/lib/ical";
import { eventFor, rowBadge } from "../../src/lib/upcoming";
import { pickRelease, releaseByCountry, releaseFor } from "../../src/lib/release-dates";

const STAMP = Date.UTC(2026, 10, 9, 12, 0, 0);

test("escapeText escapes backslash, semicolon, comma and newlines", () => {
  assert.equal(escapeText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
});

test("fold: lines over 75 octets continue after CRLF + space, and a multi-byte character is never split", () => {
  const long = "SUMMARY:" + "é".repeat(100);
  const folded = fold(long);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(new TextEncoder().encode(l).length <= 75, l.length + " chars");
  assert.ok(lines.slice(1).every((l) => l.startsWith(" ")));
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(""), long);
  assert.equal(fold("short"), "short");
});

test("all-day event: DTSTART/DTEND are dates, end is the next day, across month and year ends", () => {
  const out = buildCalendar([{ uid: "u1", summary: "Dune", date: "2026-12-31" }], { stamp: STAMP });
  assert.match(out, /DTSTART;VALUE=DATE:20261231\r\n/);
  assert.match(out, /DTEND;VALUE=DATE:20270101\r\n/);
  assert.match(out, /TRANSP:TRANSPARENT/);
  assert.equal(nextDay("2028-02-28"), "2028-02-29");
});

test("timed event is written in UTC with an end", () => {
  const out = buildCalendar([{ uid: "u2", summary: "Premiere", startUtc: Date.UTC(2026, 11, 18, 19, 30), minutes: 90 }], { stamp: STAMP });
  assert.match(out, /DTSTART:20261218T193000Z\r\n/);
  assert.match(out, /DTEND:20261218T210000Z\r\n/);
  assert.equal(utcStamp(STAMP), "20261109T120000Z");
});

test("calendar frame: CRLF everywhere, escaped text, feed hints, bad events skipped", () => {
  const out = buildCalendar([{ uid: "u3", summary: "A, B; C", date: "2026-12-01", description: "line1\nline2" }, { uid: "bad", summary: "x" }], { stamp: STAMP, name: "Typecast", feed: true });
  assert.ok(out.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(out.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(out));
  assert.match(out, /SUMMARY:A\\, B\\; C/);
  assert.match(out, /DESCRIPTION:line1\\nline2/);
  assert.match(out, /REFRESH-INTERVAL;VALUE=DURATION:PT12H/);
  assert.equal((out.match(/BEGIN:VEVENT/g) ?? []).length, 1);
});

test("UID is stable for the same title/episode and differs between episodes", () => {
  assert.equal(eventUid("movie", 603), "film-603@typecast");
  assert.equal(eventUid("tv", 1396, 5, 1), eventUid("tv", 1396, 5, 1));
  assert.notEqual(eventUid("tv", 1396, 5, 1), eventUid("tv", 1396, 5, 2));
  const a = eventFor({ type: "tv", id: 1396, title: "Breaking Bad", date: "2026-12-01", kind: "episode", code: "S5 E2", epName: "Madrigal", approx: false, svc: "Netflix" });
  assert.equal(a.uid, "tv-1396-s5e2@typecast");
  assert.equal(a.summary, "Breaking Bad S5 E2");
  assert.match(a.description!, /“Madrigal” on Netflix/);
});

test("file names are safe", () => {
  assert.equal(icsFileName("Dune: Part Three!"), "dune-part-three.ics");
  assert.equal(icsFileName("映画"), "typecast.ics");
});

test("release dates: theatrical beats digital beats physical; premieres ignored; fallback to primary", () => {
  const rd = (type: number, d: string) => ({ type, release_date: d + "T00:00:00.000Z" });
  assert.equal(pickRelease([rd(1, "2026-01-01"), rd(4, "2026-12-20"), rd(3, "2026-12-17"), rd(2, "2026-12-10")]), "2026-12-10");
  assert.equal(pickRelease([rd(5, "2027-02-01"), rd(4, "2026-12-20")]), "2026-12-20");
  assert.equal(pickRelease([rd(1, "2026-01-01")]), "");
  assert.equal(pickRelease(undefined), "");
  const by = releaseByCountry([{ iso_3166_1: "GB", release_dates: [rd(3, "2026-12-17")] }, { iso_3166_1: "FR", release_dates: [rd(1, "2026-12-01")] }]);
  assert.deepEqual(by, { GB: "2026-12-17" });
  assert.equal(releaseFor(by, "GB", "2026-12-18"), "2026-12-17");
  assert.equal(releaseFor(by, "FR", "2026-12-18"), "2026-12-18");
  assert.equal(releaseFor(undefined, "US", ""), "");
});

test("row badge wording", () => {
  const T = "2026-11-09"; // Monday
  const film = (date: string, approx = false) => ({ date, kind: "film" as const, code: null, approx });
  const ep = (date: string, code: string) => ({ date, kind: "episode" as const, code, approx: false });
  assert.deepEqual(rowBadge(film("2026-11-13"), T), { text: "Out Fri", soon: false });
  assert.deepEqual(rowBadge(film("2026-11-09"), T), { text: "Out today", soon: true });
  assert.deepEqual(rowBadge(film("2026-11-10"), T), { text: "Out tomorrow", soon: true });
  assert.equal(rowBadge(film("2026-12-18"), T)?.text, "Out 18 Dec");
  assert.equal(rowBadge(film("2027-12-18"), T)?.text, "Out 18 Dec 2027");
  assert.equal(rowBadge(film("2027-03-01", true), T)?.text, "Out Mar 2027");
  assert.equal(rowBadge(ep("2026-11-21", "S5 E1"), T)?.text, "S5 in 12 days");
  assert.equal(rowBadge(ep("2026-11-12", "S5 E3"), T)?.text, "S5 E3 Thu");
  assert.equal(rowBadge(film("2026-11-01"), T), null);
});
