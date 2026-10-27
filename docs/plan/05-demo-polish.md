# Segment 5 — Seed, polish, demo, submit

Status: **in progress** (started 2026-10-27) · Depends on: Segments 2–4

Goal: 4–5 polished seeded units, demo loop reliable end to end on the deployed preview, 3-minute demo video, public repo submitted before Nov 4, 9:00 PM ET.

Scope: seeding from owned footage (3-desk office, meeting room, + re-shoots/angles as separate units), RTL/LTR polish, before/after slider polish, README "Built during the hackathon", demo script + recording (Nov 3 latest).
Not in scope: new features. Anything new here goes through the cut list in [PLAN.md](../PLAN.md) first.

Tasks: _detailed at Checkpoint 2._
Acceptance: full demo path run cold on preview by someone other than the builder; video recorded; repo public with no secrets.

## Progress (2026-10-27, staged in git — NOT committed)

- **Paymob Unified Checkout (done, live-verified):** `lib/paymob.ts` uses the Intention API (`POST /v1/intention/`, `Authorization: Token PAYMOB_SECRET_KEY`, `special_reference` = booking ID) and returns `https://accept.paymob.com/unifiedcheckout/?publicKey=…&clientSecret=…`. Keys: `PAYMOB_SECRET_KEY`, `NEXT_PUBLIC_PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, plus `PAYMOB_INTEGRATION_ID` (owner added it; Unified still requires existing integration IDs as `payment_methods` — only the iframe/API-key flow is gone; optional `PAYMOB_WALLET_INTEGRATION_ID`). `payments.paymob_intention_id` added in `lib/db/schema.sql` (+ idempotent ALTER) and migrated on Neon. Checkout route returns `checkout_url`; webhook confirms ONLY on HMAC (verification needs just the HMAC secret) and resolves the booking via `special_reference`/payments. Live evidence (prod build, ephemeral port, server stopped after): booking `201` → checkout `200` with a real intention URL → bad-HMAC webhook `401` (booking stayed `awaiting_payment`) → valid-HMAC webhook `200` → booking `confirmed`. Before the integration ID arrived, checkout honestly returned `503 PAYMOB_NOT_CONFIGURED`.
- **`[lang]` i18n (done, live-verified):** all pages moved to `app/[lang]/` (`[lang]`, `[lang]/units/[slug]`, `[lang]/chat`, `[lang]/booking/[id]`); root layout `app/[lang]/layout.tsx` sets `<html lang dir>` from the param (`generateStaticParams`, invalid → 404). `proxy.ts` redirects unprefixed paths to the `offisio-lang` cookie locale, else `defaultLocale` — **now `en`** (owner decision 2026-10-27; was `ar`); legacy `?lang=` converts to the prefix. Dictionaries `lib/i18n/ar.json`/`en.json` (57 keys, parity type-checked), helpers `lib/i18n/index.ts` (`getT`, `dirFor`, `localeHref`, `switchLocalePath`, `formatEgp`), `lib/i18n/server.ts#localeFromParam`, `components/LangToggle.tsx`. Verified: `/` → `307 /en`, `/ar` is `lang="ar" dir="rtl"`, cookie `ar` still wins over the default. DESIGN §8 stated bilingual/RTL + root switch but never specified files/helpers — that spec now lives in [PLAN.md](../PLAN.md).
- **Env tracking:** `.env.example` rewritten for Unified Checkout and git-tracked (`!.env.example`); `.env.local` still ignored. Unused stale `PAYMOB_API_KEY` remains in `.env.local` — safe to delete.
- Gates: `pnpm migrate` (8 tables), `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass. No commit made — owner reviews the staged diff.

## Decisions

- Unified Checkout over classic iframe flow; integration ID is still required by Paymob (verified by live `404 Integration ID/Name does not exist` when a placeholder was sent).
- Default locale `en` (overrides DESIGN's Arabic-default wording; Arabic remains a full RTL variant).
- No i18n library dependency; DB content stays `*_ar`/`*_en` columns; API routes stay unprefixed.

## Next steps (in order)

1. Commit staged work (split: env tracking / Paymob Unified / `[lang]` i18n), clear messages per AGENTS.md.
2. Owner upload UI + live ingest (Segment 2 remainder): `/[lang]/upload` per DESIGN §8, then specs owner-edit form. This is the biggest remaining gap — the core app is still a skeleton.
3. Set real `CAFE_WHATSAPP_NUMBER` and `NEXT_PUBLIC_APP_URL` in `.env.local` (and later Vercel) so deployed Paymob webhooks/redirection work.
4. Run the 10 scripted Egyptian-Arabic chat conversations (Segment 4 acceptance).
5. Restage re-run + asset drift check; before/after slider polish (DESIGN centrepiece).
6. Deploy preview (Vercel + Neon/Paymob env), cold end-to-end demo run, README update, demo video by Nov 3.

Handoff: fresh session reads `AGENTS.md`, `docs/PLAN.md`, this file only. Run `pnpm dev` (or `pnpm build && pnpm start`); DB already migrated/seeded — do not re-seed unless on a new Neon project.
