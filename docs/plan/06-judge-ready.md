# Segment 6 — Judge-ready: demo data, staging coverage, agent, guardrails, ship

Status: **in progress** — 6.1–6.6 done and committed (through `d58d02a`, 2026-10-31). 6.7–6.10 re-planned 2026-10-31: next is 6.7 location + nearby places + menus, then 6.8 WhatsApp, 6.9 Clerk (stretch), 6.10 ship

Goal: the deployed demo holds up when judges use it unattended (Nov 5–8) on a fixed $150 credit budget. That means bookable dates, the staging headline on every listing, a correct agent, hard usage limits, and docs that match the code.

Supersedes [05-demo-polish.md](05-demo-polish.md) "Final consolidated plan" steps 4–8. Steps 1–3 there are done.

## Decisions (owner, 2026-10-29)

- Repo docs win over kickoff prompts; every conflict gets flagged.
- SAM 3.1 stays dropped. Staging means prompt-guided `muse-image-1.0` edits: an empty base, then 3 styles.
- **Video upload is allowed** (this replaces the kickoff rule "video never uploads"). The source video goes to Blob for playback. Keyframes are still extracted in the browser, and only frames reach the model.
- Default locale stays `en` for judges. Arabic stays a full RTL variant.
- XPay stays sandbox-only. Location stays minimal (6.7).
- D5 is revised: more staged units across more places and layouts (6.6).
- Open points resolved the same day:
  - **O1:** seeded units are pre-staged. A live upload gets the empty image plus one owner-picked style; the other styles render on click (cached, budgeted).
  - **O2:** owners sign up with **Clerk** (Google sign-in). Renters book and pay as guests with no login. This replaces "real auth out of scope", and the new `@clerk/nextjs` dependency is the owner's request (cite it in the commit).
  - **O3:** uploads are unlisted for now; a later decision may add "my listings" for owners.
  - **O4:** about $50 of credits remain, then the owner's card pays as you go, with a spend notification. The ceiling is an **abuse circuit breaker, not a budget cap**. Judges must never hit it in normal use.
  - **O5:** tool loop, if the one-call tool-calling test passes.
  - **O6:** QStash order status and Overpass nearby cafes are **parked**. They may be re-planned after the hardening work.
  - **O7:** README credits development as about 50/50 Muse models and Claude, without underselling the Muse side.
  - **O8:** voice stays a stretch goal, go/no-go at the end of Nov 1. **Closed 2026-11-02:** built (WhatsApp voice notes here, web mic in [07](07-judge-access.md) 7.3) and validated on a real Egyptian-Arabic WhatsApp note (exact transcript, correct reply).
- **Space rubric (owner, 2026-10-30), detailed in 6.4:**
  - Uses in v1: private/startup office, open-plan/coworking, meeting/training room, general clinic, dental clinic, accounting/law office.
  - General clinic: exam room + **separate** waiting room + bathroom.
  - Dental clinic: general clinic + a **separate prep/sterilisation area**. It can be anywhere; a repurposed bathroom or small partition counts.
  - Desk standard: **120 × 70 cm**.
  - Semifinished shells may score "fits after fit-out" when partitions could create the required rooms. The bathroom and plumbing must already exist.
  - Video-direct input gets one test call; dense browser frames are the fallback.
  - SAM: no benefit for the rubric (masks aren't metric, and room types come from Spark), so it stays dropped.
  - Filmed `empty1`/`empty2` are 2-room offices with a bathroom plus a small extra area (kitchenette or sterilisation partition). They're the dental-clinic test cases. `full` (1 room, 3 desks) must fail both clinic uses.
  - Synthetic units get regenerated from floor-plan briefs. Review the briefs before generating.

## Open points

All of O1–O8 are resolved (see Decisions). Follow-ups:
- **Clerk: development instance for the demo** (owner, 2026-10-29). It works on `offisio.vercel.app` with Clerk's shared Google credentials, so no owned domain or Google Cloud client is needed. We accept the dev badge and dev-instance user limits.
- **Prices:** the API returns token usage but no cost (below). The owner converts with Meta's per-token prices, or reads the two request IDs in billing. Then set `DEMO_DAILY_SPEND_USD` and the per-call estimates in 6.3.

## Metering (2026-10-29, owner-approved, one call per model)

| Call | Shape | Status / latency | Usage | Request id |
|---|---|---|---|---|
| `muse-spark-1.3` chat | specs prompt + 1 keyframe (`full/real.jpg`) | 200, 8.5 s | 4,016 prompt / 1,591 completion (**1,452 reasoning**) tokens | `a6cd3e2b-5aa9-4d69-9a7f-443fb5db0c3b` |
| `muse-image-1.0` edit | startup restyle of `full/empty.jpg` | 200, 15.6 s | 12,178 input / 940 output tokens, output `webp` | `b130420a-9aed-4b53-9c92-5575d58e6828` |

- No cost fields in responses or headers. Rate-limit headers: spark 3,000 requests / 4M tokens, image **150 requests** (window not stated). Keep batch concurrency low.
- Reasoning tokens are ~90% of spark output. If the API supports a reasoning-effort or max-tokens control, it's the biggest chat cost lever (check in 6.5).
- **Finding for 6.6:** `muse-image-1.0` returns WebP. Our stored `full/empty.jpg` is WebP bytes under a `.jpg` name, and feeding it back as `image/jpeg` gets a 400 (`MIME type image/webp does not match declared image/jpeg`; one rejected attempt, no output). The staging step must sniff magic bytes and declare the real type (and name files `.webp`). [lib/meta/client.ts](../../lib/meta/client.ts) `imageEdit` currently sends no type.

## Dry run (2026-10-29, read-only, no model calls) — runs approved by owner

- **6.5 scripted chats:** never run before (`chat_sessions` is empty). Projection: 10 conversations × ~6 turns ≈ 60 `muse-spark-1.3` calls. Runs **after** the 6.5 agent fixes, so we don't spend calls on the known date and price bugs.
- **6.6 staging:** the 3 filmed units are fully staged (`full`: empty + 3 styles; `empty1`/`empty2`: 3 styles). **All 6 `gen-*` units have 0 staged media**, so staging them is 5 furnished × 4 + 1 semifinished × 3 = **23 edits**. 4 new synthetic units would add 20 generations + ~16 edits + 8 spark calls. Rough image budget at the metered size: ~39 edits × ~13k tokens ≈ 0.5M image tokens, plus generations. Runs **after** the 6.6 staging step lands (cache + budget + WebP fix).
- DB leftovers for 6.2 to review (not touched): 4 `confirmed` + 1 `awaiting_payment` bookings, 21 booked slots in the past.

## Steps (each one is a commit or a small series; lint and typecheck before every commit)

### 6.1 Docs unify (Oct 30, morning) — 6-6
Bring older docs up to the newer decisions, cross-checked against the code. Keep decision-log history and mark superseded text rather than deleting it.
- [AGENTS.md](../../AGENTS.md): locale `en` default. Scope: payments (XPay test) and a minimal location pin are in. Routing table: add `muse-voice-transcribe-1.0` for voice notes (it isn't a contributor model; the table currently says "spark only"). Document the dev contributor switch (6.3). Mark `sam-3.1` dropped.
- [ARCHITECTURE.md](../ARCHITECTURE.md): §2 out-of-scope list, §3 diagram (SAM dropped, video stored), §9 (Blob direct upload).
- [docs/DESIGN.md](../DESIGN.md): header locale. Decision log: video upload, en default, D5 revision. §5 marked "as built" versus planned. §9 out-of-scope list.
- [PRODUCT.md](../../PRODUCT.md): media lives on Blob, not `public/demo`. Out-of-scope list.
- [README.md](../../README.md): merge the duplicate "Built during the hackathon" headings, drop `sam-3.1` from product models. O7: development credited about 50/50 to Muse models (`muse-wonder-1.0` planning, contributor agents) and Claude. Concrete, not underselling either side.
- [.env.example](../../.env.example) and PLAN env contract: move the `QSTASH_*` vars under a "parked (O6)" comment, add the Clerk vars when 6.8 lands.
- [PLAN.md](../PLAN.md): fix the anachronistic "Done 2026-10-27 … xpay" line. Env contract adds `BLOB_READ_WRITE_TOKEN` (`QSTASH_*` marked parked). [04](04-booking-agent.md): a Paymob → XPay pointer. [05](05-demo-polish.md): mark the post-switch Paymob "Dashboard inspection" bullet superseded.
- Verify: `grep -ri paymob` hits only decision logs and history; every doc's locale, scope and model list agrees.
- **Done 2026-10-30.** Edited: AGENTS.md (scope, routing table + voice model, dev switch, `en` default, asset/secret lines), ARCHITECTURE (as-built banner, SAM struck, scope), DESIGN (header locale, D1/D5, S2 struck, §5 as-built, §8 routes, §9, 3 decision-log entries, 5 broken replacement characters fixed), PRODUCT, README (one "Built during" heading, SAM dropped, O7 50/50 section), `.env.example` (QStash parked), PLAN.md (XPay dating, env contract), 04 (Paymob → XPay pointers, scripted chats moved to 6.5), 05 (status + history banner, dashboard bullet superseded), docs/agents (segmentation role retired, media-modification WebP note, qa-ui locale). Verified by grep: no doc still claims an Arabic default, SAM as a product model, or payments out of scope; remaining Paymob mentions are dated history in 05 under its banner. No code changed.

### 6.2 Booking data correctness (Oct 30) — 6-1 dates
- [lib/db/store.ts](../../lib/db/store.ts): `availabilityByDay` and `freeDates` hide days before today (Cairo). Add per-unit `freeDays(slug, n)`.
- Expire unpaid holds: `awaiting_payment` older than 30 min gets released lazily before availability reads and before `createBooking`. Status `expired`; reuse the `failBooking` release logic in [lib/booking.ts](../../lib/booking.ts). No cron.
- Rolling availability: [scripts/seed.ts](../../scripts/seed.ts) and `generateAvailability` build slots from today through **2026-12-15**, idempotently. One-time top-up of all live units. Purge or flag old test bookings after reviewing them in the DB first.
- Checkout return URL uses the booking's locale, not a hardcoded `/en` ([lib/xpay.ts](../../lib/xpay.ts)).
- Verify: on prod, `/api/availability` for every unit shows ≥30 free future days and no past days. An abandoned booking frees its day after 30 min (test with an env override of the TTL).

- **Done 2026-10-30.**
  - Past days are hidden in `availabilityByDay` (45-day window) and `freeDates`. New per-unit `freeDays`.
  - `releaseStaleHolds` runs before availability reads, booking creation and checkout. A hold lasts `BOOKING_HOLD_MINUTES` (default 30), then the booking is `expired`.
  - `confirmBooking` re-claims an expired booking's slots under a savepoint, or marks it `paid_conflict` if someone rebooked the day. `failBooking` only releases days of a still-unpaid booking.
  - `createBooking` rejects past dates (`DATE_IN_PAST`).
  - `generateAvailability` is one set-based insert from max(available_from, today) to `AVAILABILITY_UNTIL` = 2026-12-15. `pnpm topup-availability` ran on Neon: +301 / +294 slots per unit, 1 stale hold expired; a re-run adds +0.
  - The checkout return URL uses the booking page's locale. Checkout refuses non-payable bookings (`BOOKING_NOT_PAYABLE`).
  - Leftovers, **not purged (owner decides):** 5 Oct-27 E2E test bookings on `full`. 4 are confirmed (3 have no payment row); the 5th is now expired. Two of them still block `full` on Oct 30–31.

### 6.3 Guardrails and cost controls (Oct 30–31) — §4 / 6-4, the dev switch
Lands **before** any batch generation in 6.6. No new dependency: counters are Postgres upserts. Per-IP limits apply to guests. A signed-in owner gets per-user limits once 6.8 lands.
- `lib/db/schema.sql`: `usage_counters(day, scope, key, n)` with `scope` ∈ ip/global, and `ai_cache(key pk, kind, model, prompt_version, result jsonb, created_at)`.
- `lib/guard.ts`: `limit(kind, ip)` reads the IP from `x-forwarded-for`, hashes it with a server salt, and returns ok, or `quota` with a localized message.
- Spend circuit breaker (O4): each model call adds an estimated cost to a daily global counter. Above `DEMO_DAILY_SPEND_USD` (env; default $15/day, sized well above expected judge use), uploads and staging return `DEMO_QUOTA` ("demo quota reached"). Cached and seeded units, browsing, booking and payment keep working. Chat has its own turn cap. Logged so the owner sees it alongside the Meta spend notification.
- Hard limits (defaults until O4 sets them):

  | Surface | Per IP / day | Global / day | Other caps |
  |---|---|---|---|
  | Chat turns | 40 | 1,000 | ≤ 800 chars per message, ≤ 20 turns per session, compact unit context |
  | Uploads | 3 | 20 | video ≤ 45 s (client) and ≤ 80 MB (Blob token), 6–8 frames ≤ 1024 px, frame ≤ 1 MB |
  | Image edits (staging) | 4 | 40 | — |
  | Bookings created | 5 | 100 | — |
  | Estimated spend | — | `DEMO_DAILY_SPEND_USD` | — |

- AI cache: specs/listing keyed by sha256(frames + owner fields + prompt version + model). Staging keyed by sha256(base image + style prompt version). A re-run on an unchanged input costs nothing.
- Dev switch: `OFFISIO_DEV_MODELS=contributor` routes **non-PII** calls (specs, listing) to `muse-spark-1.3-contributor`. It's ignored whenever `process.env.VERCEL` is set, so it only works locally. Chat always stays on `meta.product`. The model choice stays inside [lib/meta/client.ts](../../lib/meta/client.ts).
- Blob hardening ([app/api/blob/upload/route.ts](../../app/api/blob/upload/route.ts)): `allowOverwrite: false`, and reject a token when the slug already exists in `units`. Move `gen-*` media from `uploads/` to `demo/` (copy the blobs, update media rows).
- i18n keys for the quota and limit messages in `lib/i18n/{ar,en}.json`.
- Verify: tsx scripts in `scripts/` (no test framework added) hit each limit locally and get 429 plus the localized message. A forced ceiling shows the quota message while a cached unit still loads and books. Requesting a token for `uploads/gen-zamalek/frame-0.jpg` gets 400. With the dev switch on locally, the logs show contributor for specs. On Vercel the switch is a no-op.

- **Done 2026-10-30.**
  - Migrated on Neon: `usage_counters`, `ai_cache`, `chat_sessions.turns`.
  - [lib/guard.ts](../../lib/guard.ts): `limit`, `deny`, `recordUsage`, `spendBlocked`, `CAPS`; hashed IPs; env overrides `LIMIT_<KIND>_IP|GLOBAL`. Without prices, the breaker falls back to `DEMO_DAILY_TOKEN_CAP` (6M).
  - Usage is recorded on every call through `lib/meta/client.ts`. `meta.nonPii` + `nonPiiModel()` is the dev switch, ignored on Vercel. `imageEdit` sniffs WebP/PNG/JPEG.
  - [lib/pipeline/cache.ts](../../lib/pipeline/cache.ts): specs and listing are cached by content hash, model and prompt version.
  - Routes: chat (800 chars, 20 turns per session, limit), upload (breaker + limit before any work), blob token (limit; refuses existing slugs; `allowOverwrite: false`; 1 MB frames, 80 MB video), bookings (limit).
  - UI: localized error codes (`errorText`, 10 `error.*` keys AR/EN). Upload rejects videos over 45 s or 80 MB; frames are now 1024 px.
  - The `gen-*` media move is unnecessary: the existing-slug rule already protects them.
  - Verified: `.scratch/verify-lib.ts` 18/18 PASS (holds, conflict/reclaim, past date, cache, usage, breaker, dev switch, checkout locale). `.scratch/verify-http.mjs` 16/16 PASS on a local prod build with limits at 0 (no model calls). typecheck/build pass, lint 0 errors. Test bookings and counters cleaned.
  - **Before deploy, set in Vercel:** `GUARD_SALT` (random), and the `META_PRICE_*` values once known. Until then the token cap applies.

### 6.4 Space survey + use rubric (Oct 31) — owner request 2026-10-30
Why: the v1 pipeline sees one hero room. It measured `empty1`/`empty2` as single rooms and rendered a clinic for the 1-room `full`. The rubric decides which uses a unit fits, from the whole video, and only those uses get mockups.
- **Spec first:** [docs/RUBRIC.md](../RUBRIC.md), versioned `RUBRIC_V1`: criteria, thresholds, verdict rules, AR/EN reason strings. Prompts live in `lib/meta/prompts.ts`; rules in `lib/pipeline/rubric.ts`.
- **Input test (one call):** does `muse-spark-1.3` accept a video input directly? If not, [components/UploadForm.tsx](../../components/UploadForm.tsx) extracts dense candidate frames (~1/s, ≤ 40, ~512 px, timestamps).
- **Stage 1, survey** (`lib/pipeline/survey.ts`, `meta.nonPii`, cached): spaces[] with type (entrance, room, bathroom, kitchenette, corridor, storage), estimated w × l with confidence, windows, doors and adjacency, plumbing (WC, sink, water point, drain), AC, outlets, finishes, best frame per space. The chosen frames become keyframes, one hero per space.
- **Stage 2, verdicts:** the model scores each criterion with cited frames; code applies hard rules. Verdict per use: fits / fits after fit-out / not suitable, with reasons AR/EN.
  - Requirements:
    - office: ≥ 1 room, a window or ventilation
    - open-plan: largest room ≥ 25 m²
    - meeting/training: a room ≥ 15 m²
    - general clinic: exam room + separate waiting room + bathroom
    - dental: general clinic + a separate prep area
    - accounting/law: reception/waiting + ≥ 1 private office room
  - Capacity: desks packed geometrically per room. Per row = (wall − 0.2 m) ÷ 1.2 m; rows = (depth − 0.9 m door clearance) ÷ (0.7 m + 1.0 m chair zone); comfortable keeps a 0.9 m aisle. Area fallback for irregular rooms. Seats ~1.9 m² classroom / ~1.0 m² theatre. Bathrooms, entrances and corridors are excluded.
  - Calibration: `full` must come out at about 3 desks, `empty1`/`empty2` must pass dental, and `full` must fail both clinic uses.
- **Storage:** `specs.data.survey` and `specs.data.uses` (no migration). Listing prompt v2 mentions only passing uses. Unit page shows "Suitable for" chips with reasons, labelled AI estimate (D3).
- Verify: the 3 filmed units match the calibration above. Rubric rules have tsx checks on fixture surveys (pass/fail edge cases, no model calls).

- **Done 2026-10-30.**
  - Spec: [docs/RUBRIC.md](../RUBRIC.md). Code: `lib/pipeline/survey.ts` (validated, cached), `lib/pipeline/rubric.ts` (`assess`, `deriveSpecs`), `lib/pipeline/ingest.ts` (shared by upload + scripts), `SURVEY_PROMPT_V1` / `LISTING_PROMPT_V2`.
  - **Video-direct test:** `video_url` works on Spark (5.3k tokens per 20 s clip), but its sampling missed a room in `empty1`. Frames at 1/s are the input; the video stays for playback.
  - **Modal Muse Spark Open** (owner, 2026-10-30) is the dev target (`OFFISIO_DEV_MODELS=modal`, vision OK). Calibration ran there; seeded data on `muse-spark-1.3`.
  - **Calibration:**
    - `full` = 1 room, 12 m², office fits with 3 desks comfortably (4 max); clinic and dental not suitable.
    - `empty1` / `empty2` = 2 rooms + bathroom; clinic fits, dental fits after fit-out.
    - Two adjustments came out of it: desk heuristic 4.0 / 3.0 m², and corridor ≥ 2 m counts as a room.
    - Cache keys now hash the prompt text.
  - `pnpm check-rubric`: 13 fixture checks pass. `pnpm remodel-filmed` re-surveyed the 3 filmed units (1 fps frames on Blob `demo/<slug>/frames/`).
  - Upload: ~1 frame/s (6–30), AI-picked hero per room, keyframes keep `t`/`spaces`/`best_for`. The unit page shows "Suitable for" with verdicts and reasons in AR/EN.
  - Owner rule 2026-10-30: with no separate prep space, the bathroom can be retrofitted as the prep/sterilisation area. Dental is then fits after fit-out, and the prep render shows the converted bathroom.

### 6.5 Agent fixes (Nov 1) — 6-3
- [lib/agent/agent.ts](../../lib/agent/agent.ts): server-injected Cairo date and weekday (the hardcoded `2026-10-27` goes). Per-unit `daily_egp` (the hardcoded 800 goes). Per-unit free days. Compact unit context (slug, district, kind, rents, desks, area, lat/lng after 6.7) instead of the full specs JSON.
- First, one synthetic call through `meta.public` (contributor allowed for synthetic data) to test tool calling, U4. If it passes (O5), switch to the DESIGN §5 tools: `search_units`, `get_unit`, `check_availability`, `create_booking` (and `near` after 6.7), with a 6-round cap and per-tool argument validation.
- Verify: 10 scripted Egyptian-Arabic conversations using synthetic names and phones (happy path, slot taken, no results, bare unit asked for a day, English mirror, off-topic refusal, add-ons, a bad phone, a changed date, "near X"). They run on `muse-spark-1.3` because chat is PII by rule, so they need **owner approval first** (about 60 calls). Record the transcripts in this file.

- **Done 2026-10-30.**
  - Native tool calling verified (one call, contributor): `search_units({district:"Zamalek",min_desks:3,use:"office"})` from an Arabic message.
  - [lib/agent/agent.ts](../../lib/agent/agent.ts): tool loop (`search_units`, `get_unit`, `check_availability`, `create_booking`), ≤ 6 rounds, args validated in code. `AGENT_PROMPT_V2` gets the server Cairo date and weekday; prices and free days come from tools; `reasoning_effort: "low"`. The tool trace is stored in `chat_sessions.tool_calls`.
  - `pnpm chat-acceptance`: 10 scripted conversations on `muse-spark-1.3`, synthetic renters, transcripts in `.scratch/chat-transcripts*.md`.
    - Run 1: 6/10. Rubric-less units were filtered out of `use` searches.
    - Run 2: 8/10.
    - Then fixed: `matching_other_tracks` explains long-term-only units, and scenario 9's script now picks a unit and answers the add-on question.
    - Scenarios 3 and 9 pass individually. A clean 10/10 full run is due after the synthetic regeneration.
  - Chat acceptance cost ≈ $0.30 in total.

### 6.6 Staging coverage, redo modelling, demo data (Nov 1–2) — 6-1 / 6-2
- `lib/pipeline/staging.ts`: move `empty` and `restage` out of [scripts/run-unit.ts](../../scripts/run-unit.ts) into a re-runnable step that is cached and budgeted. One style runs per request, to stay under the 300 s limit. Semifinished units skip the empty step.
- Route `POST /api/units/[slug]/stage?style=` and viewer states (pending / rendering / done), following O1.
- **Redo all modelling** with the rubric: survey → verdicts → listing v2 → staging **only for passing uses**. Clinic mockups render waiting and exam rooms separately from their own frames; dental adds the chair render. `full` gets office and meeting renders, no clinic.
- **Synthetic units regenerated from floor-plan briefs** (entrance, rooms, bathroom, extra area as distinct spaces, frames per space in walk order). The owner reviews the briefs before any generation call.
- Demo inventory, target ~13 units (3 filmed, about 10 synthetic), **every unit fully staged**:
  - Places: Maadi, Zamalek, Downtown, Garden City, Heliopolis, Nasr City, New Cairo, Sheikh Zayed, 6th of October, Alexandria (Chatby, Louran, Smouha).
  - Layouts: 2–4 desk private office, open-plan 12–20 desks, meeting room, semifinished shell (clinic-ready), training hall, villa-floor office.
  - A mix of furnished (daily and monthly) and semifinished (long-term). Realistic, varied rents.
  - Extend [scripts/generate-units.ts](../../scripts/generate-units.ts) with briefs and a `--stage` flag. Synthetic badge unchanged.
- Batch estimate: about 20 new frame generations, about 40 staging edits, and 8 spark calls. **Owner approves the batch and its cost before it runs** (dry-run first to print the call count).
- Verify: every unit page shows real, empty (furnished units) and 3 fits. All media URLs return 200. A side-by-side drift check of the 3 styles on each unit, where a drifted style is re-run alone.

- **Code + filmed units done 2026-10-30.**
  - `lib/pipeline/staging.ts`: `planStaging` from the verdicts. Styles: office, open_plan, meeting, clinic_waiting + clinic_exam (or clinic_split for one room), dental_exam + dental_prep, legal_office. Each style renders on its role's best frame, with `{N}` from the rubric.
  - `stageOne`: furnished spaces are emptied per space first. Every edit is cached by base bytes + prompt. WebP outputs go to Blob `staged/<slug>/`.
  - `STAGE_PROMPTS_V2`. Route `GET|POST /api/units/[slug]/stage` (existing styles never cost a call; image_edit limit + breaker). `StageButtons` on the unit page renders missing styles (O1). `UnitViewer` builds tabs dynamically.
  - `pnpm stage-units [--dry]` ran 14 edits ($0.14): `full` = empty + office, no clinic render. `empty1`/`empty2` = office, training, clinic waiting + exam, dental, law office. Legacy v1 renders are retired, including `full`'s clinic render.
  - Visual QA (`.scratch/qa-montage.jpg`): geometry and windows hold. One minor drift: the `empty1` waiting render repaints the ceiling.
  - **Owner review 2026-10-30:** briefs approved.
    - Semifinished renders must show the finished fit-out: new floor over the dirty tiles, a white gypsum false ceiling with lights instead of the raw slab, and painted walls. Geometry stays fixed. This is `STAGE_PROMPTS_V3` with `stagePrompt(style, kind, n)`.
    - The runner retires styles that are no longer planned. A style counts as done only if it was rendered at the current prompt version.
  - `scripts/generate-units.ts` v2 reads the briefs: per-space frames → slideshow → Blob `demo/<slug>/v2/` → `analyzeUnit`/`saveAnalysis` (synthetic meta). `meta.imageGenerate` was added so generations are tracked in the spend ledger.
  - **Synthetic units use their brief as the survey** (`surveyFromBrief`, `survey_source: "brief"`). Reason: each camera angle is an independent generation, so the model survey read one 48 m² hall as 150 m² and one room as four, and nearly every use passed. The brief is the authored floor plan. Real footage and live uploads keep the model survey.
  - **Synthetic units render only their brief's `target_uses`** that pass. Filmed and uploaded units render every passing use. `--reanalyze` re-runs analysis on existing frames and retires stale renders.
  - Final inventory: 13 units, all staged. Dental fits: Heliopolis, Sheikh Zayed. Dental after fit-out (bathroom retrofit): empty1, empty2, Zamalek, Smouha, Chatby. Coworking: New Cairo, October. Fit-out clinic (partitioned): Nasr City. Furnished clinic: Smouha. Training: Downtown, Louran. Law office: Zamalek, Chatby.
  - Staging totals: V3 filmed 15 edits; synthetic 39 edits; plus 36 early edits from a run overlapping the generator (renders later retired or re-used via cache).
  - **Owner review 2026-10-30 (round 2):** Louran's 20 m² room rendered as a 10-seat boardroom, and its two frames contradicted each other. Root causes:
    1. Two *independent* generations per space are never the same room.
    2. Windows and views in the style line leaked into every space (sea views in bathrooms).
    3. Image models oversize rooms.
  - Fixes in `scripts/generate-units.ts` v3:
    - one frame per space
    - windows and views moved into the room descriptions
    - explicit metres, 26 mm lens and furniture fit in the prompt
    - a **QA gate**: each frame is checked by Muse Spark Open on Modal (area estimate + description match, accept 0.6–1.7×, up to 3 tries, keep the closest)
  - All 10 units regenerated to Blob `demo/<slug>/v3/`: 38 frames, 35 passed first or second try, 6 rejections regenerated, Nasr City's bathroom re-briefed. Every unit was reviewed visually (`.scratch/synth-a.jpg`, `synth-b.jpg`).
  - **White bar on photos fixed:**
    - The torn-edge JPEG mask was read as alpha (`mask-mode: luminance` added).
    - The viewer tore the photo even with no layer beneath (now only when one exists).
    - The cream `.tear-seam` strip was removed.
    - Synthetic hero photos are labelled "Listing photo (AI-generated)" instead of "Real today".
  - **Chat acceptance final: 10/10 PASS** on the v3 inventory (32 tool calls, test data cleaned). Before that run, `AGENT_PROMPT_V2` was changed so an explicit renter confirmation books immediately, with no second confirmation (scenario 9 friction).
  - Meta spend 2026-10-30, all work including the v3 regeneration: **≈ $4.10** (ledger `usage_counters`).

- **Owner review 2026-10-30 (round 3): clinics shown as whole units.** Separate "waiting" and "exam" tabs made each room look like a standalone use, and empty2 put the waiting room in the inner room. Fixes:
  1. The viewer groups renders per use ([lib/fit-groups.ts](../../lib/fit-groups.ts)), with sub-buttons Waiting · Exam · Prep. Dental plans now include the shared waiting render.
  2. Rubric: waiting = the outer room by walk depth (entrance, else farthest from the bathroom), exam = the larger room behind it.
  3. Partitioned clinics use full-height solid demountable walls with closed doors (`clinic_split` prompt rewritten, new `dental_split`), and the split now also applies to furnished units. October and Nasr City target the partitioned clinic and dental uses.
  - The runner and the stage route count a render as current only for the same style, space and prompt version (`isCurrent`). `--redo=style` forces a re-render after a prompt edit. Synthetic unit pages no longer show render buttons.
  - `pnpm reassess-units [--dry]` re-runs the rubric on stored surveys. It made 2 listing calls (Louran, October), whose uses changed. Renders: 7 edits (empty2 ×3, October ×2, Nasr City ×2), visually checked. Verified locally in EN LTR and AR RTL.

- **Owner review 2026-10-31 (round 4): every fit shows all its rooms; clearer switcher.**
  - Office fits render every room that takes a desk. Law offices render reception (outer room) + private office (inner room); the rubric's `outerInner` helper is now shared by clinic and legal.
  - The viewer's room switcher moved onto the photo: brick-red chips numbered "1. Reception · 2. Private office", pulsing twice when a multi-room tab opens (off under reduced motion). Tabs carry a room-count badge.
  - Stale renders retired, including New Cairo's old dental render (not in its brief).
  - 18 edits (~$0.18), visually checked. `reassess-units` made no listing calls.

- **Styling pass 2026-10-31.**
  - Shared control classes in `app/globals.css` (`.btn` + `btn-brick|ink|chalk|paper` + sizes, `.field`, `.link`, `.link-back`, `.card-lift`) replace ad-hoc button and input classes in every page and component.
  - Buttons get a pointer cursor and hover lift onto a hard ink shadow, press in on click, and show dashed when disabled. Fields tint on hover and get a chalk offset on focus.
  - The file picker is styled. Listing cards straighten, lift and zoom their photo on hover, and their tags sit on the bottom edge. The back arrow is mirrored in RTL. Checked in EN and AR.

### 6.7 Location, nearby places and menus (Oct 31 – Nov 2) — revised by owner 2026-10-31 — **done 2026-11-02** (step 5 parked)
Owner decisions 2026-10-31: location is **required**; nearby places come from the **Google Places API** (owner supplies a billing-enabled key); menus were planned from a one-off chain-brand catalogue (removed 2026-11-02, step 3) or an owner menu photo; long steps run on **QStash** inside this repo (no separate backend, no folder split).

1. **Location.** Migration `units.lat`, `units.lng` (numeric, idempotent). The upload form makes location required: a pasted Google Maps link or lat/lng, parsed on the server. Seeded units get district coordinates labelled "approximate area". The unit page gets an "Open in Maps" link (no map library).
2. **Pipeline jobs (QStash).** New table `pipeline_jobs(unit_id, step, status, attempts, last_error, updated_at)`. Steps: `analyze` → `listing` → `stage:<style>` (one job each) → `places` → `menus`. QStash calls one signed route per step (`/api/pipeline/[step]`) and retries non-2xx responses. Steps are idempotent and isolated, so one failure never blocks the others. The listing goes live after `listing`; renders and places fill in later. The owner edit page shows per-step status with a retry button. Env: `QSTASH_*` (already in `.env.example`).

**Status 2026-10-31 (steps 1–2 built, migrated, uncommitted).** `pnpm chat-acceptance` re-run first: **10/10** (33 tool calls; clinic-role changes from rounds 3–4 did not regress).
- Step 1 done: `units.lat/lng` (numeric(9,6)) + `location_approx`, migrated on Neon. [lib/geo.ts](../../lib/geo.ts) parses Maps links (prefers the `!3d!4d` pin over the `@` centre, `?q=`/`query=`, plain "lat, lng"), expands `maps.app.goo.gl`/`goo.gl` short links (Google hosts only), rejects points outside Egypt. Upload requires it (`LOCATION_INVALID`). `pnpm backfill-locations` gave 12 seeded units district centres (approximate); `--slug <s> --at <link> [--district <text>]` pins one unit exactly. Unit page: "Open in Maps" link, "(approximate area)" when approximate. Verified EN + AR.
- Step 2 done: `pipeline_jobs` migrated. [lib/pipeline/jobs.ts](../../lib/pipeline/jobs.ts): upload stores the unit + keyframes + location, returns 202, queues `analyze`; `analyze` (survey + rubric + specs) queues `listing` (goes live) and one `stage:<style>` per planned render, in parallel. Atomic claim makes duplicate deliveries no-ops; a step stuck in `running` > 6 min can be reclaimed. QStash over plain HTTP ([lib/qstash.ts](../../lib/qstash.ts), no new dependency): publish with `Upstash-Retries: 2`, JWT signature verified (current then next key, iss/sub/exp/nbf/body hash). Retryable errors → 500 (QStash retries); quota/missing-input errors are permanent → 200. Locally (no public URL) steps run in-process with no automatic retry. Edit page: per-step status, polling while active, Retry on failed steps (`/api/units/[slug]/pipeline`, rate-limited). Verified EN + AR with temporary fake rows (deleted). Offline checks of the parser and signature verifier pass.
- Decisions (owner 2026-10-31): auto-rendering every planned fit-out on upload is OK (better demo; still behind the daily spend cap). `gen-alex-louran` pinned by the Bibliotheca (Chatby side), not Louran proper. `QSTASH_*` set in Vercel by owner. In Claude Code sessions subagents run on Opus; the Muse agent table in AGENTS.md is for Muse sessions only.
- Owner check (set up 2026-10-31): the filmed 3-desk unit `full` moved from Maadi to **New Administrative Capital (Pioneer Plaza)**, Regional Ring Rd. Pinned exactly at 30.036687, 31.681687 (from the owner's plus code `2MPJ+MM`, recovered to `8G2H2MPJ+MM`), `location_approx = false`. Its listing text was swapped Maadi → "Pioneer Plaza, New Capital" / "بايونير بلازا بالعاصمة الإدارية" in plain code (no model call; prices untouched); `scripts/seed.ts` district updated. Expected step-4 result: exactly one nearby cafe, matched to **Second Cup**. Note: `data/seed/full-listing.json` is older than the live text, so `pnpm seed` would overwrite the reassessed listing (pre-existing).
- **Verified on production 2026-10-31** (owner deployed `a573708`/`9dd206c`, QStash env set): one real upload of our own walkthrough (`full.mp4`, re-encoded to 720p for the browser tool) at the Pioneer Plaza pin. QStash delivered `analyze` → `listing` + `stage:office` in parallel; all three `done` on attempt 1 in ~1.5 min; unit `ready`, exact pin, office render live. Unsigned / bad-signature POSTs to `/api/pipeline/*` return 401. Cost under $0.10 (1 survey, 1 listing, 2 image edits). Test data fully removed after (unit + cascaded rows, 4 `ai_cache` rows from the run, 23 Blob files). Retry was verified locally only (no forced failure on production).
- Fix found by that run (committed by owner): the edit page's specs form kept the empty pre-analysis state after the page refreshed, and saving it could overwrite the survey's specs with blanks. `SpecsEditForm` is now keyed on whether the survey exists, so it remounts with real values.
3. ~~Brand menu catalogue (one-off import).~~ **Removed 2026-11-02** after organizer guidance (use only data we have rights to): the third-party menu capture, its import scripts and its table were deleted; see the [DESIGN](../DESIGN.md) decision log.
4. **Nearby places (`places` step).**
   - Places API Nearby Search finds the 1–2 nearest cafes/restaurants within ~500 m.
   - Matching:
     1. A cheap text pre-filter over the normalised names and aliases gives the top 5 brand candidates.
     2. One `muse-spark-1.3-contributor` call (via `meta.public`, public place names only) picks the brand or "none".
   - Stored in `unit_places(unit_id, place_id, name, distance_m, maps_url)` (brand matching and its columns removed 2026-11-02).
   - Embeddings only after a one-call capability test (unknown whether the Meta API offers them).
   - Respect Places terms: store `place_id` plus what we need to display, with attribution.
5. **Owner menu photo (fallback, `menus` step).** **Parked (owner 2026-11-02):** 13/13 demo units already have a chain menu nearby and the popularity fallback covers most new uploads; photo-read prices would come from the model, not a checkable source; time goes to step 6. Original plan: no brand match → an optional menu photo at upload or edit → Muse vision extracts items with prices (validated JSON) → labelled "from the owner's photo". Without a photo, the place shows with a Maps link and "menu not listed yet".
6. **Product surfaces.**
   - Unit page "Nearby" section: place, distance, a top-items menu, source label.
   - Daily bookings: menu items become add-ons, paid with the booking.
   - Agent: tools `nearby_places(unit)` and `near` search (landmarks list, haversine), so it can answer "what's near to eat" and "near AUC".
   - Monthly tenants only see the info plus the cafe's WhatsApp link (no standalone food orders).
7. **Verify.**
   - Every unit has coordinates; at least 10/13 units show a matched brand menu.
   - A fresh upload with a real Cairo location gets places within one QStash run.
   - A failed step can be retried alone.
   - Chat "near AUC" ranks New Cairo first; chat acceptance is still 10/10.
   - Cost: the brand normalisation is ~150 contributor calls (~$0.05); Places calls are billed to the owner's key.

### 6.8 WhatsApp booking channel (Nov 1–2) — owner decision 2026-10-31
- **Setup (owner):** create a Meta Business account and a developer app with the WhatsApp product. Add the new number (it must not be active in the WhatsApp app) and verify it by SMS or call. Create a permanent access token. Env: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
- **Status 2026-11-01: channel live on production (send + receive verified).** Owner sent a WhatsApp message to +20 11 59275190 and got the agent's reply.
  - Setup done: portfolio "Offisio" (`1708891244582706`); real WABA "Offisio" `1682108880289053` (Business settings calls WABAs **Messaging accounts**; "WhatsApp accounts" is the number/presence view, `1694430892347425`, not usable with the API); phone number ID `1320407774498600` (CONNECTED, display name approved, GREEN, TIER_250); app `1144744804740672` with webhook `https://offisio.vercel.app/api/whatsapp/webhook` (field `messages`, active), privacy/terms/data-deletion URLs, category Business, published; system-user permanent token; payment method on the WABA. Ignore the auto-created "Test Messaging Account" `2306666613454484` (+1 555 test number).
  - Gotcha that cost an hour: the dashboard never subscribed the real WABA to the app, so Meta delivered nothing (no Vercel logs). Fixed with `POST /1682108880289053/subscribed_apps` (read back lists Offisio). Check with `GET /{WABA}/subscribed_apps` if webhooks go silent.
  - Built (committed in `2f0f0fa` and `48c3176`): `lib/whatsapp.ts` (signature check, payload parsing, hashed per-day session key, `sendText`), `app/api/whatsapp/webhook/route.ts` (GET handshake; POST 401 on bad signature, dedupe by message id via `usage_counters`, agent turn in `after()`, booking-page link appended after `create_booking`), `created_via='whatsapp'` threaded through `chatTurn`/`createBooking` (column already existed), `guard.limitKey`/`firstSeen`, bilingual `/privacy` (with `#delete`) and `/terms` pages on a shared `components/LegalPage.tsx`, linked from the home footer. Unit checks pass; prod handshake 200 / wrong token 403 / bad signature 401.
  - WhatsApp profile photo/description: set on the **number's business profile** (WhatsApp Manager > Phone numbers > +20 > Profile), not the developer app icon (that one only shows in Meta's dashboards). Owner action; phones cache the photo for a while.
  - Docs still to update with the 6.8 close-out: README "What we built" (WhatsApp channel + number for judges, see 6.10); DESIGN out-of-scope list (line ~199) still says "WhatsApp integration (outbound `wa.me` cafe link only)", which contradicts the amended D6; ARCHITECTURE booking `created_via` lists only chat/voice (now also `whatsapp`).
  - Open questions answered: display-name review did not block messaging (`AVAILABLE_WITHOUT_REVIEW`); unverified business = TIER_250, enough for the demo (business verification skipped).
  - Remaining (checked in code 2026-11-02): the channel replies and appends the booking-page link after `create_booking` (`app/api/whatsapp/webhook/route.ts`), but **nothing is sent after payment**: `app/api/payments/webhook/route.ts` calls `confirmBooking` and returns. To build: after a confirmed (or `paid_conflict`) booking with `created_via='whatsapp'`, send a short AR/EN confirmation (`sendText`). The sender number is stored only hashed, so either (a) send to the booking's `renter_phone` as `20` + number without the leading 0 (no migration; only reaches the renter if they gave the same number they chat from, inside the 24-hour window), or (b) store the sender's `wa_id` on the booking (one nullable column, migration). Then the two-phone AR + EN end-to-end booking in Verify below.
- **Owner decision 2026-11-02: option (b) + renter identity on WhatsApp.**
  - Migration: `bookings.wa_id text` (the sender's WhatsApp id, digits, set only for WhatsApp bookings) and `bookings.renter_email text`, both nullable (old rows), plus an index on `wa_id`.
  - WhatsApp bookings: the phone is taken from the sender (`wa_id` 20XXXXXXXXXX -> 0XXXXXXXXXX), never asked. The name comes from the WhatsApp profile name when Meta sends it (else the agent asks). The agent asks only for an **email** at booking confirmation.
  - Web chat and the booking form still need name, phone **and email** (email is new there too).
  - New agent tool `my_bookings` (WhatsApp only): the sender's bookings matched by `wa_id` or by the phone derived from it. Web chat does not get it, because a typed phone number is not proof of identity (anyone could read someone else's bookings).
  - Proactive check (WhatsApp only): each turn the system prompt carries the sender's upcoming pending or confirmed bookings. When they ask for a new booking, the agent mentions the existing one first (ref, unit, date, status; pending ones get the payment link).
  - After the signed XPay webhook confirms a booking (or marks it `paid_conflict`) and `wa_id` is set, send a short AR + EN WhatsApp message (ref, unit, date, total; conflict = "we'll refund"). Sending failures are logged, never fail the webhook. Only works inside the 24-hour customer-service window, which a just-paid booking is.
  - PII: email and `wa_id` are PII; they go only through `meta.product`, like the phone.
  - Built 2026-11-02 (uncommitted): migration run on Neon (`wa_id`, `renter_email`, index). `AGENT_PROMPT_V4` + channel blocks, `my_bookings` tool, upcoming-bookings check, `notifyPaid` after the XPay webhook (deduped per booking outcome), email on the web form, `/api/bookings` now accepts only form fields (a caller can no longer set `wa_id`). Owner 2026-11-02: **non-Egyptian WhatsApp numbers can book** (stored as `+<digits>`; only typed web numbers must be Egyptian mobiles). Acceptance script has 3 WhatsApp scenarios (11-13), not run yet.
  - Next, owner approved 2026-11-02: optional **"Get updates on WhatsApp"** link on the booking page for website bookings. It opens wa.me to our number with a prefilled `Offisio <ref>-<signed code>`; the webhook verifies the code and saves the sender's `wa_id` on the booking, then the same paid notice and `my_bookings` work for it. Renter-initiated, so no message template and no per-message cost. **Optional** (owner 2026-11-02; email stays the required contact). Built 2026-11-02: `waLinkUrl`/`parseLinkMessage`/`linkCodeMatches` in `lib/whatsapp.ts` (HMAC of the booking id with `WHATSAPP_APP_SECRET`), webhook handles `Offisio <ref>-<code>` before the agent (links only if unlinked or same sender, AR+EN reply), booking API no longer returns `wa_id`/email and adds `whatsapp_linked` + `whatsapp_link_url`, booking card shows the button + one-line note or "WhatsApp updates are on". New env `WHATSAPP_NUMBER` (digits; set in Vercel, button hidden without it). Checked locally: code round-trip, tampered code rejected, no overwrite of another sender, `my_bookings` finds the linked booking, EN + AR card in both states; test booking deleted. Real phone test after deploy.
- **Chat polish 2026-11-02 (owner request, uncommitted).** Web chat renders the agent's light markdown ([components/ChatText.tsx](../../components/ChatText.tsx): bold, numbered/bulleted lines, line breaks, links; no dependency, no HTML injection) and scrolls to the newest message. Photo cards: `chatTurn` returns `units` (cover photo, title, price, AI-photos tag) for the units its `search_units`/`get_unit` calls returned that the reply names (by district, slug or price; else the first 3; none once a booking is made). Web chat shows up to 3 cards linking to the unit pages; WhatsApp sends one image message per unit (`sendImage`, caption: title, district, price, link; best effort) and converts `**bold**` to WhatsApp `*bold*`. Checked live in EN (Zamalek + New Cairo: 2 cards, matching the 2 offered) and AR (3 Alexandria cards, RTL); test sessions deleted. WhatsApp images need the deployed site + a phone. Reply language (`AGENT_PROMPT_V5`): follows the renter's latest message; a message with no language (place names, "ok") keeps the conversation's language; the first reply uses the page language (web) or Arabic (WhatsApp). Before, "cairo, heliopolis" on the English page got an Arabic reply. Re-checked on /en/chat with the owner's three messages: all English.
- **Acceptance 2026-11-02 (`AGENT_PROMPT_V5`, after owner push `4c7d8ac`): 13/13.** Full run: 1-11 PASS, then scenario 12's setup hit `SLOT_TAKEN` (it booked a precomputed Zamalek day that an earlier scenario had taken) and the script exited before cleanup; leftovers deleted by hand (5 bookings, 11 sessions). Script fixed: the WhatsApp setup books the first day still free at setup time, and cleanup runs in `finally`. Re-run 11-13: 3/3 (8 tool calls, cleaned). Transcripts: 11 booked with the profile name and only an email (no phone asked); 12 opened with the sender's pending + confirmed bookings before offering Smouha; 13 listed all three with the pay link for the unpaid one. Wording nits seen (not fixed): after "أكد" on an already-created booking the agent said "حجزك متأكد" while still awaiting payment; it wrote the district as "Zamalek" inside an Arabic reply. **Fixed same day in `AGENT_PROMPT_V6`:** a booking is "held / awaiting payment" until the XPay webhook confirms it (WhatsApp renters then get the paid notice); a repeated "confirm" reminds them to pay instead of booking again; place names follow the reply's language. Scenarios 1 and 11 now fail on any "confirmed" wording before payment; re-run 1 + 11: 2/2 (13 tool calls, cleaned), replies say "لسه محجوز ومستني الدفع" and, on WhatsApp, "بعد الدفع هتجيلك رسالة على واتساب".
- **First:** a one-message capability test (send plus receive) before building. Open questions to confirm:
  - whether display-name review limits messaging;
  - the business-initiated message limits for unverified businesses.
- **Build:**
  - `GET|POST /api/whatsapp/webhook`: verify the challenge, check the `X-Hub-Signature-256` HMAC, dedupe by message id.
  - Each text runs the existing agent with `created_via='whatsapp'`. A session is keyed by a hashed sender number.
  - Replies go through the Cloud API, inside the 24-hour customer-service window.
  - After `create_booking` the agent sends the XPay test-mode checkout link. The signed XPay webhook confirms the booking, then a WhatsApp confirmation goes out.
  - No COD, no partial payments.
- **PII:** message text and phone numbers go to `meta.product` (`muse-spark-1.3`) only, never contributor. Store minimal data; the phone number is hashed for session lookup.
- **Limits:** the same chat limits (chars, turns, per-number rate) and spend breaker as web chat.
- **Verify:**
  - Book end to end from 2 phones (AR + EN): search → availability → booking → pay link → confirmation message.
  - A bad signature returns 401.
  - Web chat is unaffected.

### 6.9 Owner auth — **built 2026-11-02 as WhatsApp sign-in (Clerk dropped, owner decision)** — 5 / O2 / O3
- As built: `/[lang]/login` (and inline on upload) issues a one-time code (`login_codes`, 10 min, bound to the browser by an httpOnly nonce); the owner sends "Offisio login XXXX-XXXX" from WhatsApp, gets a warning, and replies YES within 2 minutes; the page then sets an HMAC-signed 24 h `offisio_owner` cookie carrying a per-number epoch (`owner_epochs`); "Offisio logout" bumps the epoch and deletes pending codes. Upload + blob token need sign-in and set `units.owner_wa_id`; specs/stage/pipeline write only for the owner, everyone else (and the 13 demo units always) get the cookie preview. Reviewed twice (security), fixes applied. Verified locally EN + AR with a signed fake webhook; **not yet** from a real phone or on Vercel.
- Original Clerk plan (kept for history):
- As planned earlier: Clerk dev instance via the Vercel Marketplace, Google sign-in, `clerkMiddleware` around the locale redirect, protect upload/edit/specs/stage/blob-token, and `units.owner_user_id`. Renters stay guests.
- If cut: the existing per-IP limits and spend breaker remain the abuse controls. Say so in the README judge notes.

### 6.10 Ship (Nov 2–3, Nov 4 buffer)
- README final pass:
  - "What we built", models used, bring-your-own `META_API_KEY`, judge notes on limits.
  - The WhatsApp number for testing (only allow-listed numbers if still in test mode).
  - ~~Source note for the menus~~ (menus removed 2026-11-02).
- Cold run on prod by someone other than the builder, AR RTL and EN LTR, recorded here. Record the 3-minute demo on Nov 3 (show WhatsApp booking and the nearby places). Submit Nov 4.
- Voice notes (old 6.9): cut 2026-10-31, **reopened and built 2026-11-02** (owner): `lib/audio.ts` (ffmpeg-static, Meta's command `-ac 1 -ar 24000 -c:a pcm_s16le`, bitexact, 10 s kill), `meta.product.transcribe` -> `POST /v1/asr/transcribe` (multipart `request` JSON + `audio` WAV; the documented endpoint, `/v1/audio/transcriptions` 404s), 1 MB cap, limits before cost, spend $0.18 per audio hour. One real OGG probe returned 200 locally; the build traces the binary into the webhook. Not yet: Vercel runtime, real Egyptian-Arabic notes.

**Step 4 done 2026-11-01 (uncommitted).** `unit_places` migrated (place_id, name, type, distance, Maps link, matched brand; only what we display, per Places terms). [lib/places.ts](../../lib/places.ts): Places Nearby Search (New), Pro SKU fields only, radius **1 km** (owner 2026-11-01, was 500 m), 20 nearest by distance; alias pre-filter (Arabic/English normalised) then one `PLACE_MATCH_V1` call via `meta.public` (Modal locally) only for names that pass; keep 2 per unit, matched chains first. Pipeline step `places` queued on upload with `analyze`; `pnpm places-units [--dry] [--only]` for existing units. Run: 13 Places calls (~$0.42 list), 13/13 units stored, 26 places, 12 matched. **Owner check passed:** `full` (Pioneer Plaza) -> "Second cup new capital golden tower", 227 m, Second Cup menu (plus R3 Dunkin' at 903 m because of the 1 km radius). Units with a menu: 8/13 (full, empty2, gen-zamalek, gen-new-cairo, gen-downtown, gen-alex-chatby, gen-alex-louran, gen-october); none yet: empty1, gen-heliopolis, gen-sheikh-zayed, gen-alex-smouha, gen-nasr-city (their 20 nearest within 1 km are independents; all five use approximate district centres). Plan target was 10/13.
- **Removed 2026-11-02 (menus gone):** brand matching (`PLACE_MATCH_V1`) and the popularity fallback, which only existed to find chains; `refreshPlaces` now keeps the 2 nearest food places from one distance-ranked search. Stored places were kept (Google Places fields only).
- **Popularity fallback (owner 2026-11-01).** When the 20 nearest contain no known chain, `refreshPlaces` runs one more Nearby Search ranked by POPULARITY in the same 1 km and picks again; unmatched picks must be a food place type (drops supply shops, buildings, play areas). Built into the pipeline `places` step, so new listings get it automatically (1 call, or 2 when no chain is near). Ran `pnpm places-units --fallback-only` on the 5 units: 5 Places calls (~$0.16 list). **Now 13/13 units have a chain menu nearby, 22 of 26 stored places matched**: empty1 Tseppas + Sale Sucre; gen-heliopolis PAUL + Second Cup Korba; gen-sheikh-zayed Costa + Pizza Hut (Gate Plaza); gen-alex-smouha Caribou + Buffalo Burger; gen-nasr-city Second Cup Makram Ebid + Costa.

**Step 6 built 2026-11-02. Superseded the same day: the menu data was removed (see DESIGN.md decision log); nearby places now show Google fields only and add-ons are the venue's own.** Original notes: [lib/nearby.ts](../../lib/nearby.ts) reads a unit's places + matched menu (add-on id `m:<brand>:<index>`). Unit page: "Nearby to eat & drink" section ([components/NearbyPlaces.tsx](../../components/NearbyPlaces.tsx)): place, distance, Maps link, top 6 menu items with prices, "menu not listed yet" for unmatched places, "Places from Google Maps" attribution and a source label for the menus. Add-ons ([lib/addons/catalog.ts](../../lib/addons/catalog.ts)): the placeholder "Demo Cafe" items are gone; a unit's catalogue is its nearby chains' menus (daily bookings only) + 3 venue items. `createBooking` takes prices only from that catalogue (a forged price is ignored, a chain not near the unit is `ADDON_NOT_FOUND`, a menu item on a monthly booking is `ADDON_DAILY_ONLY`); stored names carry the brand ("Cappuccino · Caribou Coffee"); WhatsApp order + `sent_to_cafe` now key on `m:` ids. Booking form groups add-ons per place (collapsible). Agent: `AGENT_PROMPT_V3` drops the fixed ADDONS list; new tool `nearby_places(slug)` (menus with ids for day-bookable units, info only otherwise, plus venue add-ons); `search_units` takes `near` (19 hand-typed landmarks in [lib/landmarks.ts](../../lib/landmarks.ts), Arabic/English aliases, sorted by straight-line km; unknown landmark returns the list). Monthly tenants get the info + Maps link only (we hold no cafe phone numbers; the plan's "cafe WhatsApp link" would need Places contact fields). Checked: EN + AR (RTL) unit page and booking form; scripted bookings (daily with Caribou cappuccino + whiteboard = 900 + 200 + 100, other-chain and monthly cases rejected; test rows deleted); "near AUC" ranks empty2 (New Cairo, 3.2 km) then gen-new-cairo (6.7 km). Typecheck + lint pass. **Not yet run:** chat acceptance (paid `muse-spark-1.3` run) and a live "near AUC" chat; waiting for owner go.

**Removed 2026-11-02:** the menu part of step 6 (menu items as add-ons, per-place grouping, the cafe WhatsApp order link). Nearby shows place, distance, Maps link and attribution; add-ons are the venue's own (room extras + house coffee & snacks on day bookings, `AGENT_PROMPT_V8`).

**Step 7 verify, 6.7 closed 2026-11-02.**
- `pnpm chat-acceptance` on `AGENT_PROMPT_V3`: **10/10** (40 tool calls; 4 test bookings + 10 sessions cleaned). Scenario 7 ("2 كابتشينو" in Smouha) now goes through `nearby_places`: 2 x Caribou cappuccino at the menu price 100, total 900 + 200 = 1,100 EGP.
- Live chats (synthetic, sessions deleted): "عايز مكتب جنب الجامعة الأمريكية" -> `search_units {near: "AUC"}` -> both New Cairo units, ~3.2 km and ~6.7 km, and it explained the first is long-term only. "What's near the Zamalek office to eat" -> `nearby_places` -> Anas El Demashqy and Crave with distances, food add-ons for day bookings only, order directly for monthly.
- Checklist: every unit has coordinates (13/13); units with a matched chain menu 13/13 (target 10); a failed step retries alone (step 2); chat "near AUC" ranks New Cairo first; acceptance still 10/10.
- Not yet seen on production: the `places` step on a fresh upload (built and run locally via `pnpm places-units`, same code path) and the Nearby section after deploy. Check both on the next deploy; the 6.10 cold run covers it.

**Cleanup 2026-10-31 (owner request).** Removed obsolete seeding/one-off files: `scripts/seed.ts`, `scripts/upload-demo.ts`, `data/seed/blob-urls.json` and the six `full`/`empty1`/`empty2` specs/listing JSONs (Oct 27 seeding; superseded by `remodel-filmed`/`reassess-units`, and a re-run would have overwritten live listings), `scripts/run-unit.ts` (replaced by the pipeline jobs), `scripts/generate-home-art.ts` (art done), a one-off menu probe script, plus ignored test leftovers (`.scratch/` contents, legacy `.data/`). Kept the re-runnable tools: migrate, chat-acceptance, check-rubric, generate-units (+ synthetic briefs), remodel-filmed, reassess-units, stage-units, topup-availability, backfill-locations, brand-assets (the two menu scripts were removed 2026-11-02). README/AGENTS/DESIGN references updated.

## Handoff
State on 2026-11-02 (end of session 2). Committed and pushed through `1eef773`; **this session's work is uncommitted** (owner reviews and commits). Lint 0 errors, typecheck clean, `pnpm build` passes. Migrations run on Neon: `units.owner_wa_id`, `login_codes` (+ `pending_at`), `owner_epochs`, `idx_usage_kind_key`.

Done this session (each part reviewed by a separate agent, fixes applied):
- **Review fixes (item 1 of the previous handoff):** booking GET no longer returns renter name/phone/email/wa_id and the cafe order link has no name/phone; web chat rejects `wa_` session ids and uses random UUIDs; `GUARD_SALT` fails closed on Vercel (`lib/salt.ts`); `getBooking` returns 404 for malformed ids; link-code messages are rate limited (`wa_link`) and only link held/paid bookings; dedupe survives Cairo midnight; `deliver_at` validated; booking links follow the renter's language.
- **Demo listings preview-only:** 13 seeded slugs (`lib/demo-units.ts`); edits validated against 9 allowlisted fields (`lib/specs-edit.ts`), stored in one `offisio_preview` cookie (3000-char cap), "Your edit" marks + Reset bar; stage/pipeline return preview on them; localized enum labels. Browser-checked EN + AR + 390 px.
- **Voice notes:** see the 6.10 note above. `ffmpeg-static` added by the owner (allowBuilds in pnpm-workspace.yaml).
- **WhatsApp bookings list:** `lib/booking-labels.ts`, `AGENT_PROMPT_V7` (unit title, district, weekday date, status, ref last in backticks; expired holds hidden), friendlier paid and linked notices.
- **6.9 owner sign-in:** see 6.9 above.
- Chat acceptance on V7: **12/13**. Scenario 8 (bad phone, web) failed: it used today's date and the agent answered about availability instead of asking for the phone; likely the same-day date, not V7. Fix idea: make the script skip today, then re-run 8 (paid, ask the owner).

Next session:
1. Owner: commit (suggested split: review fixes / demo preview / voice notes, with the dependency reason "Meta ASR accepts only 16/24 kHz mono PCM WAV; WhatsApp sends OGG/Opus" / bookings list V7 / owner sign-in / docs); set `OWNER_SESSION_SECRET` and check `GUARD_SALT` in Vercel **Production and Preview**; deploy through a Vercel remote build (not from Windows: the Linux ffmpeg binary must be installed there).
2. Production check: build log shows the ffmpeg-static install ran; one ~3 s voice note gives `[meta] /asr/transcribe 200`; sign in from a real phone (code, YES, signed in; then "Offisio logout"); "what are my bookings"; unit page Nearby (EN + AR); booking-page WhatsApp button.
3. Egyptian-Arabic voice quality: the owner records 2–3 notes, then `pnpm tsx scripts/test-transcribe.ts <file>`. **Done 2026-11-02** on a real WhatsApp note (exact transcript, correct reply); see [07](07-judge-access.md) 7.3.
4. **Done 2026-11-02:** organizers advised using only data we have rights to, so the third-party menu data is removed (files, scripts, table, UI, agent); Places names and venue add-ons kept, plus house coffee & snacks at our own demo prices.
5. 6.10 ship: README pass, cold run AR + EN, 3-minute video on Nov 3 (depth story: survey -> rubric -> "Suitable for" -> staging; no SAM beat), submit Nov 4, 9 pm ET.

Known nits: the Arabic location line mixes English ("Zamalek, Cairo · أدوار 4th"); the browser's own validation bubble is English on /ar; districts are stored in English only (the agent translates); code-relay phishing is mitigated by the YES warning, not eliminated.
