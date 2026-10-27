# Offisio — Implementation Plan (index)

Status: **Segments 1–4 done for demo scope (2026-10-27).** App runs end-to-end on Neon + Paymob test mode (owner keys pending). Next session: start here, then the active segment file — nothing else unless named.

Work is split into segments so each runs in a fresh chat session with a small context. Protocol: [plan/README.md](plan/README.md).

| Segment | File | Status | Depends on |
|---|---|---|---|
| 0. Foundation & scaffold | [plan/00-foundation.md](plan/00-foundation.md) | done (Next 16 scaffold, TS, Tailwind) | DESIGN approved |
| 1. Capability tests (SAM 3.1, Muse Image) | [plan/01-capability-tests.md](plan/01-capability-tests.md) | **done** — SAM dropped (future consideration) | 0 |
| 2. Pipeline: specs + listing + unit page | [plan/02-pipeline-listing.md](plan/02-pipeline-listing.md) | **done** (demo scope; upload UI next) | 1 |
| 3. Staging: removal + restyle | [plan/03-staging.md](plan/03-staging.md) | **done** | 1 |
| 4. Booking agent + chat (+ Paymob, add-ons) | [plan/04-booking-agent.md](plan/04-booking-agent.md) | **done** (demo scope) | 2 |
| 5. Seed, polish, demo, submit | [plan/05-demo-polish.md](plan/05-demo-polish.md) | **next** | 2–4 |

Open items for Segment 5 / next session (in order):
1. Owner adds `PAYMOB_*` test keys + real `CAFE_WHATSAPP_NUMBER` to `.env.local` → one real test-card checkout end-to-end.
2. 10 scripted Egyptian-Arabic chat conversations (incl. slot-taken, no-results) — Segment 4 acceptance not yet fully run.
3. Owner upload UI + live ingest (Segment 2 remainder); specs owner-edit form.
4. Single-style restage re-run in `scripts/run-unit.ts`; replace any drifted demo asset.
5. Deploy preview (Vercel) + Neon env there; demo video by Nov 3.

Env contract (`.env.local`, never committed): `META_API_KEY`, `DATABASE_URL` (direct, migrations), `DATABASE_URL_POOLED` (app), `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET`, `CAFE_WHATSAPP_NUMBER`.

Cut order: voice (U5) first, then owner upload UI, then hourly pricing (Phase 2 by decision).

Deadline: Wed Nov 4, 9:00 PM ET. Demo video (3 min) recorded no later than Nov 3, leaving Nov 4 as buffer.
