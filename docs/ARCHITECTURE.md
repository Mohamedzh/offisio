# Architecture (high level)

> Starting point for the Meta Global AI Developer Hackathon (Indie track, Oct 26 – Nov 4, 2026).
> This document is intentionally high level. The detailed design and implementation plan are produced during the hackathon with Meta models (Muse Code / Muse Spark).
>
> Relocated from the repo root into `docs/` on Oct 26 to match the path `AGENTS.md` already referenced. Content unchanged except this note, the project name, and §9 (Neon chosen as the Postgres provider).

## 1. Product in one line

Offisio — turn any office into a bookable, furnished-looking listing from a 30-second phone video, and let renters book it by chatting in Egyptian Arabic.

## 2. The demo loop (what must work end to end)

1. **Capture.** The owner uploads a short walkthrough video of an office unit.
2. **Understand.** The system extracts keyframes, segments the room, and produces structured specs (approx. area, windows, AC, desk capacity, condition).
3. **List.** A bilingual (Arabic / English) listing page is generated from the specs.
4. **Restage.** Furniture is removed and the room is restaged in a few styles (startup office, clinic, training room), keeping walls and windows consistent.
5. **Book.** A renter chats in Egyptian Arabic (stretch: voice note); an agent searches units, checks availability, books a slot, and confirms.

Everything outside this loop is out of scope (payments, real auth, reviews, map search, host analytics, mobile apps).

## 3. System overview

```
 Browser (Next.js)                         Server (Next.js route handlers / jobs)                Meta Model API
 ─────────────────                         ──────────────────────────────────────                ──────────────
 Video upload ─► keyframe extraction ──►   Ingest job ───────────────────────────────────────►  SAM 3.1 (video)
 (video + canvas)                           │  store video + keyframes (Blob)                     masks: desk, chair,
                                            │                                                     window, floor, wall
                                            ├─► Specs step ──────────────────────────────────►  Muse Spark 1.3
                                            │     keyframes ► specs JSON                           (structured output)
                                            ├─► Listing step ────────────────────────────────►  Muse Spark 1.3
                                            │     specs ► AR/EN copy                               (listing copy)
                                            └─► Staging step ────────────────────────────────►  Muse Image 1.0
                                                  keyframe + masks ► empty ► styled              (image edits)

 Listing page  ◄── Postgres (units, specs, media, styles, availability, bookings)

 Renter chat ──────────────────────────►   Booking agent (tool loop) ─────────────────────────►  Muse Spark 1.3
 (web chat, WhatsApp-styled;                 tools: search_units, get_unit,                       (tool calls)
  stretch: voice note) ──────────────────►   check_availability, create_booking   ─────────────►  Muse Voice Transcribe
```

## 4. Components

| Component | Responsibility | Meta model |
|---|---|---|
| Upload + keyframes (client) | Accept video, extract 6–12 representative frames in the browser, upload video + frames | — |
| Ingest pipeline (server) | Orchestrate steps per unit, persist status so the UI can show progress | — |
| Segmentation | Text-prompted masks on the video, tracked across frames | SAM 3.1 |
| Specs extraction | Keyframes → validated specs JSON | Muse Spark 1.3 |
| Listing generator | Specs → Arabic + English title, summary, highlights | Muse Spark 1.3 |
| Staging | Remove furniture, then restage per style, consistent across styles | Muse Image 1.0 (edits) |
| Booking agent | Multi-turn chat in Egyptian Arabic with tool calls against the DB | Muse Spark 1.3 |
| Voice (stretch) | Voice note → text before it reaches the agent | Muse Voice Transcribe |
| Listing UI | Unit page, before/after slider, style switcher, specs card | — |

## 5. Data model (sketch)

- **Unit**: id, title_ar, title_en, location, price, status (processing / ready / failed)
- **Media**: unit_id, kind (video / keyframe / mask / staged), style, url, source_frame
- **Specs**: unit_id, JSON (area_m2_estimate, windows, ac, desk_capacity, condition, confidence)
- **Style**: id, name, prompt (startup office, clinic, training room, empty)
- **Availability**: unit_id, date, slots
- **Booking**: unit_id, renter_name, phone, date, slot, created_via (chat / voice)
- **ChatSession**: id, messages, tool_calls (kept for the demo and debugging)

## 6. Key design decisions

- **Meta models only in the product's AI.** No other model sits in any request path.
- **OpenAI-compatible client** against `https://api.meta.ai/v1`, wrapped in one thin module so prompts, model IDs and retries live in one place.
- **Structured output everywhere a model feeds code** (specs JSON, agent tool arguments), validated with a schema before it is stored.
- **One pipeline, explicit steps, persisted status.** Each step can be re-run alone, which matters for iterating on staging prompts.
- **Remove first, then restage from the empty room.** Every style starts from the same empty base, which is how walls and windows stay consistent across styles.
- **Precompute for the demo.** Seeded units are fully processed ahead of time; the live upload path is shown once, end to end.

## 7. Assumptions to verify early (quick tests)

| Assumption | Test | Fallback |
|---|---|---|
| Muse Image edits accept a mask or can be guided by one | One edit call with a SAM mask on a Regus frame | Describe regions in the prompt; crop/composite around the mask |
| Removal keeps walls and windows faithful | Compare empty result with the source frame | Restage per keyframe only, pick the best frames |
| SAM 3.1 video API returns tracked masks for text prompts | One 30 s clip with "desk", "chair", "window" | Run SAM on keyframes as images |
| Muse Spark returns reliable specs JSON from keyframes | 3 units, compare with reality | Fewer fields, show confidence |
| Agent handles Egyptian Arabic and tool calls well | 10 scripted renter conversations | Narrower tool set, stronger system prompt |
| Voice Transcribe handles Egyptian Arabic | 5 real voice notes | Drop voice; text chat only |

## 8. Repository layout (proposed)

```
/app                 Next.js routes: upload, unit page, chat, admin seed
/app/api             route handlers: ingest, steps, chat
/lib/meta            Meta API client, model IDs, prompts
/lib/pipeline        ingest orchestration and steps (segment, specs, listing, stage)
/lib/agent           booking agent: system prompt, tools, loop
/lib/db              schema, queries
/components          UI pieces (before/after slider, style switcher, chat)
/scripts             seed units, quick API tests
/docs                ARCHITECTURE.md, decisions log
README.md            setup, what was built during the hackathon, disclosures
AGENTS.md            instructions for coding agents
```

## 9. Stack

Next.js (App Router, TypeScript), Postgres on Neon, Vercel, Vercel Blob. Keyframes extracted in the browser with `<video>` + canvas. SAM clips uploaded once through the Files API (support unverified — see [DESIGN.md](DESIGN.md) capability unknowns).

## 10. Milestones

| Dates | Milestone |
|---|---|
| Oct 26 | API access works; one SAM test and one Muse Image edit test |
| Oct 27–28 | Video → keyframes → specs JSON → listing page |
| Oct 29–30 | Masks → removal → restaging in 3 styles |
| Oct 31–Nov 1 | Booking agent with tools; WhatsApp-styled chat |
| Nov 2 | Seed 10–15 units, polish, README |
| Nov 3 | Record the 3-minute demo |
| Nov 4 | Buffer; submit before 21:00 ET |
