# Segment 2 — Pipeline: specs, listing, unit page

Status: **done for demo scope** (2026-10-27). Depends on: Segment 1.

Goal: upload → keyframes → specs JSON → bilingual listing on a unit page.

Done:
- Pipeline `scripts/run-unit.ts` on 3 real videos in `public/demo` (`full` furnished, `empty1/empty2` semifinished — bare shell, raw ceiling/brick, glass facade; correction: not "nearly finished").
- Outputs copied to `public/demo/<slug>/` (real/empty/fit-*) and `data/seed/<slug>-{specs,listing}.json`.
- Unit page `/units/[slug]`: real vs emptied vs fit renders (fit = AI concept, labeled), specs card, bilingual AR default / EN toggle.
- DB now Neon Postgres: `lib/db/schema.sql` (8 tables), `lib/db/pg.ts` pooled app / direct migrations, `scripts/migrate.ts` + `scripts/seed.ts` run (3 units, 147 hourly slots). JSON store removed.

Not done / next:
- Owner upload UI + live ingest (S0/S1 in browser) — demo uses precomputed units. Next segment if time.
- Specs owner-edit form.

Decisions: hero-frame-only staging; per-unit owner in `lib/meta/prompts.ts` (`kind` authoritative — bare units never called furnished).
Handoff: start a fresh session from `docs/PLAN.md`; env needs `DATABASE_URL` (direct) + `DATABASE_URL_POOLED`.
