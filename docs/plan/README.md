# Working in segments

Why: one long chat session per feature burns frontier-model tokens and loses detail. Each segment is a small file a fresh session (or a cheaper subagent) can execute from cold.

## Session protocol

Start of every session:

1. Read `AGENTS.md`, `docs/PLAN.md`, and the one active segment file. Nothing else unless the segment names it.
2. Confirm the segment's dependencies are `done` in `docs/PLAN.md`. If not, stop and say so.
3. Work only inside the segment's scope. New ideas go in the segment file under "Parked", not into code.

End of every session:

1. Update the segment file: Status, Decisions made, What was verified (commands + result), Next step.
2. Update the status table in `docs/PLAN.md`.
3. Commit segment file + code together, one logical change per commit.
4. If the session is getting long or fuzzy, stop early. A clean handoff beats a long session: write the handoff, commit, start fresh.

## Segment file shape

Every segment file has: Goal (one line) · Depends on · Scope / Not in scope · Tasks (each < 2 h, one commit each) · Acceptance (commands + manual checks) · Decisions · Handoff (status, verified, next step). The architect writes the Tasks detail; implementors never invent scope beyond it.

## Agent roles (cost discipline)

| Role | Model class | Rule |
|---|---|---|
| Architect (main session) | Frontier | Plans segments, writes briefs, reviews diffs, runs checkpoints. Does not write bulk code |
| Implementor | Muse Spark subagent | One segment brief, named files only, returns diff + test output |
| Test writer | Muse Spark subagent | Jest/Vitest per acceptance list; must show failing-then-passing run |
| Reviewer | Muse Spark subagent | Reviews diff against brief + `AGENTS.md` hard rules; findings only, no silent rewrites |
| Integration / UI tester | Muse Spark subagent | Scripted flows against the running app (AR RTL + EN LTR), reports pass/fail with evidence |

A brief is complete only if a cold agent can finish from it + linked docs: exact files, interfaces from `DESIGN.md`, acceptance commands, stop conditions ("if the API shape differs from the guess, stop and report — do not improvise a second provider or a workaround that changes the design").

## Token hygiene

- Prefer reading one segment file over re-reading the whole docs tree.
- Subagent reports are short: diff summary, commands, results, blockers. No logs dumped into the architect session; link files instead.
- Decisions live in segment files and `DESIGN.md`, never only in chat. If it isn't written down, the next session will re-decide it.
