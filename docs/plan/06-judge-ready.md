# Segment 6 — Judge-ready: demo data, staging coverage, agent, guardrails, ship

Status: **in progress** — 6.1–6.5 done, 6.6 staging code + filmed units done 2026-10-30; synthetic regeneration waits on owner review of `data/seed/synthetic-briefs.json` (all uncommitted, owner reviews and commits) (planned 2026-10-29 from the post-audit review) · Depends on: Segments 2–5 (all demo-scope done)

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
  - **O8:** voice stays a stretch goal, go/no-go at the end of Nov 1.
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
  - Open owner question (docs/RUBRIC.md): may a dental unit repurpose its *only* bathroom as the prep room?

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
  - **Waiting on owner:** review of [data/seed/synthetic-briefs.json](../../data/seed/synthetic-briefs.json) (10 floor-plan briefs, 48 frames). After approval: rewrite `scripts/generate-units.ts` for per-space frames, regenerate, run analysis + staging (~$1.50 total), then a clean 10/10 `pnpm chat-acceptance`.

### 6.7 Location, minimal (Nov 2) — scope check
- Migration (approved): `units.lat`, `units.lng` numeric, idempotent `add column if not exists`, `pnpm migrate`, verify the columns.
- Seed coordinates: district centroid, labelled "approximate area". Upload form: an optional lat/lng or pasted Google Maps link, parsed server-side.
- Unit page: "Open in Maps" link (no map library).
- Agent `near`: haversine against `lib/geo/landmarks.ts` (about 15 landmarks: universities, metro stations, Bibliotheca Alexandrina…).
- Not building (parked, O6): Overpass cafes, the nearby-cafe pipeline, QStash.
- Verify: every unit has coordinates and a working maps link. Chat "near the AUC in New Cairo" ranks New Cairo units first.

### 6.8 Owner auth with Clerk (Nov 2) — 5 / O2 / O3
- Install through the **Vercel Marketplace** (`vercel integration add clerk` or the dashboard), which provisions `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. SDK `@clerk/nextjs` v7 (Core 3: `await auth()`, `await auth.protect()`). Add the Clerk vars to `.env.example`.
- Google sign-in on a **Clerk development instance** (owner decision): Clerk's shared Google credentials, so there's no domain or Google Cloud setup. The dev badge and user limits are accepted for the demo.
- [proxy.ts](../../proxy.ts): wrap the existing locale redirect inside `clerkMiddleware(async (auth, req) => …)`, and keep the matcher so API routes still run through it. Protect `/[lang]/upload`, `/[lang]/units/[slug]/edit`, `POST /api/units/upload`, `POST /api/units/specs`, the stage route, and the `/api/blob/upload` token issue. **Public:** browse, unit pages, chat, bookings, checkout, webhook (guest renters).
- [app/[lang]/layout.tsx](../../app/[lang]/layout.tsx): `<ClerkProvider>` goes **inside `<body>`** (required with `cacheComponents: true`). Localized sign-in and sign-up pages at `/[lang]/sign-in/[[...sign-in]]` and `/[lang]/sign-up/[[...sign-up]]` (Clerk `ar` localization plus RTL check). `<UserButton />` in the header for owners.
- Schema: `units.owner_user_id text` (null for seeded units, which are therefore read-only). Edit and stage check `owner_user_id === userId`. Uploads stay unlisted on the homepage (O3), but the column already allows a later "my listings".
- PII: owner email and name live in Clerk only. No model ever receives them, and they never touch a contributor model.
- Verify: signed out, `/upload` redirects to sign-in and the upload/specs APIs return 401. The owner can edit their own unit, another owner gets 403, and seeded units return 403. A guest renter books and pays with no login. Google sign-in works on prod in both AR (RTL) and EN.

### 6.9 Voice note, stretch (likely cut; go/no-go Nov 2) — 6-7
- Go/no-go at the end of Nov 1 (O8). First a U5 one-call test of `muse-voice-transcribe-1.0` with one owner-recorded Egyptian-Arabic note (shape, formats, quality).
- If it's a go: record in ChatBox (MediaRecorder) → `POST /api/chat/voice` (≤ 30 s, ≤ 2 MB, counted in the chat limits) → transcript shown in the bubble → normal agent turn with `created_via='voice'`. PII routing: transcribe model, then `meta.product` only.
- Verify: 5 voice notes covering search and booking intents. Text chat is unaffected when voice is off.

### 6.10 Ship (Nov 2–3, Nov 4 buffer)
- README final pass: "What we built" section, models used, bring-your-own `META_API_KEY` for local runs, judge notes on limits and the quota message.
- Cold run on prod by someone other than the builder, AR RTL and EN LTR, recorded here. Record the 3-minute demo on Nov 3. Submit Nov 4.

## Handoff
Next session starts at 6.1. The 6.5 and 6.6 runs are approved (dry run above); they run once their code lands. Before 6.3: owner supplies per-token prices.
