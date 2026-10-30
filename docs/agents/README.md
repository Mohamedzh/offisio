# Offisio agent team

Spawnable role definitions. The architect (main session) spawns these per segment; a cold agent must succeed from one role file + one segment brief alone.

## Roster

| Agent | Model | Call when |
|---|---|---|
| [Architect / planner](architect-planner.md) | `muse-wonder-1.0` (main session, not spawned) | Every segment: brief, checkpoint, diff review |
| [Implementor](implementor.md) | `muse-spark-1.3-contributor` | One segment brief, named files only |
| [Test writer & runner](test-writer-runner.md) | `muse-spark-1.3-contributor` | After implementor, per acceptance list |
| [Reviewer](reviewer.md) | `muse-spark-1.3-contributor` | On every diff, before merge |
| [QA integrity](qa-integrity.md) | `muse-spark-1.3-contributor` | Data/API/pipeline correctness checks |
| [QA UI](qa-ui.md) | `muse-spark-1.3-contributor` | Browser flows, AR RTL + EN LTR |
| [QA head reviewer](qa-head-reviewer.md) | `muse-wonder-1.0` | Manual call only, or very large/complex features |

## Model rule (hard)

Contributor is discounted because its content may train Meta models. Therefore:

- Contributor agents work on code, synthetic fixtures, and demo footage only.
- Any task touching real PII — renter names, phones, chat transcripts, voice notes, owner contacts — is **never** contributor. Escalate that task to `muse-spark-1.3` (product) or the Wonder architect/head reviewer. When in doubt, treat data as PII.
- This mirrors the product routing in [AGENTS.md](../../AGENTS.md); it does not replace it. Product handlers still route only through `lib/meta/`.

## Media specialists (all `muse-spark-1.3-contributor`)

Spawned for Segment 1 capability tests and later pipeline work. Each writes a minimal script and runs it before any pipeline code depends on the result.

| Agent | Model under test | Call when |
|---|---|---|
| [Video segmentation](video-segmentation.md) | `sam-3.1` | **Retired 2026-10-27** (SAM dropped, no callable endpoint; see [plan/01](../plan/01-capability-tests.md)). Do not spawn unless SAM is re-approved |
| [Media modification](media-modification.md) | `muse-image-1.0` edits | Furniture removal / restyle on keyframes |
| [Image generation](image-generation.md) | `muse-image-1.0` generation | Listing or restyle imagery from prompts |

## How to call

- Normal segment: architect writes the brief → implementor → test-writer-runner → reviewer → qa-integrity and/or qa-ui (as the segment's acceptance list requires).
- Head reviewer: only when the user calls it manually, or the architect adds it to a workflow for a very large or complicated feature. Never by default — it costs frontier tokens.
- Every agent returns: diff/report summary, commands run, results, blockers. No log dumps; link files instead.
