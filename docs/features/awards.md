# Awards

> Moved verbatim out of CLAUDE.md so sessions only read it when they touch this feature.

- Awards come from Wikidata (no key), looked up by the title's IMDb id (`src/lib/awards.ts`, cached a week); failures show nothing. `AwardChips` is the compact header summary, `AwardsSection` the full list (`components/Awards.tsx`).

## Summary rule (moved from CLAUDE.md)

- Awards come from Wikidata by IMDb id (`src/lib/awards.ts`, cached a week); failures show nothing. Details: `docs/features/awards.md` (read before changing this feature).
