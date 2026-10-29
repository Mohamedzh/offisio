# Segment 6 — Judge-ready: demo data, staging coverage, agent, guardrails, ship

Status: **planned** (2026-10-29, from the post-audit review) · Depends on: Segments 2–5 (all demo-scope done)

Goal: the deployed demo holds up when judges use it unattended (Nov 5–8) on a fixed $150 credit budget. That means bookable dates, the staging headline on every listing, a correct agent, hard usage limits, and docs that match the code.

Supersedes [05-demo-polish.md](05-demo-polish.md) "Final consolidated plan" steps 4–8. Steps 1–3 there are done.

## Decisions (owner, 2026-10-29)

- Repo docs win over kickoff prompts; every conflict gets flagged.
- SAM 3.1 stays dropped. Staging means prompt-guided `muse-image-1.0` edits: an empty base, then 3 styles.
- **Video upload is allowed** (this replaces the kickoff rule "video never uploads"). The source video goes to Blob for playback. Keyframes are still extracted in the browser, and only frames reach the model.
- Default locale stays `en` for judges. Arabic stays a full RTL variant.
- XPay stays sandbox-only. Location stays minimal (6.6).
- D5 is revised: more staged units across more places and layouts (6.5).
- Open points resolved the same day:
  - **O1:** seeded units are pre-staged. A live upload gets the empty image plus one owner-picked style; the other styles render on click (cached, budgeted).
  - **O2:** owners sign up with **Clerk** (Google sign-in). Renters book and pay as guests with no login. This replaces "real auth out of scope", and the new `@clerk/nextjs` dependency is the owner's request (cite it in the commit).
  - **O3:** uploads are unlisted for now; a later decision may add "my listings" for owners.
  - **O4:** about $50 of credits remain, then the owner's card pays as you go, with a spend notification. The ceiling is an **abuse circuit breaker, not a budget cap**. Judges must never hit it in normal use.
  - **O5:** tool loop, if the one-call tool-calling test passes.
  - **O6:** QStash order status and Overpass nearby cafes are **parked**. They may be re-planned after the hardening work.
  - **O7:** README credits development as about 50/50 Muse models and Claude, without underselling the Muse side.
  - **O8:** voice stays a stretch goal, go/no-go at the end of Nov 1.

## Open points

All of O1–O8 are resolved (see Decisions). Still to confirm during the steps:
- Per-call prices for spark and image calls, so the ceiling's cost estimate is real (6.3). Meter one call of each, or read Meta billing.
- Clerk: whether production instances accept `*.vercel.app`, plus Google OAuth credentials (6.7). The owner provides them.

## Steps (each one is a commit or a small series; lint and typecheck before every commit)

### 6.1 Docs unify (Oct 30, morning) — 6-6
Bring older docs up to the newer decisions, cross-checked against the code. Keep decision-log history and mark superseded text rather than deleting it.
- [AGENTS.md](../../AGENTS.md): locale `en` default. Scope: payments (XPay test) and a minimal location pin are in. Routing table: add `muse-voice-transcribe-1.0` for voice notes (it isn't a contributor model; the table currently says "spark only"). Document the dev contributor switch (6.3). Mark `sam-3.1` dropped.
- [ARCHITECTURE.md](../ARCHITECTURE.md): §2 out-of-scope list, §3 diagram (SAM dropped, video stored), §9 (Blob direct upload).
- [docs/DESIGN.md](../DESIGN.md): header locale. Decision log: video upload, en default, D5 revision. §5 marked "as built" versus planned. §9 out-of-scope list.
- [PRODUCT.md](../../PRODUCT.md): media lives on Blob, not `public/demo`. Out-of-scope list.
- [README.md](../../README.md): merge the duplicate "Built during the hackathon" headings, drop `sam-3.1` from product models. O7: development credited about 50/50 to Muse models (`muse-wonder-1.0` planning, contributor agents) and Claude. Concrete, not underselling either side.
- [.env.example](../../.env.example) and PLAN env contract: move the `QSTASH_*` vars under a "parked (O6)" comment, add the Clerk vars when 6.7 lands.
- [PLAN.md](../PLAN.md): fix the anachronistic "Done 2026-10-27 … xpay" line. Env contract adds `BLOB_READ_WRITE_TOKEN` (`QSTASH_*` marked parked). [04](04-booking-agent.md): a Paymob → XPay pointer. [05](05-demo-polish.md): mark the post-switch Paymob "Dashboard inspection" bullet superseded.
- Verify: `grep -ri paymob` hits only decision logs and history; every doc's locale, scope and model list agrees.

### 6.2 Booking data correctness (Oct 30) — 6-1 dates
- [lib/db/store.ts](../../lib/db/store.ts): `availabilityByDay` and `freeDates` hide days before today (Cairo). Add per-unit `freeDays(slug, n)`.
- Expire unpaid holds: `awaiting_payment` older than 30 min gets released lazily before availability reads and before `createBooking`. Status `expired`; reuse the `failBooking` release logic in [lib/booking.ts](../../lib/booking.ts). No cron.
- Rolling availability: [scripts/seed.ts](../../scripts/seed.ts) and `generateAvailability` build slots from today through **2026-12-15**, idempotently. One-time top-up of all live units. Purge or flag old test bookings after reviewing them in the DB first.
- Checkout return URL uses the booking's locale, not a hardcoded `/en` ([lib/xpay.ts](../../lib/xpay.ts)).
- Verify: on prod, `/api/availability` for every unit shows ≥30 free future days and no past days. An abandoned booking frees its day after 30 min (test with an env override of the TTL).

### 6.3 Guardrails and cost controls (Oct 30–31) — §4 / 6-4, the dev switch
Lands **before** any batch generation in 6.5. No new dependency: counters are Postgres upserts. Per-IP limits apply to guests. A signed-in owner gets per-user limits once 6.7 lands.
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

### 6.4 Agent fixes (Oct 31) — 6-3
- [lib/agent/agent.ts](../../lib/agent/agent.ts): server-injected Cairo date and weekday (the hardcoded `2026-10-27` goes). Per-unit `daily_egp` (the hardcoded 800 goes). Per-unit free days. Compact unit context (slug, district, kind, rents, desks, area, lat/lng after 6.6) instead of the full specs JSON.
- First, one synthetic call through `meta.public` (contributor allowed for synthetic data) to test tool calling, U4. If it passes (O5), switch to the DESIGN §5 tools: `search_units`, `get_unit`, `check_availability`, `create_booking` (and `near` after 6.6), with a 6-round cap and per-tool argument validation.
- Verify: 10 scripted Egyptian-Arabic conversations using synthetic names and phones (happy path, slot taken, no results, bare unit asked for a day, English mirror, off-topic refusal, add-ons, a bad phone, a changed date, "near X"). They run on `muse-spark-1.3` because chat is PII by rule, so they need **owner approval first** (about 60 calls). Record the transcripts in this file.

### 6.5 Staging coverage and demo data (Oct 31–Nov 1) — 6-1 / 6-2
- `lib/pipeline/staging.ts`: move `empty` and `restage` out of [scripts/run-unit.ts](../../scripts/run-unit.ts) into a re-runnable step that is cached and budgeted. One style runs per request, to stay under the 300 s limit. Semifinished units skip the empty step.
- Route `POST /api/units/[slug]/stage?style=` and viewer states (pending / rendering / done), following O1.
- Demo inventory, target ~13 units (3 filmed, about 10 synthetic), **every unit fully staged**:
  - Places: Maadi, Zamalek, Downtown, Garden City, Heliopolis, Nasr City, New Cairo, Sheikh Zayed, 6th of October, Alexandria (Chatby, Louran, Smouha).
  - Layouts: 2–4 desk private office, open-plan 12–20 desks, meeting room, semifinished shell (clinic-ready), training hall, villa-floor office.
  - A mix of furnished (daily and monthly) and semifinished (long-term). Realistic, varied rents.
  - Extend [scripts/generate-units.ts](../../scripts/generate-units.ts) with briefs and a `--stage` flag. Synthetic badge unchanged.
- Batch estimate: about 20 new frame generations, about 40 staging edits, and 8 spark calls. **Owner approves the batch and its cost before it runs** (dry-run first to print the call count).
- Verify: every unit page shows real, empty (furnished units) and 3 fits. All media URLs return 200. A side-by-side drift check of the 3 styles on each unit, where a drifted style is re-run alone.

### 6.6 Location, minimal (Nov 1) — scope check
- Migration (approved): `units.lat`, `units.lng` numeric, idempotent `add column if not exists`, `pnpm migrate`, verify the columns.
- Seed coordinates: district centroid, labelled "approximate area". Upload form: an optional lat/lng or pasted Google Maps link, parsed server-side.
- Unit page: "Open in Maps" link (no map library).
- Agent `near`: haversine against `lib/geo/landmarks.ts` (about 15 landmarks: universities, metro stations, Bibliotheca Alexandrina…).
- Not building (parked, O6): Overpass cafes, the nearby-cafe pipeline, QStash.
- Verify: every unit has coordinates and a working maps link. Chat "near the AUC in New Cairo" ranks New Cairo units first.

### 6.7 Owner auth with Clerk (Nov 1) — 5 / O2 / O3
- Install through the **Vercel Marketplace** (`vercel integration add clerk` or the dashboard), which provisions `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. SDK `@clerk/nextjs` v7 (Core 3: `await auth()`, `await auth.protect()`). Add the Clerk vars to `.env.example`.
- Google sign-in: dev instances use Clerk's shared Google credentials. **Production needs the owner's own Google OAuth client** (ID and secret from Google Cloud Console, redirect URI from the Clerk dashboard). Verify first whether a Clerk production instance accepts `offisio.vercel.app`. If it needs an owned domain, either add a cheap domain or run a dev instance for the demo (accepting its badge and limits). Decide before coding.
- [proxy.ts](../../proxy.ts): wrap the existing locale redirect inside `clerkMiddleware(async (auth, req) => …)`, and keep the matcher so API routes still run through it. Protect `/[lang]/upload`, `/[lang]/units/[slug]/edit`, `POST /api/units/upload`, `POST /api/units/specs`, the stage route, and the `/api/blob/upload` token issue. **Public:** browse, unit pages, chat, bookings, checkout, webhook (guest renters).
- [app/[lang]/layout.tsx](../../app/[lang]/layout.tsx): `<ClerkProvider>` goes **inside `<body>`** (required with `cacheComponents: true`). Localized sign-in and sign-up pages at `/[lang]/sign-in/[[...sign-in]]` and `/[lang]/sign-up/[[...sign-up]]` (Clerk `ar` localization plus RTL check). `<UserButton />` in the header for owners.
- Schema: `units.owner_user_id text` (null for seeded units, which are therefore read-only). Edit and stage check `owner_user_id === userId`. Uploads stay unlisted on the homepage (O3), but the column already allows a later "my listings".
- PII: owner email and name live in Clerk only. No model ever receives them, and they never touch a contributor model.
- Verify: signed out, `/upload` redirects to sign-in and the upload/specs APIs return 401. The owner can edit their own unit, another owner gets 403, and seeded units return 403. A guest renter books and pays with no login. Google sign-in works on prod in both AR (RTL) and EN.

### 6.8 Voice note, stretch (Nov 2) — 6-7
- Go/no-go at the end of Nov 1 (O8). First a U5 one-call test of `muse-voice-transcribe-1.0` with one owner-recorded Egyptian-Arabic note (shape, formats, quality).
- If it's a go: record in ChatBox (MediaRecorder) → `POST /api/chat/voice` (≤ 30 s, ≤ 2 MB, counted in the chat limits) → transcript shown in the bubble → normal agent turn with `created_via='voice'`. PII routing: transcribe model, then `meta.product` only.
- Verify: 5 voice notes covering search and booking intents. Text chat is unaffected when voice is off.

### 6.9 Ship (Nov 2–3, Nov 4 buffer)
- README final pass: built during the hackathon, models used, bring-your-own `META_API_KEY` for local runs, judge notes on limits and the quota message.
- Cold run on prod by someone other than the builder, AR RTL and EN LTR, recorded here. Record the 3-minute demo on Nov 3. Submit Nov 4.

## Handoff
Next session starts at 6.1. Before 6.4 or 6.5: owner approves the scripted-chat run and the generation batch (dry-run counts first). Before 6.7: confirm the Clerk domain question and get Google OAuth credentials.
