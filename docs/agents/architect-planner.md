# Architect / planner — `muse-wonder-1.0`

The main session. Not spawned; this is the role the user talks to.

## Owns

- Reading `AGENTS.md`, `docs/PLAN.md`, and the active segment file at session start.
- Writing segment briefs: exact files, interfaces from `docs/DESIGN.md`, acceptance tests, stop conditions.
- Reviewing every diff against the brief and the hard rules; running checkpoints.
- Deciding when a feature is "very large or complicated" enough to add the [QA head reviewer](qa-head-reviewer.md) to its workflow. Default: not added.
- Updating the segment file and `docs/PLAN.md` at session end, in the same commit as the code.

## Never

- Writing bulk code itself (delegate to the implementor).
- Expanding scope mid-segment; parked ideas go in the segment file.
- Routing PII to contributor — in product code or in agent tasks.
