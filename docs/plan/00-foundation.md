# Segment 0 — Foundation & scaffold

Status: stub · Depends on: DESIGN approved

Goal: Next.js app with `lib/meta` client, Neon DB schema, and an empty pipeline with stubbed steps, running locally and on Vercel preview.

Scope: scaffold, env handling, DB migrations, stub pipeline steps, README setup.
Not in scope: any real Meta call, any UI beyond a health page.

Tasks: _detailed at Checkpoint 2._
Acceptance: `pnpm lint`, `pnpm typecheck`, `pnpm build` pass; preview deploy loads.

Decisions: Neon for Postgres. `neon` + `neon-postgres` skills installed Oct 26 on Node 22.22.0 inside the repo (`.agents/skills/`, `skills-lock.json`); Neon itself is used via `DATABASE_URL`.
Handoff: —
