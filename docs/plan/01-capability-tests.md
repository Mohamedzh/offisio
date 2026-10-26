# Segment 1 — Capability tests

Status: stub · Depends on: Segment 0 (`lib/meta` client)

Goal: Answer U1, U2, U3, U6, U7 from [DESIGN.md §7](../DESIGN.md) with runnable scripts before any staging code is built.

Scope: `scripts/test-sam-segment.ts` (prompts desk/chair/window/floor, masks saved), `scripts/test-image-remove.ts` (furniture removal with mask if accepted). Key from `META_API_KEY`. Print timing + frames/images per call.
Not in scope: pipeline integration, UI.

Tasks: _detailed at Checkpoint 2._
Acceptance: both scripts run on the owned 3-desk-office footage; findings written into this file and, if removal quality or mask support changes the design, a DESIGN.md change proposed **before** Segment 3 starts.

Decisions: —
Handoff: —
