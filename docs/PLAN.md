# Offisio — Implementation Plan (index)

Status: **Segments 1–4 done for demo scope; Paymob Unified + `[lang]` i18n done & live-verified (2026-10-27).** Next session: start here, then [plan/05-demo-polish.md](plan/05-demo-polish.md) — nothing else unless named. **All 2026-10-27 work below is staged in git, NOT committed** (`git status` shows it; commit it first, small commits per AGENTS.md).

Work is split into segments so each runs in a fresh chat session with a small context. Protocol: [plan/README.md](plan/README.md).

| Segment | File | Status | Depends on |
|---|---|---|---|
| 0. Foundation & scaffold | [plan/00-foundation.md](plan/00-foundation.md) | done (Next 16 scaffold, TS, Tailwind) | DESIGN approved |
| 1. Capability tests (SAM 3.1, Muse Image) | [plan/01-capability-tests.md](plan/01-capability-tests.md) | **done** — SAM dropped (future consideration) | 0 |
| 2. Pipeline: specs + listing + unit page | [plan/02-pipeline-listing.md](plan/02-pipeline-listing.md) | **done** (demo scope; upload UI next) | 1 |
| 3. Staging: removal + restyle | [plan/03-staging.md](plan/03-staging.md) | **done** | 1 |
| 4. Booking agent + chat (+ Paymob, add-ons) | [plan/04-booking-agent.md](plan/04-booking-agent.md) | **done** (demo scope) | 2 |
| 5. Seed, polish, demo, submit | [plan/05-demo-polish.md](plan/05-demo-polish.md) | **next** | 2–4 |

Done 2026-10-27 (evidence in [plan/05-demo-polish.md](plan/05-demo-polish.md)):
- Paymob Unified Checkout: Intention API in `lib/paymob.ts` (secret + public + HMAC + `PAYMOB_INTEGRATION_ID` as `payment_methods`; no iframe/API key), `payments.paymob_intention_id` migrated on Neon. Live on local build: checkout `200` → real `unifiedcheckout` URL; webhook bad HMAC `401`, valid HMAC `200` → booking `confirmed`.
- `[lang]` i18n: `app/[lang]/` routes, `proxy.ts` default, dictionaries + helpers in `lib/i18n/`, default locale `en`.
- `.env.example` tracked (`!.env.example` in `.gitignore`); stale `PAYMOB_API_KEY` in `.env.local` is unused, can be deleted.

Done 2026-10-27 (upload slice, uncommitted): owner upload UI + live ingest at `/[lang]/upload` (browser keyframes → S3 specs + S4 listing via `lib/pipeline/`), specs owner-edit form, runtime frame serving via `app/uploads/[slug]/[file]/route.ts`. Live-verified end to end; smoke data cleaned. Auth deferred by owner decision. Detail: [plan/05-demo-polish.md](plan/05-demo-polish.md).

Open items for Segment 5 / next session (in order):
1. Commit the upload slice.
2. Restage on upload (S5 empty + S6 fits as re-runnable step) + before/after slider polish.
3. Add real `CAFE_WHATSAPP_NUMBER` + set `NEXT_PUBLIC_APP_URL` (needed for Paymob notification/redirection URLs in deployed env).
4. 10 scripted Egyptian-Arabic chat conversations (incl. slot-taken, no-results) — Segment 4 acceptance not yet fully run.
5. Single-style restage re-run in `scripts/run-unit.ts`; replace any drifted demo asset.
6. Deploy preview (Vercel) + Neon/Paymob/Blob env there, cold full-demo run; demo video by Nov 3.

Env contract (`.env.local`, never committed; template `.env.example` is tracked): `META_API_KEY`, `DATABASE_URL` (direct, migrations), `DATABASE_URL_POOLED` (app), `PAYMOB_SECRET_KEY`, `NEXT_PUBLIC_PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID`, `NEXT_PUBLIC_APP_URL`, `CAFE_WHATSAPP_NUMBER`.

i18n (implemented 2026-10-27): routes under `app/[lang]/` (`ar`|`en`, two variants per page); `proxy.ts` redirects unprefixed paths to the cookie locale else default `en` (`defaultLocale`, changed from `ar` 2026-10-27) and strips legacy `?lang=`; root layout is `app/[lang]/layout.tsx` (`<html lang dir>`, `generateStaticParams`, invalid lang → 404). UI strings in `lib/i18n/ar.json` + `lib/i18n/en.json` (identical keys); helpers in `lib/i18n/index.ts` (`getT`, `dirFor`, `localeHref`, `switchLocalePath`, `formatEgp`); `LangToggle` swaps the path prefix and saves the cookie. DESIGN §8 stated bilingual/RTL + root `lang`/`dir` switch but never specified translation files/helpers — this is that missing spec. DB content stays `*_ar`/`*_en`; API routes stay unprefixed under `app/api`.

Cut order: voice (U5) first, then owner upload UI, then hourly pricing (Phase 2 by decision).

Deadline: Wed Nov 4, 9:00 PM ET. Demo video (3 min) recorded no later than Nov 3, leaving Nov 4 as buffer.
