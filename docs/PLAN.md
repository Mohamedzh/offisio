# Offisio — Implementation Plan (index)

Status: **Segment 6 (judge-ready) in progress — 6.1–6.6 done and committed through `d58d02a` (2026-10-31: review rounds 3–4, multi-room fits, styling pass); 6.7 steps 1–2 (location, QStash pipeline jobs) done 2026-10-31, deployed and verified on production; next session starts at [plan/06-judge-ready.md](plan/06-judge-ready.md) Handoff (6.7 step 3 brand-menu import), then 6.8 (WhatsApp channel), 6.9 (Clerk, stretch).** Segment 5 steps 1–3 are done; its steps 4–8 are superseded by Segment 6.

Work is split into segments so each runs in a fresh chat session with a small context. Protocol: [plan/README.md](plan/README.md).

| Segment | File | Status | Depends on |
|---|---|---|---|
| 0. Foundation & scaffold | [plan/00-foundation.md](plan/00-foundation.md) | done (Next 16 scaffold, TS, Tailwind) | DESIGN approved |
| 1. Capability tests (SAM 3.1, Muse Image) | [plan/01-capability-tests.md](plan/01-capability-tests.md) | **done** — SAM dropped (future consideration) | 0 |
| 2. Pipeline: specs + listing + unit page | [plan/02-pipeline-listing.md](plan/02-pipeline-listing.md) | **done** (demo scope; upload UI next) | 1 |
| 3. Staging: removal + restyle | [plan/03-staging.md](plan/03-staging.md) | **done** | 1 |
| 4. Booking agent + chat (+ payments, add-ons) | [plan/04-booking-agent.md](plan/04-booking-agent.md) | **done** (demo scope) | 2 |
| 5. Seed, polish, demo, submit | [plan/05-demo-polish.md](plan/05-demo-polish.md) | steps 1–3 done; rest superseded by 6 | 2–4 |
| 6. Judge-ready: demo data, staging, agent, guardrails, ship | [plan/06-judge-ready.md](plan/06-judge-ready.md) | **in progress**: 6.1–6.6 done (docs, dates, guardrails, rubric, agent, staging and v3 demo data); 6.7 steps 1–2 done; next is 6.7 step 3 | 2–5 |

Done 2026-10-27 to 10-29 (evidence in [plan/05-demo-polish.md](plan/05-demo-polish.md)):
- Hosted payment checkout: built 2026-10-27 on Paymob, **switched to XPay 2026-10-29** (`lib/xpay.ts`, Checkout Sessions API, test key; `payments.xpay_session_id` migrated on Neon 2026-10-29). Booking confirms only on signature-verified payment webhook. Locally verified: paid -> confirmed, failed -> payment_failed + slots released, bad/stale signature 401.
- `[lang]` i18n: `app/[lang]/` routes, `proxy.ts` default, dictionaries + helpers in `lib/i18n/`, default locale `en`.
- `.env.example` tracked (`!.env.example` in `.gitignore`); payment keys live in the payment dashboard (Developer > API Keys / Webhooks); env names in `.env.example`.

Done 2026-10-27 (upload slice, uncommitted): owner upload UI + live ingest at `/[lang]/upload` (browser keyframes → S3 specs + S4 listing via `lib/pipeline/`), specs owner-edit form, runtime frame serving via `app/uploads/[slug]/[file]/route.ts`. Live-verified end to end; smoke data cleaned. Auth deferred by owner decision. Detail: [plan/05-demo-polish.md](plan/05-demo-polish.md).

Open items — **superseded 2026-10-29 by [plan/06-judge-ready.md](plan/06-judge-ready.md)** (kept for history). Former list, the **final consolidated plan** (2026-10-28, main plan + expansion merged; full detail in [plan/05-demo-polish.md](plan/05-demo-polish.md) "Final consolidated plan"):
1. ~~Commit + deploy current work~~ **Done 2026-10-28** (`01ea137` + `c397046`, pushed by owner).
2. ~~Generated listings batch~~ **Done 2026-10-28** (6 units `gen-zamalek`, `gen-heliopolis`, `gen-new-cairo`, `gen-nasr-city`, `gen-alex-chatby`, `gen-alex-louran`; synthetic-labelled, titles/prices correct, all pages + 36 Blob URLs 200 — see 05). **← next session starts at step 3**
3. ~~Payment test-card run (success + declined) on a daily-bookable unit~~ **Done 2026-10-29** - live on the deployed site: approved card auto-confirmed via signature-verified webhook, declined card stayed unconfirmed, test data cleaned (detail in 05). The previous gateway was removed from code, schema, env, and docs after its test integration proved unusable.
4. Location pin + nearby cafes: maps link per unit, Overpass cafes with curated fallback/menu, chat add-ons per unit. **Migration APPROVED (2026-10-28):** implementation adds `units.lat/lng`, runs `pnpm migrate`, verifies (see 05).
5. QStash simulated cafe order status — **APPROVED 2026-10-28**; `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` added to `.env.local` + `.env.example` (example edit uncommitted — commit it; also set in Vercel env). Set `CAFE_WHATSAPP_NUMBER` + `NEXT_PUBLIC_APP_URL` in Vercel env too.
6. Restage on upload (S5/S6 re-runnable step) + seeded-unit restage/drift check.
7. 10 scripted Egyptian-Arabic chat conversations (Segment 4 acceptance, not yet fully run).
8. Cold deployed demo run by someone else, README, demo video by Nov 3. (README "Testing (for judges)" section with the test card + guided flows added 2026-10-29; final cold run + video still pending.)
Deferred: WhatsApp location capture, photo-geolocation, computer-use ordering (assessed in 05 "Expansion notes" — do not build before Nov 4).

Env contract (`.env.local`, never committed; template `.env.example` is tracked): `META_API_KEY`, `DATABASE_URL` (direct, migrations), `DATABASE_URL_POOLED` (app), `BLOB_READ_WRITE_TOKEN`, `XPAY_SECRET_KEY`, `XPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `CAFE_WHATSAPP_NUMBER`. Added in 6.3: `GUARD_SALT` (set it in Vercel too), optional `DEMO_DAILY_SPEND_USD`, and the dev-only `OFFISIO_DEV_MODELS` + `MODAL_SPARK_URL`/`MODAL_KEY`/`MODAL_SECRET` (never set in Vercel). Added in 6.7: `QSTASH_URL`/`QSTASH_TOKEN`/`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` (pipeline delivery; set in Vercel 2026-10-31 by owner), `GOOGLE_PLACES_API_KEY` (step 4). Planned: `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` (6.8), Clerk keys (6.9, stretch).

i18n (implemented 2026-10-27): routes under `app/[lang]/` (`ar`|`en`, two variants per page); `proxy.ts` redirects unprefixed paths to the cookie locale else default `en` (`defaultLocale`, changed from `ar` 2026-10-27) and strips legacy `?lang=`; root layout is `app/[lang]/layout.tsx` (`<html lang dir>`, `generateStaticParams`, invalid lang → 404). UI strings in `lib/i18n/ar.json` + `lib/i18n/en.json` (identical keys); helpers in `lib/i18n/index.ts` (`getT`, `dirFor`, `localeHref`, `switchLocalePath`, `formatEgp`); `LangToggle` swaps the path prefix and saves the cookie. DESIGN §8 stated bilingual/RTL + root `lang`/`dir` switch but never specified translation files/helpers — this is that missing spec. DB content stays `*_ar`/`*_en`; API routes stay unprefixed under `app/api`.

Cut order: voice (U5) first, then owner upload UI, then hourly pricing (Phase 2 by decision).

Deadline: Wed Nov 4, 9:00 PM ET. Demo video (3 min) recorded no later than Nov 3, leaving Nov 4 as buffer.
