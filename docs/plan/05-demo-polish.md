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

## Progress (2026-10-27, upload slice — uncommitted, owner reviews diff)

- **Owner upload UI + live ingest (done, live-verified):** `/[lang]/upload` owner form (district, rent, daily rent, floor, available-from, kind) + browser keyframe extraction (`components/UploadForm.tsx`, `<video>`+canvas, 6–10 JPEGs, hero pick). `POST /api/units/upload` validates, writes frames to `public/uploads/<slug>/`, runs specs (S3) + listing (S4) via `lib/pipeline/specs-listing.ts` (`meta.product`, validated, one retry), seeds 7 days × 10:00–17:00 availability, marks unit `ready`. Specs owner-edit at `/[lang]/units/[slug]/edit` + `POST /api/units/specs` (sets `owner_edited=true`). Runtime-written `public/` files are served by `app/uploads/[slug]/[file]/route.ts` (Next prod does not serve them statically); `public/uploads/` is gitignored. Verified on `pnpm start`: `/en|/ar/upload` 200 (RTL ok), empty upload 400, specs unknown slug 404, live ingest with a real frame 201 → unit page 200 → image 200 `image/jpeg` → specs edit persisted. Smoke unit + files deleted after (Neon back to 3 seeded units). Gates: lint/typecheck/build pass.
- Decisions: no auth (deferred by owner); no new dependency — local-disk frame storage for now, **Vercel Blob is required at deploy step** (`BLOB_READ_WRITE_TOKEN` unset); restage/empty renders NOT run on upload yet (next slice, re-runnable step).

## Progress (2026-10-27, Torn Layers redesign — uncommitted)

- **All pages remade in Impeccable "Torn Layers"** (décollage poster wall; owner picked it over broker-sheet/café-receipt after a concept-seed roll; PRODUCT.md captured, code-led). Tokens in `app/globals.css`, Cairo display via `next/font/google`, fibrous torn-edge mask `public/torn-edge.jpg` (generated, prompt embedded), UnitViewer tear-reveal signature. System recorded in root [DESIGN.md](../../DESIGN.md) + `.impeccable/design.json`; brief in `.impeccable/surfaces/`. Verified: lint/typecheck/build 0, detector `[]`, Playwright captures AR+EN desktop/mobile incl. fit-switch click; finish reviewer first round `fix` (7 items, all applied; verdict pass by direct capture inspection, AR-mobile-unit recapture partial). Impeccable skill installed at `.agents/skills/impeccable` and **gitignored** (local tooling only, never committed).

## Progress (2026-10-28, Blob storage + homepage — committed & deployed)

- **Vercel Blob for all media (done, live-verified):** `@vercel/blob`; demo assets via `pnpm upload-demo` → `demo/<unit>/...` + 720p `walkthrough.mp4`; browser-direct uploads via `/api/blob/upload` (`handleUpload`, jpeg ≤5 MB, video ≤200 MB) → `/api/units/upload` (JSON URLs only, `kind:"video"` row); pipeline outputs via `put()`; `imageEdit` accepts URLs. Old `app/uploads/[slug]/[file]` route deleted. No AI prompt/model/schema changes.
- **Bug fixed:** Neon held legacy `/demo/...` rows and Blob rows both `is_current=true`; unordered first-match reader served local paths (404 on Vercel). Reader now prefers https URLs; seed retires non-https rows and upserts Blob rows. Re-seeded: 13 local rows retired, every current row is a Blob URL.
- **Homepage (done, live):** hero + fit explainer use two `muse-image-1.0` paper-collage illustrations (`public/home/`, `pnpm generate-home-art`), always badged "Decorative illustration — not a real listing" (AR+EN); listings section uses media-table photos only.
- **Live check 2026-10-28 (`https://offisio.vercel.app/en`):** `/en`, `/ar`, all 3 unit pages, `/upload`, `/chat` → 200; 16/16 Blob image/video URLs → 200; zero local listing image sources; one full live upload (frames→hero→Blob→specs/listing) passed end to end on the local prod build, test unit + blobs deleted after. Impeccable critique snapshot: `.impeccable/critique/2026-10-28T14-43-23Z__app-lang-page-tsx.md` (15/28 heuristics).
- **Critique next steps (from that snapshot):** P1 varied seed districts/prices (all Cairo/EGP 10k reads fake); P1 spec line on listing cards (area/desks/floor); P1 single renter CTA above fold, owner CTA demoted; P2 Real/Emptied labels + factual alt on featured card; P2 mobile headline balance + header wrap; demote featured image from `priority`.
- **Top-3 P1 fixes (done 2026-10-28, owner chose "all at once"; uncommitted, needs deploy):** spec line on featured + grid cards (`~area m² · N desks · floor` from specs JSON); seed districts/prices varied (Maadi EGP 14,500 · Nasr City EGP 8,500 · New Cairo EGP 11,000, distinct floors) and `pnpm upload-demo` + `pnpm seed` re-run against real Blob/Neon — live home already shows the new districts/prices; hero now has one button (Browse) with Chat as text link, header List demoted to a text link, owner block added at page bottom. Verified: typecheck/build/lint pass; local prod + live pages 200; 18/18 Blob URLs 200; full live UploadForm upload on offisio.vercel.app (6 frames + hero + source.mp4 as `kind:"video"`) completed to a ready unit whose video played (poster = hero, 30 presented frames, ~61 FPS); test unit + blobs deleted after. Deploy note: no Vercel CLI/token/link in this workspace and changes are uncommitted — commit + push to deploy the homepage code; DB-side seed changes are already live.

## Next steps (in order)

1. Commit the upload slice + Torn Layers redesign (logical commits), clear messages per AGENTS.md.
2. Restage on upload: run S5 empty + S6 fits for the hero frame as a separate re-runnable step (button/API), so uploaded units get the before/after + fit views; before/after slider polish.
3. Set real `CAFE_WHATSAPP_NUMBER` and `NEXT_PUBLIC_APP_URL` in `.env.local` (and later Vercel) so deployed Paymob webhooks/redirection work.
4. Run the 10 scripted Egyptian-Arabic chat conversations (Segment 4 acceptance).
5. Restage re-run + asset drift check on seeded units.
6. Deploy preview (Vercel + Neon/Paymob env + Blob for uploads), cold end-to-end demo run, README update, demo video by Nov 3.

Handoff: fresh session reads `AGENTS.md`, `docs/PLAN.md`, this file only. Run `pnpm dev` (or `pnpm build && pnpm start`); DB already migrated/seeded — do not re-seed unless on a new Neon project.
