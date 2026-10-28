# Offisio — Implementation Plan (index)

Status: **Segments 1–5 in progress; consolidated step 2 (generated listings batch) done 2026-10-28 — 6 synthetic `gen-*` units live in Neon/Blob, badge code committed with this update. Final consolidated plan (with expansion) is in [plan/05-demo-polish.md](plan/05-demo-polish.md); QStash approved + env vars added 2026-10-28; `units.lat/lng` migration APPROVED 2026-10-28 (implementation applies + verifies it).** Next session: start here, then [plan/05-demo-polish.md](plan/05-demo-polish.md), beginning at consolidated step 3 (Paymob test-card run, owner runs the dashboard test card) — nothing else unless named.

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

Open items — **final consolidated plan** (2026-10-28, main plan + expansion merged; full detail in [plan/05-demo-polish.md](plan/05-demo-polish.md) "Final consolidated plan"):
1. ~~Commit + deploy current work~~ **Done 2026-10-28** (`01ea137` + `c397046`, pushed by owner).
2. ~~Generated listings batch~~ **Done 2026-10-28** (6 units `gen-zamalek`, `gen-heliopolis`, `gen-new-cairo`, `gen-nasr-city`, `gen-alex-chatby`, `gen-alex-louran`; synthetic-labelled, titles/prices correct, all pages + 36 Blob URLs 200 — see 05). **← next session starts at step 3**
3. Paymob test-card run (success + declined) on a daily-bookable unit.
4. Location pin + nearby cafes: maps link per unit, Overpass cafes with curated fallback/menu, chat add-ons per unit. **Migration APPROVED (2026-10-28):** implementation adds `units.lat/lng`, runs `pnpm migrate`, verifies (see 05).
5. QStash simulated cafe order status — **APPROVED 2026-10-28**; `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` added to `.env.local` + `.env.example` (example edit uncommitted — commit it; also set in Vercel env). Set `CAFE_WHATSAPP_NUMBER` + `NEXT_PUBLIC_APP_URL` in Vercel env too.
6. Restage on upload (S5/S6 re-runnable step) + seeded-unit restage/drift check.
7. 10 scripted Egyptian-Arabic chat conversations (Segment 4 acceptance, not yet fully run).
8. Cold deployed demo run by someone else, README, demo video by Nov 3.
Deferred: WhatsApp location capture, photo-geolocation, computer-use ordering (assessed in 05 "Expansion notes" — do not build before Nov 4).

Env contract (`.env.local`, never committed; template `.env.example` is tracked): `META_API_KEY`, `DATABASE_URL` (direct, migrations), `DATABASE_URL_POOLED` (app), `PAYMOB_SECRET_KEY`, `NEXT_PUBLIC_PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID`, `NEXT_PUBLIC_APP_URL`, `CAFE_WHATSAPP_NUMBER`.

i18n (implemented 2026-10-27): routes under `app/[lang]/` (`ar`|`en`, two variants per page); `proxy.ts` redirects unprefixed paths to the cookie locale else default `en` (`defaultLocale`, changed from `ar` 2026-10-27) and strips legacy `?lang=`; root layout is `app/[lang]/layout.tsx` (`<html lang dir>`, `generateStaticParams`, invalid lang → 404). UI strings in `lib/i18n/ar.json` + `lib/i18n/en.json` (identical keys); helpers in `lib/i18n/index.ts` (`getT`, `dirFor`, `localeHref`, `switchLocalePath`, `formatEgp`); `LangToggle` swaps the path prefix and saves the cookie. DESIGN §8 stated bilingual/RTL + root `lang`/`dir` switch but never specified translation files/helpers — this is that missing spec. DB content stays `*_ar`/`*_en`; API routes stay unprefixed under `app/api`.

Cut order: voice (U5) first, then owner upload UI, then hourly pricing (Phase 2 by decision).

Deadline: Wed Nov 4, 9:00 PM ET. Demo video (3 min) recorded no later than Nov 3, leaving Nov 4 as buffer.
