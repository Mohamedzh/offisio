# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Balanced dual audience (owner-confirmed 2026-10-27):

- **Office owners** in Egypt with a furnished or semifinished office to rent out. They record a short phone walkthrough video and want a professional bilingual listing without writing copy or staging photos themselves.
- **Renters** in Egypt looking for an office by the day, month, or long term. They browse listings and book by chatting in Egyptian Arabic.

Judges of the Meta Global AI Developer Hackathon (Indie track) evaluate the live demo loop end to end.

## Product Purpose

Offisio turns a short owner-shot office video into a bookable listing: AI-estimated specs, a bilingual Arabic/English listing, an emptied-room photo, and AI fit-out concepts (startup, clinic, training) rendered from the real room. Renters then book through an Egyptian-Arabic chat agent, with optional cafe add-ons on the same bill, paid in test mode.

Success means the full demo loop (upload → specs → listing → restaging → chat booking → payment confirmation) runs cold on the deployed preview, and a renter can judge a semifinished unit by seeing how it could be fitted out.

## Positioning

The fit-visualization is the mechanism a neighboring listing site cannot copy: bare/semifinished units are shown already fitted for the renter's own use (startup office, clinic, training room) from the room's real geometry, so a cheaper unfinished unit can be evaluated like a finished one. All product AI runs on Meta models only.

## Operating Context

- Solo developer, hackathon deadline Nov 4, 9:00 PM ET; demo video recorded by Nov 3.
- Demo loop is the product: upload, unit page (before/after + fit switcher is the centrepiece), chat booking, booking/payment status.
- Bilingual UI: Arabic (RTL) and English (LTR) variants of every page; rental copy in Egyptian Arabic dialect, not formal MSA.
- Demo media (owner-shot footage, pipeline renders, generated frames) lives on Vercel Blob; local copies of the filmed units sit in the gitignored `public/demo`. Specs/listing JSON seeds are in `data/seed`.

## Capabilities and Constraints

- Next.js 16 App Router, TypeScript strict, Tailwind 4, Postgres on Neon, deployed on Vercel.
- Every model call goes to the Meta Model API via `lib/meta/` only (`muse-spark-1.3` for product/PII, `muse-image-1.0` for renders). No other AI provider.
- Out of scope by decision: accounts beyond owner sign-in (Clerk, planned), reviews, map search UI (a per-unit pin is planned), host analytics, mobile apps, payments beyond XPay test mode. Parked: QStash order status, Overpass nearby cafes.
- Only owned or generated assets; no stock imagery or unlicensed fonts.
- Unit pages must work with partial media (uploaded units may initially have keyframes only, no staged renders).

## Brand Commitments

- Name: Offisio (أوفيسيو).
- Voice: short, friendly Egyptian Arabic for renter-facing copy; plain factual English.
- Specs are always presented as AI estimates, never as measurements.

## Evidence on Hand

- Three filmed seeded units with pipeline-generated specs/listings and staged renders, plus six synthetic units (AI-generated frames, always badged) with real pipeline specs/listings (`data/seed`, Blob).
- Live-verified payment checkout flow and bilingual routing (`docs/plan/05-demo-polish.md`).
- Absent: testimonials, customer logos, press, benchmarks. Future work must not fabricate them.

## Product Principles

1. The demo loop is the product; every screen serves upload → listing → booking.
2. Show, don't describe: the room, its emptied version, and its fit concepts carry the pitch.
3. Estimates are labeled as estimates; the owner can correct specs before anyone books.
4. Both audiences get a first-class flow; neither side is an afterthought.
5. Arabic is a full RTL variant, never a translated afterthought.

## Accessibility & Inclusion

- Full AR (RTL) / EN (LTR) parity with logical CSS properties.
- Reduced-motion preferences must be respected.
