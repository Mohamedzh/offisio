# Offisio — Detailed Design

Status: Step 1 draft for review (Oct 26). Stack: Next.js 16 App Router, TypeScript strict, Tailwind 4, Postgres on Neon, Vercel Blob, Vercel deploy. All AI via Meta Model API (`https://api.meta.ai/v1`, OpenAI-compatible). English default UI (owner decision 2026-10-27, kept for judges), full Arabic (RTL) variant under `/ar`.

Owned decisions where this differs from [ARCHITECTURE.md](ARCHITECTURE.md) (agreed at Checkpoint 0):

| # | Change | Why |
|---|---|---|
| D1 | ~~Segmentation runs per-keyframe (images) as the main path; video tracking optional~~ **Superseded 2026-10-27: SAM dropped**, prompt-guided edits only (decision log) | We stage stills. Per-frame masks need no video API and no tracking |
| D2 | "Empty" is the staging base, not a 4th style | All 3 styles derive from one empty image; that is what keeps walls/windows consistent |
| D3 | Specs are owner-editable estimates with confidence, never presented as measured | Vision cannot measure m² reliably |
| D4 | Owner enters district, rent (EGP/month), floor, available-from at upload | Cannot be inferred from video; realistic listing needs them |
| D5 | Demo seed target is 4–5 polished units, not 10–15. **Revised 2026-10-29:** ~13 units (3 filmed + synthetic, badged), every one fully staged, across more districts and layouts ([plan/06](plan/06-judge-ready.md) 6.6) | Solo, 9 days; quality beats breadth for judging |
| D6 | Chat UI is a generic messaging UI, no WhatsApp branding | Trademark risk, zero demo gain |
| D7 | `muse-spark-1.3-contributor` only for synthetic/public test data, never PII | Contributor content may train Meta models. See PII routing in [AGENTS.md](../AGENTS.md) |

Test footage (owned, licensed): a furnished 3-desk office and a meeting room, shot on phone. These are the capability-test and demo inputs. No stock or third-party assets anywhere.

## 1. Pipeline

Upload is one user action; every step after it is a persisted, independently re-runnable job step. Step state lives on the unit row (`pipeline_steps` JSONB, see §3) so the UI polls one row, and any step can be re-run from an admin button without touching the others.

```
video ─► S0 ingest ─► S1 keyframes ─► S2 segment ─► S3 specs ─► S4 listing ─► S5 empty ─► S6 restage ×3 ─► ready
 (Blob)   (row+urls)   (6–10 jpg)     (masks PNG)   (JSON)     (AR/EN)     (1 img)    (3 imgs)
```

| Step | Inputs | Outputs | Exact Meta call | Re-run cost |
|---|---|---|---|---|
| S0 Ingest | Owner form (district, rent, floor, available-from) + video file | `units` row (status `processing`), video in Blob | none | free |
| S1 Keyframes | Video (browser `<video>`+canvas, seek every ~3 s, dedupe by perceptual hash in-browser if trivial, else fixed picks) | 6–10 keyframe JPEGs in Blob, `media(kind=keyframe)` | none | free |
| ~~S2 Segment~~ (dropped 2026-10-27; no step runs) | Best 3 keyframes (sharpest/widest, picked in S3 pre-pass or owner picks hero frame) | Mask PNGs per prompt per frame, `media(kind=mask)` | SAM 3.1, text prompts `desk, chair, window, floor, wall, door, air conditioner` — endpoint shape unverified (U2) | per frame |
| S3 Specs | All keyframes + owner fields | Validated specs JSON (§4), `specs` row | `muse-spark-1.3`, `POST /v1/chat/completions`, images as content parts, `response_format` JSON schema (U4) | 1 call |
| S4 Listing | Specs JSON + owner fields | `title_ar/en`, `summary_ar/en`, `highlights_ar/en[]` on `units` | `muse-spark-1.3`, `POST /v1/chat/completions`, JSON schema | 1 call |
| S5 Empty | Hero keyframe + its furniture mask (desk+chair+sofa merged) | Empty-room image, `media(kind=staged, style='empty')` | `muse-image-1.0` edit, mask if accepted (U1), else prompt-guided | 1 edit |
| S6 Restage | Empty image (same base for all styles) | 3 styled images, `media(kind=staged, style=…)` | `muse-image-1.0` edit ×3, style prompts in `lib/meta/prompts.ts` | 1 edit each; one style re-runnable alone |

Hero frame rule: staging runs on **one** hero keyframe only (owner can switch hero and re-run S5+S6). Staging all keyframes is a cut-line item, not v1 — it multiplies cost and inconsistency risk for no demo gain.

Failure isolation: each step writes `status: pending|running|done|failed`, `error`, `started_at`, `finished_at`, `model`, `ms` into `units.pipeline_steps`. A failure marks the unit `failed` with the step name; re-running that step resumes from stored inputs. No step deletes prior outputs — re-runs add a new `media` row and flip `is_current`.

## 2. Why remove-then-restage

One empty base → 3 edits. Walls, windows, floor and light direction are shared pixels in the base, so styles differ only in furniture. Editing each style directly from the furnished original would let the model redraw the room 3 different ways — the exact inconsistency the headline feature promises to avoid. If U1 shows mask-guided edits are unsupported, fallback is prompt-guided removal ("remove all furniture, keep walls/windows/floor exactly"), then optional mask-composite only if quality demands it (see §7 fallbacks).

## 3. Data model (Postgres / Neon)

Conventions: `id uuid PK default gen_random_uuid()`, `created_at timestamptz default now()`, money as integer EGP/month, all model output validated in code before insert. No auth tables (out of scope); units are reached by unguessable `slug` (nanoid) so demo links are not enumerable.

```sql
units(
  id uuid PK, slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'processing',  -- processing|ready|failed
  failed_step text,
  district text NOT NULL, rent_egp int NOT NULL, floor int, available_from date,
  title_ar text, title_en text, summary_ar text, summary_en text,
  highlights_ar jsonb NOT NULL DEFAULT '[]', highlights_en jsonb NOT NULL DEFAULT '[]',
  hero_media_id uuid REFERENCES media(id),
  pipeline_steps jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
)
specs(
  unit_id uuid PK REFERENCES units(id) ON DELETE CASCADE,
  data jsonb NOT NULL,            -- schema in section 4
  model text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
)
media(
  id uuid PK, unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  kind text NOT NULL,             -- video|keyframe|mask|staged
  style text,                     -- empty|startup|clinic|training (staged only)
  prompt_label text,              -- SAM text prompt (mask only)
  source_media_id uuid REFERENCES media(id),
  url text NOT NULL, is_current boolean NOT NULL DEFAULT true,
  meta jsonb NOT NULL DEFAULT '{}',  -- w/h, ms, model, seed if returned
  created_at timestamptz NOT NULL DEFAULT now()
)
availability(                      -- one row per bookable slot; booking flips it atomically
  id uuid PK, unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  is_booked boolean NOT NULL DEFAULT false,
  UNIQUE(unit_id, starts_at)
)
bookings(
  id uuid PK, unit_id uuid NOT NULL REFERENCES units(id),
  availability_id uuid UNIQUE NOT NULL REFERENCES availability(id), -- UNIQUE prevents double-book
  renter_name text NOT NULL, renter_phone text NOT NULL,  -- PII: product model only, never contributor
  created_via text NOT NULL DEFAULT 'chat',  -- chat|voice
  created_at timestamptz NOT NULL DEFAULT now()
)
chat_sessions(
  id uuid PK, unit_id uuid REFERENCES units(id),  -- nullable: search spans units
  messages jsonb NOT NULL DEFAULT '[]', tool_calls jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
)
```

Availability seeding: owner picks days; server generates 1-hour slots 10:00–17:00. Demo seed creates the next 7 days for seeded units. `create_booking` runs `UPDATE availability SET is_booked=true WHERE id=$1 AND is_booked=false RETURNING id` inside a transaction with the booking insert — zero rows returned means the slot was taken; the agent must offer alternatives. No check-then-book race.

Indexes: `media(unit_id, kind)`, `availability(unit_id, starts_at) WHERE NOT is_booked`, `units(status)`.

## 4. Specs step (S3) — prompt and schema

System prompt (`lib/meta/prompts.ts`, versioned as `SPECS_PROMPT_V1`):

> You estimate office specs from walkthrough keyframes. You are not measuring; give your best estimate and honest confidence per field. Count only what is visible. If a feature is not visible in any frame, return null for it — never guess a present value. Area: estimate from desk count, door width (~90 cm) and floor tiles if visible. Reply only with JSON matching the schema.

User content: keyframe images (in walk order) + owner fields as text (`district, floor`) so the model never has to invent them.

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["area_m2_estimate","windows_count","has_ac","desk_capacity","condition","natural_light","confidence"],
  "properties": {
    "area_m2_estimate": { "type": ["number","null"], "description": "Approx usable area, one decimal" },
    "windows_count":    { "type": ["integer","null"] },
    "window_orientation_hint": { "type": ["string","null"], "enum": ["street","courtyard","unknown",null] },
    "has_ac":           { "type": ["boolean","null"] },
    "ac_units_visible": { "type": ["integer","null"] },
    "desk_capacity":    { "type": ["integer","null"], "description": "Desks that fit comfortably, not maximum packing" },
    "condition":        { "type": ["string","null"], "enum": ["excellent","good","needs_paint","needs_work",null] },
    "flooring":         { "type": ["string","null"], "enum": ["tile","wood","carpet","concrete","unknown",null] },
    "natural_light":    { "type": ["string","null"], "enum": ["bright","moderate","dim",null] },
    "notes_ar":         { "type": ["string","null"], "description": "One short Egyptian-Arabic sentence on anything notable, else null" },
    "confidence": {
      "type": "object", "additionalProperties": false,
      "required": ["area_m2_estimate","desk_capacity","condition"],
      "properties": {
        "area_m2_estimate": { "type": "number", "minimum": 0, "maximum": 1 },
        "desk_capacity":    { "type": "number", "minimum": 0, "maximum": 1 },
        "condition":        { "type": "number", "minimum": 0, "maximum": 1 }
      }
    }
  }
}
```

Validation: parse with the schema (Zod, added at Scaffold with reason in commit); reject + one retry with the validation error appended; second failure marks S3 failed with raw output stored in `pipeline_steps.specs.raw` for debugging. UI renders estimates with "تقريبي / approx." and shows an owner edit form (plain inputs writing back to `specs.data`) before publish. Owner edits set `data.owner_edited=true`.

Listing step (S4) reuses the pattern: JSON schema `{title_ar,title_en,summary_ar,summary_en,highlights_ar[3..5],highlights_en[3..5]}`, Egyptian Arabic (not formal MSA) for AR copy, no invented amenities — prompt forbids mentioning anything absent from specs/owner fields.

## 5. Booking agent

> **As built (2026-10-30):** [lib/agent/agent.ts](../lib/agent/agent.ts) sends unit and free-day data in the prompt and gets back one validated JSON action (`none` | `create_booking`) per turn. The tool loop below is the target, planned in [plan/06](plan/06-judge-ready.md) 6.5 behind a one-call tool-calling test (U4). Bookings are created `awaiting_payment` and confirm only on a signed XPay webhook.

Transport: `POST /app/api/chat` with `{session_id?, unit_id?, message}` → server runs the loop, persists to `chat_sessions`, returns `{session_id, reply, booking?}`. Model: `muse-spark-1.3` via `meta.product` only (chat contains PII). Voice (stretch): client records audio → `muse-voice-transcribe-1.0` (`POST /v1/audio/transcriptions`, shape unverified U5) → transcript becomes the user message with `created_via='voice'`; transcript text is shown to the renter for correction before sending if transcription confidence is exposed, else sent directly with the raw transcript visible in the bubble.

System prompt outline (`AGENT_PROMPT_V1`):

- Role: Offisio booking assistant. Reply in Egyptian Arabic by default; mirror the renter if they write English. Short, friendly, no formal MSA.
- Grounding: only claim units, prices, and slots returned by tools. Never invent a unit, price, or time. If a tool returns nothing, say so and offer the closest alternative.
- Flow: understand need (district, desks, budget, date) → `search_units` → present at most 3 options with rent → `get_unit` on request → `check_availability` → collect name + Egyptian mobile (`01[0125]` + 8 digits) → confirm details back → `create_booking` → give booking ref (short id) and summary.
- One question at a time for missing fields. Confirm before booking, always.
- Refuse out-of-scope requests (payments, discounts, other cities' listings) briefly and return to the flow.

Tools (OpenAI function-calling shape; exact Meta tool-call dialect unverified, U4):

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `search_units` | `{district?: string, min_desks?: int, max_rent_egp?: int}` | `{units: [{id, slug, title_ar, district, rent_egp, desk_capacity, hero_url}]}` max 5 | Only `status='ready'` units |
| `get_unit` | `{unit_id}` | `{unit: {…specs, summaries, styled_urls, available_days}}` | For detail/photos questions |
| `check_availability` | `{unit_id, date: 'YYYY-MM-DD'}` | `{slots: [{availability_id, starts_at, ends_at}]}` unbooked only | Empty array is a valid answer, agent offers other days |
| `create_booking` | `{availability_id, renter_name, renter_phone}` | `{booking_id, unit_title_ar, starts_at}` or `{error: 'slot_taken'}` | Atomic flip (§3); phone validated server-side before insert |

Loop: `messages → model → if tool_calls: execute all, append results, repeat (max 6 rounds) → final text`. Guards: max 6 tool rounds then force a text answer; tool args validated per-tool before execution (bad args → error result back to the model, never a 500); every round persisted (`messages`, `tool_calls`) so a crashed request can resume and the demo can show the trace. Timezone: Africa/Cairo everywhere; dates from the model are interpreted as Cairo local and converted server-side.

## 6. Error handling and re-runs

| Failure | Behaviour |
|---|---|
| Meta API timeout / 5xx | Retry ×2 with backoff (2 s, 8 s) inside `lib/meta`; then step fails with provider error stored |
| Invalid specs/listing JSON | One schema-feedback retry, then step `failed` (raw kept) |
| Image edit drifts (walls move) | Not auto-detected in v1; owner sees result, re-runs that style or S5 alone. (Auto image-diff check is a cut-line nicety) |
| Slot race | Atomic update returns `slot_taken`; agent re-checks and offers nearest slots |
| Agent loop exceeds rounds / bad tool args | Graceful Arabic fallback message; trace kept for debugging |
| Upload too large / not a video | Client-side reject before upload (≤ 100 MB, `video/*`); server re-checks mime |

Re-run API: `POST /app/api/units/:id/steps/:step` (`segment|specs|listing|empty|restage? style=`) — each handler reads only stored inputs, so any step runs alone. This is the iteration loop for staging prompts during development, not just error recovery.

## 7. Unknown Meta API capabilities — test before building on them

Nothing below is assumed. Each gets a `scripts/` test at Checkpoint 3, before the dependent feature is built. Guessed shapes are the OpenAI-compatible defaults.

| # | Unknown | Quick test | If false → fallback |
|---|---|---|---|
| U1 | `muse-image-1.0` edits accept a mask image (and whether mask is white=edit or black=edit) | 1 furnished frame + SAM furniture mask → removal edit; inspect edges/walls | Prompt-only removal; optionally composite unmasked pixels back in code |
| U2 | SAM 3.1 endpoint shape: image vs video input, text-prompt format, mask output format (PNG/RLE/URL), Files API for video | Segment hero frame with `desk, chair, window, floor`; time it. Then one short clip if image path works | Images only (already the main path, D1); video is dropped with no design change |
| U3 | Removal/restage fidelity: walls, windows, floor survive an edit; restyle from empty keeps geometry | S5+S6 on the 3-desk office frame; side-by-side check | Tighter prompts ("change furniture only"); fewer, closer styles; pick best-of-2 seeds if a seed param exists |
| U4 | `muse-spark-1.3` structured output + tool calling: `response_format` JSON-schema support, image content parts, function-call dialect, Egyptian Arabic quality | Specs call on 3 keyframe sets vs known room truth; 10 scripted Arabic booking chats incl. dialect spellings | Prompt-embedded JSON + strict parse/retry; narrower agent flow with quick-reply buttons for slots |
| U5 | `muse-voice-transcribe-1.0`: endpoint, Arabic/Egyptian dialect support, audio formats, word confidence | 5 recorded Egyptian Arabic notes (search + booking intents) | Cut voice (stretch only); text chat ships |
| U6 | Cost/latency/rate limits per call (image edits esp.) and contributor-vs-base quality gap on synthetic prompts | Time + log every test call (frames, images, ms); same synthetic prompt on both Spark variants | Budget staging to hero frame ×3 styles (already v1); contributor restricted to prompt tests |
| U7 | `muse-spark-1.3-contributor` exact ID and training-use terms | One synthetic (no-data) call; confirm ID resolves | Use base model everywhere; cost saving was optional |

## 8. UI notes

Routes (all under `/[lang]`, `en` default, `ar` RTL): `/` (unit grid), `/units/[slug]` (specs card, before/after slider, style switcher, chat entry), `/upload` (owner form + video), `/chat` (booking). `lang`/`dir` switch at root layout: `ar` → `dir="rtl" lang="ar"`, `en` → LTR. Logical Tailwind properties only. Before/after slider and style switcher are the demo centrepiece — they get polish priority over the grid.

## 9. Deliberately not designed (out of scope)

~~Payments~~ (now XPay test mode, decision log 2026-10-27/29), ~~real auth~~ (now Clerk owner sign-in only, 2026-10-29), reviews, map search (a per-unit pin + agent "near X" is in), host analytics, mobile apps, multi-hero staging, auto quality-scoring of edits, WhatsApp integration (outbound `wa.me` cafe link only), QStash order status and Overpass nearby cafes (parked). Listing them so no segment brief reintroduces them.


## Decision log

- 2026-10-27: SAM 3.1 dropped for now (future consideration). Listed in /models but no callable segmentation endpoint in the OpenAI-shaped Meta API. Prompt-guided muse-image-1.0 removal passed on furnished (full) + bare (empty1/empty2, near-identity no-op), 0 retries, so masks have no failure to fix. Revisit only if removal warps walls/leftover furniture on a future unit, or a hosted SAM endpoint ships. Segmentation was never a Wonder cost — specs use muse-spark-1.3, renders muse-image-1.0.
- 2026-10-27: Rental model — daily flex (furnished, min 1 day; hourly 4-6h considered later), monthly furnished, long-term bare/semifinished where renter does final fit-out. AI fit-visualization (startup/clinic/training from the real room) is the selling tool for bare units. Add-ons via booking agent (coffee etc.) start as agent-collected requests itemized on the bill, partner-fulfilled; no live cafe ordering/payment integration in demo scope.

- 2026-10-27: 3-track catalog adopted. Furnished=daily+monthly, semifinished/long-term only (renter fit-out), hourly 4-6h min is Phase 2 (stored as hourly slots underneath, priced daily in v1). Add-ons API research: no Egypt-usable search+order API exists. MealMe (only true search+menu+checkout API found) is US/Canada only; Talabat Partner API is vendor-side per-vendor POS/catalog/order management, not consumer marketplace ordering; Uber Eats Marketplace/DoorDash APIs are merchant-side, approval-gated; Uber Direct/DoorDash Drive are courier-only (you supply the order). Decision: v1 add-ons = agent-collected requests from a curated partner menu, itemized on the bill, partner-fulfilled manually / via partner WhatsApp. An ddons-provider interface will abstract search/menu/order/status so MealMe/Talabat can drop in later without agent changes.

- 2026-10-27: Scope change by owner: payments IN via hosted payment checkout, test mode (was out of scope). Real integration, real webhooks, test cards only — no live money during hackathon. Booking confirmed only on verified payment webhook (signature-checked), never on redirect alone. Keys in env only (see .env.example). Add-on ordering research update: Apify mena-food-intelligence is a menu scraper (Elmenus Egypt/HungerStation, items+EGP prices from restaurant URLs) — useful for discovery/enrichment of curated partners, NOT proximity search and NOT ordering. Proximity = Google Places (discovery only) or curated partners per unit. Ordering remains partner-fulfilled (WhatsApp/deep-link to Elmenus/Talabat page) until a marketplace opens a consumer ordering API; payment for add-ons rides the same bill.

- 2026-10-27: Neon live. DATABASE_URL = direct (migrations via scripts/migrate.ts), DATABASE_URL_POOLED = pooled (app runtime via lib/db/pg.ts, driver pg). Schema in lib/db/schema.sql (8 tables incl. payments, booking_addons, chat_sessions.session_key). Seeded: 3 units, 147 hourly slots (7 days x 10-17, Africa/Cairo). JSON file store removed; fresh sessions must run pnpm migrate && pnpm seed only on a new Neon project — the current project is already migrated+seeded.

- 2026-10-29: Payment provider switched from Paymob to **XPay** (test mode). Paymob's test integration had no working acquirer credentials, which Paymob support would have to fix. XPay Checkout Sessions + HMAC-signed webhook were verified live (approved card → confirmed, declined → stays unconfirmed). Detail: [plan/05](plan/05-demo-polish.md).
- 2026-10-29 (post-audit, owner): **source video upload to Blob is allowed** (replaces the kickoff rule "video never uploads"); keyframes are still extracted in the browser and only frames reach the model. **English stays the default locale** for judges. **D5 revised** (see table). Owner sign-in via **Clerk development instance** (Google), renters stay guests; uploads unlisted on the homepage for now. QStash order status and Overpass nearby cafes **parked**. The spend ceiling is an abuse circuit breaker, not a budget cap. Full list: [plan/06](plan/06-judge-ready.md) Decisions.
- 2026-10-29: Metering: `muse-image-1.0` returns **WebP**, and edits reject a declared MIME type that doesn't match the bytes, so staging must sniff the real type before re-feeding outputs ([plan/06](plan/06-judge-ready.md) Metering).
- 2026-10-30: **Use rubric** (docs/RUBRIC.md) replaces single-room specs: a survey of every space from 1 fps frames, plus deterministic verdicts for office / coworking / training / clinic / dental / law office. Only passing uses get renders. Native tool calling replaces the JSON-action agent. Dental may retrofit the bathroom as the prep area (owner). Semifinished renders show the finished fit-out (floor, gypsum ceiling, paint) with fixed geometry (owner). Dev calls run on our Muse Spark Open deployment on Modal; seeded data on `muse-spark-1.3`.
