# Offisio

Office listing and booking agent, built for the Meta Global AI Developer Hackathon (Indie track, solo).

An owner uploads a short video of an office. Offisio produces room specs, a bilingual Arabic/English listing, and restaged photos (furniture removed, then restyled). Renters book by chatting in Egyptian Arabic.

> Status: demo loop live at [offisio.vercel.app](https://offisio.vercel.app) (Next.js 16 + TypeScript + Tailwind 4). See [Testing (for judges)](#testing-for-judges) to run the full flow, including test payments.

## Demo loop (in scope)

1. Owner uploads a short office video.
2. App extracts specs (size, rooms, finishes) as structured JSON.
3. App generates a bilingual listing (Arabic RTL / English LTR, toggle on every page).
4. App produces restaged photos: furniture removed, then restyled.
5. Renter books through a chat agent in Egyptian Arabic.

Built beyond the core loop: guest uploads as private drafts, published with owner sign-in on WhatsApp (renters stay guests), renter booking and voice notes on WhatsApp, a mic button in web chat, and payments in test mode only (no real money — see Testing). Out of scope: renter accounts, reviews, map search UI, host analytics, mobile apps.

## AI

All product model calls go to the Meta Model API (`https://api.meta.ai/v1`) only. No other AI provider or SDK is used in any request path.

### Meta models used

| Model | Where | Data class |
|---|---|---|
| `muse-spark-1.3` via `meta.product` (never contributor) | Booking agent on web chat and WhatsApp | PII (names, phones, emails, chat text) |
| `muse-spark-1.3` via `meta.nonPii` | Space survey, specs, bilingual listing copy | Product data, no PII |
| `muse-image-1.0` | Empty-room and fit-out edits; text-to-image for badged demo listings and decorative homepage art | Product data, no PII |
| `muse-voice-transcribe-1.0` via `meta.product.transcribe` | WhatsApp voice notes and the web chat mic (`POST /v1/asr/transcribe`) | PII (audio) |
| `muse-spark-1.3-contributor` via `meta.public` | Development only: tests and QA on public or synthetic data | Public / synthetic only, never PII |
| Muse Spark Open (our Modal deployment) | Local non-PII dev runs only; ignored whenever `VERCEL` is set | Non-PII, dev only |

`sam-3.1` is not used: prompt-guided `muse-image-1.0` edits passed our tests.

Model IDs and prompts live only in `lib/meta/`. See [AGENTS.md](AGENTS.md).

### How it was built: Muse models and Claude

Offisio was *built* with Muse models, not just powered by them. Development was split roughly half and half between the Muse workflow below and Claude models, which the owner used alongside it:

- **Architecture & planning** — the main session runs on `muse-wonder-1.0`: it writes the segment briefs under [docs/plan/](docs/plan/), reviews every diff, and makes the final ship/fix calls.
- **Implementation, tests & review** — cheaper `muse-spark-1.3-contributor` agents implement one brief at a time, write and run the tests, and review diffs against the project rules. Contributor agents only ever touch synthetic data.
- **In the product** — listing specs and copy, restaged imagery, and the booking chat run on `muse-spark-1.3` and `muse-image-1.0` via the Meta Model API. Anything resembling PII (names, phones, chat transcripts) is routed to `muse-spark-1.3` only, never the contributor model, because contributor content may be used for training.

Role definitions and the full agent-team rules live in [docs/agents/](docs/agents/README.md) and [AGENTS.md](AGENTS.md). Segment briefs, verification evidence and decisions are recorded in the segment files under [docs/plan/](docs/plan/).

Claude models (via Claude Code) did the other half: audits, planning passes, and implementation. They are a development tool only: all AI *in the product*, meaning every model call a user triggers, runs on Muse models via the Meta Model API.

## Stack

Next.js 16 (App Router), TypeScript strict, Tailwind 4, pnpm. Postgres on Neon, Vercel Blob for media, deployed on Vercel.

- Server work: route handlers under `app/api`
- Pipeline steps: `lib/pipeline` (each independently re-runnable)
- Booking agent: `lib/agent`
- DB: `lib/db`

## Run locally

You need Node, pnpm, a Meta Model API key and a Postgres (13 or newer; Docker is the easy way).

```bash
pnpm install
docker compose up -d          # Postgres 16 on 127.0.0.1:5432, user/password/db all "offisio"
cp .env.example .env.local    # then set META_API_KEY, DATABASE_URL and DATABASE_URL_POOLED
pnpm migrate                  # schema
pnpm seed                     # 13 demo units from data/seed/demo-snapshot.json
pnpm dev                      # http://localhost:3000
```

With Docker, both URLs are `postgres://offisio:offisio@localhost:5432/offisio`. Any other Postgres works too; SSL is off for localhost or `?sslmode=disable`. `pnpm seed` refuses a non-local database unless you add `--remote`.

What the seed loads: the 13 demo units with specs, bilingual listings, media (public Vercel Blob URLs, so photos load without a Blob key) and nearby place ids. Availability is regenerated from today. It is idempotent: re-run it any time.

Keys (names in [.env.example](.env.example), never committed — the repo is public):

- **Required:** `META_API_KEY`, `DATABASE_URL` (`DATABASE_URL_POOLED` falls back to it).
- **Optional:** everything else. A missing integration returns a fixed code, shown translated in the UI, and the rest keeps working: `XPAY_NOT_CONFIGURED` (no checkout), `WHATSAPP_NOT_CONFIGURED` (no sign-in or WhatsApp channel), `PLACES_NOT_CONFIGURED` (no nearby search on new uploads).
- **No `BLOB_READ_WRITE_TOKEN`:** uploads and renders are written to the gitignored `public/uploads/<slug>/` instead of Vercel Blob (never on Vercel).
- **No `GOOGLE_PLACES_API_KEY`:** the snapshot stores only Google place ids and our distances (Places terms), so seeded units show "Place nearby" with a Maps link. With the key set, `pnpm seed` refetches the names (one Nearby Search per unit, 13 calls); `pnpm seed --no-places` skips this.
- **No QStash:** pipeline steps run in-process.
- **No WhatsApp:** a guest draft can still be published with the clearly labelled local demo publish (see Testing, flow 5).

`pnpm lint` and `pnpm typecheck` must pass before each commit.

## Testing (for judges)

Everything below runs on the live site — no setup, no real money. Payments run in the payment provider's test mode (you will see a TEST MODE banner at checkout). Flows 3, 5, 6, 8 (web mic) and 11 also run on a local copy with only `META_API_KEY` and a Postgres ([Run locally](#run-locally)); AI agents can use the curl walkthrough in [public/llms-full.txt](public/llms-full.txt).

**Start here:** [offisio.vercel.app](https://offisio.vercel.app) — browse the listings, or jump straight to a bookable unit such as [gen-alex-chatby](https://offisio.vercel.app/en/units/gen-alex-chatby) (EGP 600/day). Listings whose photos are AI-generated are badged "Demo listing — AI-generated photos"; the first three units are filmed real offices.

### Pay with the test card (XPay test mode)

At checkout, use this test card. The **expiry date chooses the outcome** — the card number is always the same:

| Field | Value |
|---|---|
| Card number | `5123 4500 0000 0008` |
| Cardholder name | `Test Account` (anything works) |
| CVV | `100` |
| Expiry `01/39` | Approved |
| Expiry `05/39` | Declined |
| Expiry `01/27` | Insufficient funds |
| Expiry `04/27` | Expired card |

After clicking Pay, a 3D Secure emulator appears: leave **(Y) Authentication Successful** selected and click **Submit**.

### Flows to try

1. **Book + pay (approved).** On a unit page, pick a free day, enter any name, an `01…` mobile number and an email, Confirm & pay, then Pay now. Use expiry `01/39`. You return to the booking page; within a few seconds the status flips to **confirmed**. Confirmation comes only from the payment webhook, never from the redirect — refreshing before it lands still shows `awaiting_payment`.
2. **Declined card.** Same flow with expiry `05/39`. The checkout shows "Payment declined" and the booking stays **unconfirmed** (`awaiting_payment`). The checkout stays open, so retrying with expiry `01/39` on the same session succeeds.
3. **Chat booking.** Open Chat and write in Egyptian Arabic, e.g. `عايز مكتب في الزمالك ليوم واحد` or `I want an office in Zamalek for one day`. The agent searches real availability, quotes the total, and asks for name, Egyptian mobile and email, then sends a payment link (30-minute hold).
4. **Nearby places and add-ons.** Each unit page lists the two nearest cafes/restaurants within 1 km (Google Places: name, distance, Maps link; you order from them directly). Add-ons are provided by the venue at our own demo prices: house coffee & snacks (day bookings only) and room extras like a whiteboard, itemised on the same payment.
5. **Owner upload (no sign-in).** `/upload`: add a short office video, or tap **Try it with a sample walkthrough** to use our own 20-second filmed walkthrough with editable pre-filled details. The real pipeline extracts frames, surveys the spaces, writes specs and a bilingual listing and renders fit-outs. The result is a private **draft** ("Draft, not listed yet"): not listed, not bookable, hidden from the agent, and only your browser can edit it. **Publish with WhatsApp** signs you in (flow 10) and lists it. On a local copy without WhatsApp, the button publishes as a labelled local demo instead.
6. **Language / RTL.** Toggle عربي (top corner) — every page mirrors to RTL; English is LTR. Check both.
7. **WhatsApp booking.** Tap **Book on WhatsApp** on the site to message the Offisio number. Ask for an office as in flow 3; on WhatsApp the agent asks only for an email (your phone is the WhatsApp sender) and replies with a payment link. You get a paid notice after the webhook lands.
8. **Voice.** In web chat, tap the mic, speak (up to 60 s) and tap again to send; your words appear as your message, then the agent answers. On WhatsApp, record a voice note (e.g. "عايز مكتب بكرة في مدينة نصر"); the reply shows what we heard, then answers. Checked on 2026-11-02 with a real 6-second Egyptian-Arabic WhatsApp note: transcribed exactly, and the agent found an available unit in the New Administrative Capital.
9. **My bookings.** On WhatsApp, ask "what are my bookings". The agent lists your bookings with status and, for unpaid ones, the payment link.
10. **Owner sign-in.** On `/login` (or from a draft's Publish button), get a one-time code and send `Offisio login XXXX-XXXX` from WhatsApp (the button pre-fills it), then reply **YES** within 2 minutes. The page signs you in. Send `Offisio logout` to sign out everywhere.
11. **Demo-listing preview editing.** Add `/edit` to a demo listing URL (e.g. [/en/units/gen-alex-chatby/edit](https://offisio.vercel.app/en/units/gen-alex-chatby/edit)) and change the specs. Your edits show only in your own browser; the real listing and the agent never change.

### Local checks

```bash
pnpm lint        # 0 errors expected
pnpm typecheck   # tsc --noEmit
pnpm build       # production build
```

### Notes for judges

- No real money moves anywhere. Test bookings write to the demo database and can be deleted; days blocked by a test booking free up again once it is removed.
- Phone numbers, names, and chat text in your tests are demo data. Per project policy, anything that looks like PII is only ever sent to `muse-spark-1.3` (never the contributor model).
- Footage: the three filmed units (`full`, `empty1`, `empty2`) are phone walkthroughs shot by the owner, not stock. The files live on Vercel Blob, not in this repo (`public/demo` is gitignored). Every other listing image is generated by `muse-image-1.0` and badged as such.
- Payment evidence from the 2026-10-29 live run (approved → `confirmed`, declined → stayed unconfirmed) is recorded in [docs/plan/05-demo-polish.md](docs/plan/05-demo-polish.md).

## Data & rights

- Filmed units: phone walkthroughs shot by the owner, stored on Vercel Blob (not in the repo).
- All other listing photos and the homepage illustrations are generated by `muse-image-1.0` and labelled.
- Brand assets (logo, wordmark, app icons) are our own hand-drawn sources in `public/brand`, rendered by `scripts/brand-assets.ts`.
- Nearby places come from the Google Places API (official API), with "Places from Google Maps" attribution; the database stores only the fields we display (place ID, name, type, distance, Maps link). The repo's seed snapshot (`data/seed/demo-snapshot.json`) holds only place ids and our own distances, as Google's terms allow; names are refetched with your own key when you seed.
- Add-ons are the venue's own items at prices we set for the demo.
- All tests use synthetic renters. No secrets in the repo; keys are environment variables only (names in [.env.example](.env.example)).
- An early demo used menu data collected from a public site; it was removed on 2026-11-02 after organizer guidance, from the app and from the repo's current tree. It is still visible in the git history (added in `2f0f0fa`, removed in `35c37e1`); the owner chose not to rewrite history so the commit record stays intact.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure (read before structural changes)
- [docs/DESIGN.md](docs/DESIGN.md) — product design, incl. unknown-capability list
- [docs/PLAN.md](docs/PLAN.md) — build plan and segment index
- [AGENTS.md](AGENTS.md) — contributor and agent rules
- [public/llms.txt](public/llms.txt) and [public/llms-full.txt](public/llms-full.txt) — project summary for AI readers (served at [/llms.txt](https://offisio.vercel.app/llms.txt) and [/llms-full.txt](https://offisio.vercel.app/llms-full.txt))

## What we built

Everything in this repository was written during the hackathon (Oct 26 – Nov 4, 2026), starting from an empty `create-next-app` scaffold. No prior code or assets were reused; the only outside data (demo menu data) was removed on 2026-11-02, see [Data & rights](#data--rights). The git history is the record.

- Video pipeline (originally scripts/run-unit.ts, now the QStash pipeline in lib/pipeline/jobs.ts): frames -> space survey -> use rubric -> specs -> bilingual listing -> AI empty -> fit-out renders. Staging is rubric-driven (`STAGE_PROMPTS_V3`): one render per passing use and room role, with desk/seat counts from the rubric's capacity; semifinished shells are rendered finished (floor, ceiling, paint), because the renter fits them out.
- Use rubric ([docs/RUBRIC.md](docs/RUBRIC.md)): `muse-spark-1.3` surveys every space in the walkthrough (type, size, windows, plumbing, adjacency), then deterministic code rules decide which uses fit (office, coworking, training, clinic, dental clinic, law office), with reasons in Arabic and English and desk capacity. Only passing uses get renders. SAM 3.1 is not used: prompt-guided edits passed our tests (Meta's docs show SAM callable via `/v1/responses`; we found that after choosing edits and did not test it).
- 3-track catalog: furnished=daily+monthly (daily price set per unit, e.g. `full` EGP 800/day, `gen-alex-chatby` EGP 600/day), semifinished=long-term only.
- Booking: daily day-slots (hourly underneath), atomic double-book protection, Egyptian-Arabic chat agent with venue add-ons, "what's near to eat" (`nearby_places`) and "near AUC"-style landmark search.
- Add-ons: provided by the venue at our own demo prices (`lib/addons/catalog.ts`; prices always come from the catalogue, never the request): house coffee, tea, water, croissants and a sandwich tray on day bookings only, plus room extras (chair, whiteboard, printing).
- WhatsApp channel: the same booking agent on WhatsApp (email-only booking, "what are my bookings", paid notice after the payment webhook) plus **voice notes**: ffmpeg converts the OGG/Opus note to WAV and `muse-voice-transcribe-1.0` transcribes it; the reply shows what we heard. Validated 2026-11-02 on a real 6-second Egyptian-Arabic note: exact transcript, correct unit, prompt reply.
- Web chat mic: the browser records, `POST /api/chat/voice` checks limits (1 MB, 60 s, 15 per IP per day), converts with ffmpeg (whitelisted input formats and protocols), transcribes with `muse-voice-transcribe-1.0` on `meta.product`, then runs the same agent turn as typed chat (`lib/web-chat.ts`) and returns the transcript.
- Guest uploads: no sign-in needed to upload. A signed `offisio_guest` cookie (7 days) makes the upload a private draft (`units.guest_owner`): not listed, not bookable, invisible to the agent, `noindex`, editable and stageable only from the uploading browser. **Publish with WhatsApp** (`POST /api/units/<slug>/publish`) moves it to the signed-in owner. "Try it with a sample walkthrough" runs the real pipeline on our own filmed video.
- AI listing review: after the listing step, a `review` step (`muse-spark-1.3` via `meta.nonPii`, `LISTING_REVIEW_PROMPT_V2`, validated JSON, cached in `ai_cache` by text) proofreads the bilingual title and description: typos, natural Egyptian Arabic, English mixed into Arabic, claims the specs don't back (wrong numbers are corrected to the spec value), Arabic/English disagreement, contact details, pushy tone. The owner sees the issues on the draft and edit pages and can apply the fixes in one click (`POST /api/units/<slug>/review/apply`, owner only, writes only the cached corrected text) or run it again after a specs edit (`POST /api/units/<slug>/review`). Advisory only: publishing is never blocked. Upload also refuses contact details typed into district or floor (`CONTACT_INFO_NOT_ALLOWED`).
- Owner sign-in with WhatsApp: the site gives a one-time code, the owner sends it from WhatsApp and confirms with YES; sign-in is needed to publish, only the owner can save edits, and "Offisio logout" signs out everywhere.
- Run from the repo: `docker-compose.yml` (Postgres 16), `pnpm seed` loads the 13 demo units from `data/seed/demo-snapshot.json` (exported by `pnpm export-snapshot`), local media in `public/uploads/` when there is no Blob token, and fixed `*_NOT_CONFIGURED` codes for missing integrations. See [Run locally](#run-locally).
- Demo listings are preview-only: any visitor can try the edit form, changes show only in their own browser and the real listing (and the agent) never changes.
- Payments (test mode): hosted checkout + signature-verified webhook; booking confirms only on webhook. Set the payment keys in .env.local (see .env.example).
- Live payment run verified 2026-10-29: approved test card auto-confirmed a booking via webhook, declined card stayed unconfirmed; judge instructions + test card in [Testing (for judges)](#testing-for-judges).
- Built with Muse models and Claude, about 50/50: `muse-wonder-1.0` planning, `muse-spark-1.3-contributor` implementors/testers/reviewers on synthetic data only, Claude models alongside; `muse-spark-1.3` + `muse-image-1.0` in the product. See [How it was built](#how-it-was-built-muse-models-and-claude).
- Run: pnpm dev (or pnpm build && pnpm start). Data: Neon Postgres in production, any Postgres locally (DATABASE_URL_POOLED for app, DATABASE_URL direct for migrations; `pnpm migrate && pnpm seed` on a new database; demo units are generated/re-modelled with `pnpm generate-units` / `pnpm remodel-filmed`, then `pnpm stage-units`, `pnpm backfill-locations` and `pnpm places-units`).
- Media on Vercel Blob: demo frames and renders written by the generation scripts, browser-direct uploads via `/api/blob/upload` (or `/api/blob/local` in local media mode), listing photos served from the `media` table (Blob URLs; `/uploads/...` paths only in local media mode).
- Homepage: decorative muse-image-1.0 paper-collage illustrations (generated once by a since-removed one-off script, in `public/home/`, always labelled decorative) kept separate from real listing photos.
