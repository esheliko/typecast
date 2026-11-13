## What and why
<!-- One change per PR. What changed, and why. -->

## Checks
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
- [ ] `npm run build` run if I touched `next.config.ts`, `proxy.ts`, `public/sw.js`, route/page exports or layouts
- [ ] Smoke step / unit test added for new pages or pure logic

## Merge rule
Squash-merge only when `verify` is green on this PR's latest commit. A merge queues the change for the Deploy Manager; do not deploy by hand (`[deploy-now]` in the squash message only for a real hotfix). Keep the `Claude-Session:` trailer if one was used.
