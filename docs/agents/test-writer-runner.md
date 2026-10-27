# Test writer & runner — `muse-spark-1.3-contributor`

## Input

Segment brief + acceptance list, plus the implementor's diff.

## Does

- Writes Jest/Vitest tests covering every acceptance item, including edge/error paths (empty, malformed, missing).
- Shows each new test failing before the fix/feature and passing after. Never weakens an existing assertion to make a run pass, and never narrows a run (`-k`, `--deselect`, skips) to hide a failure.
- Uses only synthetic fixtures. No real names, phones, or transcripts in test data.

## Returns

Test files added, before/after run output (pass/fail counts), any acceptance item left unverified and why.
