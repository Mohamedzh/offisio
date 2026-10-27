# Segment 1 — Capability tests (SAM 3.1, Muse Image)

Status: **done** (2026-10-27). Depends on: 0.

Goal: Smallest tests before building on unknown Meta API shapes (DESIGN §7).

Results:
- U2 SAM 3.1: **dropped for now (future consideration).** `sam-3.1` is listed by `GET /v1/models`, but no callable segmentation endpoint exists in the OpenAI-shaped API. Prompt-guided `muse-image-1.0` removal passed on furnished + 2 bare units, 0 retries, so masks fix no observed failure. Revisit only if removal warps walls / leaves furniture, or a hosted SAM endpoint ships. Segmentation was never a Wonder cost — specs use `muse-spark-1.3`, renders `muse-image-1.0`.
- U1/U3 image edits: `/v1/images/edits` (multipart, `muse-image-1.0`) works prompt-guided; empty + 3 restyles on the hero frame keep walls/floor consistent. Minor crop drift on one startup restyle, noted honestly.
- U4 Spark structured JSON: specs + listing JSON validated on 3 units, honest nulls/confidence. Egyptian Arabic quality good.
- U6 timings: chat 9–23s, image edits 11–74s.

Decisions: pipeline is `scripts/run-unit.ts` (TS, `UNIT=full|empty1|empty2 STEP=probe|specs|listing|empty|restage pnpm pipeline`).
Handoff: no SAM code anywhere; `MODELS.sam` kept in `lib/meta/client.ts` only as a documented placeholder.
