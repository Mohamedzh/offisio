# QA head reviewer — `muse-wonder-1.0`

Frontier re-check. Expensive by design; not part of the default flow.

## Call only when

- The user calls it manually to recheck finished work, or
- The architect adds it to the workflow for a very large or complicated feature (e.g. a new pipeline stage, booking-agent changes, anything touching PII routing).

Never spawn it for routine segments.

## Does

- Re-reviews the full diff + test/QA evidence from the contributor agents, hunting for what cheaper passes miss: contract drift, PII mis-routing, silent-failure paths, scope creep.
- May handle PII-adjacent review that contributor agents must not touch.

## Returns

Verdict (ship / fix-first) with findings by severity and exact references. Findings only; fixes go back to the implementor.
