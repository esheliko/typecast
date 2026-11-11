# Glimpse (the profile-card button)

The button beside every title, cast row and credit opens one panel: **About** (words) on top, **Images** below. Icon: a framed face with lines of text and a spark (`GlimpseButton` in `components/Glimpse.tsx`); it is no longer a photo stack because the panel is more than pictures.

**What About shows** (server: `lib/glimpse-data.ts` `loadAbout`, route `/api/glimpse/info`; pure text work in `lib/glimpse-info.ts`, unit tested)
- Actor + title (cast row on a title, a credit on a person's page, a person opened from a title, a Watching-now timeline row): the **character** (a short note from the title's Wikipedia cast list, `characterBlurb`; no AI), **which episodes** they were in and **when** (series: `getAppearances` from TMDB `/credit/{id}`; a regular is listed by season with air dates), and the images of them in the role. The credit ids come from the person's TMDB credits on the server, so callers pass only ids (`pid`, title `key`).
- Title only: its summary (TMDB overview) and a facts line. Person only: life line and a short biography.
- No character note found (Wikipedia blocked/slow, or the cast list is on another article): the panel says so and falls back to the title summary. A slow Wikipedia answer is skipped after 5 s (it is cached for next time).

**Specs** (`lib/glimpse.ts`): `GlimpseSpec.info` = `{key, pid, char, clip, nospoil, hide}`; no ids means images only. Builders take the ids: `titleSpec` (title `key` or `id`), `personSpec(name, dept, pid)`, `castSpec(..., pid)`, `creditSpec(actor, role, title, pid)`, `personInTitleSpec(..., pid)`. Add the ids when you add a new button.

**Spoilers (Watching now).** Wrap the spec in `scopeSpec(spec, {key, title, clip, spoilers})` (`PersonNode` does). With No spoilers on: the character note is one sentence, biographies drop sentences naming the watched show or talking about seasons/episodes, title facts drop season counts and "ended". For the watched show itself the episode list, season list and counts stop at the position (`clip`, via `inScope`); seasons-only rows say "Episodes 1-8" for the current season. Spoilers allowed or outside /watching: everything. The image searches are not filtered.
