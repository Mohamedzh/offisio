# Segment 3 — Staging: removal + restyle

Status: **done** (2026-10-27). Depends on: Segment 1.

Goal: furniture removal → empty base → 3 consistent restyles; bare units fit directly.

Done:
- Furnished (`full`): prompt-guided removal produced a clean empty base (walls/corner/carpet preserved), then startup/clinic/training all from that one base.
- Bare (`empty1/empty2`): skip removal (no-op verified near-identity), restage straight from the real hero — glass facade and raw concrete ceiling preserved in all 6 renders. This is the semifinished selling tool: "real today" vs "could be".
- Code: `STYLE_PROMPTS_V1` + `restage` step in `scripts/run-unit.ts`; semifinished path skips the empty step.

Caveats for next session:
- Startup restyle on `full` had minor crop/frame drift. Watch for it; re-run that single style if a demo asset needs replacing (`STEP=restage`, single-style re-run is a TODO in the runner — it currently runs all 3).
- Concept renders also add ceiling lights on bare units. UI labels fits as concepts, never current state. Keep that disclosure.

Decisions: no SAM masks (see Segment 1). One empty base per furnished unit; no multi-hero staging (cut line).
Handoff: assets live in `public/demo/<slug>/fit-*.jpg`; DB `media` rows point at them.
