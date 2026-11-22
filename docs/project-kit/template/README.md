# {{NAME}}

{{PURPOSE}}

Next.js 16 (App Router) + Supabase (email/password auth, RLS) + Vercel. Created from project-kit: the development cycle, rules and automation are described in `CLAUDE.md` and `DEPLOYING.md`.

## Run it locally
```bash
npm ci
cp .env.example .env.local   # fill in the Supabase URL and keys
npm run dev
```
Accounts are created by the owner in Supabase (Authentication > Users); public sign-up is off.

## Checks
```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run smoke
```
