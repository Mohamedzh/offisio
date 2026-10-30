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

Out of scope: real auth, reviews, map search, host analytics, mobile apps. Payments are in scope in test mode only (no real money — see Testing).

## AI

All product model calls go to the Meta Model API (`https://api.meta.ai/v1`) only. No other AI provider or SDK is used in any request path.

- Public / synthetic content (test prompts, demo footage we shot, style prompts): `muse-spark-1.3` or `muse-spark-1.3-contributor`
- Product data without PII (keyframes, specs JSON, listing copy): `muse-spark-1.3`, `muse-image-1.0` (`sam-3.1` was evaluated and dropped: no callable segmentation endpoint, and prompt-guided edits passed)
- PII (names, phones, chat transcripts, voice notes): `muse-spark-1.3` only — never the contributor model

Model IDs and prompts live only in `lib/meta/`. See [AGENTS.md](AGENTS.md).

### How it was built: Muse models and Claude

Offisio was *built* with Muse models, not just powered by them. Development was split roughly  between the Muse workflow below and Claude models, which the owner used alongside it:

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

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Environment variables (never committed — the repo is public): copy [.env.example](.env.example) to `.env.local` and fill it in. That file lists every key the app needs (Meta API, Neon, Vercel Blob, payment test keys, app URL).

`pnpm lint` and `pnpm typecheck` must pass before each commit.

## Testing (for judges)

Everything below runs on the live site — no setup, no real money. Payments run in the payment provider's test mode (you will see a TEST MODE banner at checkout).

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

1. **Book + pay (approved).** On a unit page, pick a free day, enter any name and an `01…` mobile number, Confirm & pay, then Pay now. Use expiry `01/39`. You return to the booking page; within a few seconds the status flips to **confirmed**. Confirmation comes only from the payment webhook, never from the redirect — refreshing before it lands still shows `awaiting_payment`.
2. **Declined card.** Same flow with expiry `05/39`. The checkout shows "Payment declined" and the booking stays **unconfirmed** (`awaiting_payment`). The checkout stays open, so retrying with expiry `01/39` on the same session succeeds.
3. **Chat booking.** Open Chat and write in Egyptian Arabic, e.g. `عايز مكتب في الزمالك ليوم واحد` or `I want an office in Zamalek for one day`. The agent searches real availability, quotes the total, and takes name + phone.
4. **Cafe add-ons.** Add cappuccino/croissant quantities in the booking form; they are itemised on the same payment.
5. **Owner upload.** `/upload`: add a short office video; the app extracts frames, generates specs and a bilingual listing, and publishes a bookable unit.
6. **Language / RTL.** Toggle عربي (top corner) — every page mirrors to RTL; English is LTR. Check both.

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

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure (read before structural changes)
- [docs/DESIGN.md](docs/DESIGN.md) — product design, incl. unknown-capability list
- [docs/PLAN.md](docs/PLAN.md) — build plan and segment index
- [AGENTS.md](AGENTS.md) — contributor and agent rules

## What we built

Everything in this repository was written during the hackathon (Oct 26 – Nov 4, 2026), starting from an empty `create-next-app` scaffold. No prior code, data or assets were reused. The git history is the record.

- Video pipeline (scripts/run-unit.ts): keyframes -> specs -> bilingual listing -> AI empty -> 3 fit renders (startup/clinic/training) on 3 real units. SAM 3.1 dropped (no callable endpoint; prompt-guided edits passed) — future consideration.
- 3-track catalog: furnished=daily+monthly (800 EGP/day demo), semifinished=long-term only.
- Booking: daily day-slots (hourly underneath), atomic double-book protection, Egyptian-Arabic chat agent with cafe add-ons.
- Option A add-ons: curated cafe menu (public Elmenus prices), order sent to the cafe WhatsApp line (CAFE_WHATSAPP_NUMBER).
- Payments (test mode): hosted checkout + signature-verified webhook; booking confirms only on webhook. Set the payment keys in .env.local (see .env.example).
- Live payment run verified 2026-10-29: approved test card auto-confirmed a booking via webhook, declined card stayed unconfirmed; judge instructions + test card in [Testing (for judges)](#testing-for-judges).
- Built with Muse models and Claude, about 50/50: `muse-wonder-1.0` planning, `muse-spark-1.3-contributor` implementors/testers/reviewers on synthetic data only, Claude models alongside; `muse-spark-1.3` + `muse-image-1.0` in the product. See [How it was built](#how-it-was-built-muse-models-and-claude).
- Run: pnpm dev (or pnpm build && pnpm start). Data: Neon Postgres (DATABASE_URL_POOLED for app, DATABASE_URL direct for migrations; pnpm migrate && pnpm seed on a new project).
- Media on Vercel Blob: demo assets via `pnpm upload-demo`, browser-direct uploads via `/api/blob/upload`, listing photos served from the `media` table (Blob URLs only).
- Homepage: decorative muse-image-1.0 paper-collage illustrations (`pnpm generate-home-art`, in `public/home/`, always labelled decorative) kept separate from real listing photos.
