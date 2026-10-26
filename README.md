# Offisio

Office listing and booking agent, built for the Meta Global AI Developer Hackathon (Indie track, solo).

An owner uploads a short video of an office. Offisio produces room specs, a bilingual Arabic/English listing, and restaged photos (furniture removed, then restyled). Renters book by chatting in Egyptian Arabic.

> Status: initial scaffold (Next.js 16 + TypeScript + Tailwind 4). The demo loop is under construction — this README describes the intent, not shipped features.

## Demo loop (in scope)

1. Owner uploads a short office video.
2. App extracts specs (size, rooms, finishes) as structured JSON.
3. App generates a bilingual listing (Arabic default, RTL; English toggle, LTR).
4. App produces restaged photos: furniture removed, then restyled.
5. Renter books through a chat agent in Egyptian Arabic.

Out of scope: payments, real auth, reviews, map search, host analytics, mobile apps.

## AI

All product model calls go to the Meta Model API (`https://api.meta.ai/v1`) only. No other AI provider or SDK is used in any request path.

- Public / synthetic content (test prompts, demo footage we shot, style prompts): `muse-spark-1.3` or `muse-spark-1.3-contributor`
- Product data without PII (keyframes, specs JSON, listing copy): `muse-spark-1.3`, `muse-image-1.0`, `sam-3.1`
- PII (names, phones, chat transcripts, voice notes): `muse-spark-1.3` only — never the contributor model

Model IDs and prompts live only in `lib/meta/`. See [AGENTS.md](AGENTS.md).

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

Environment variables (never committed — the repo is public):

```bash
META_API_KEY=...
DATABASE_URL=...
BLOB_READ_WRITE_TOKEN=...
```

`pnpm lint` and `pnpm typecheck` must pass before each commit.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure (read before structural changes)
- [docs/DESIGN.md](docs/DESIGN.md) — product design, incl. unknown-capability list
- [docs/PLAN.md](docs/PLAN.md) — build plan and segment index
- [AGENTS.md](AGENTS.md) — contributor and agent rules

## Built during the hackathon

Entries will be added here as features land. One logical change per commit; the git history is the record of work done during the hackathon.
