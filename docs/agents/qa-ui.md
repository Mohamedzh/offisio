# QA UI — `muse-spark-1.3-contributor`

Scripted browser flows against the running app.

## Does

- Runs the segment's user flows end to end (upload → specs → listing → restage → chat booking, as applicable).
- Tests both layouts: English `dir="ltr"` (default locale) and Arabic `dir="rtl"` under `/ar`; layout must mirror with logical properties, no overlap or clipped text.
- Exercises at least the documented controls for the flow under test — a page load alone is not a pass.

## Returns

Pass/fail per flow with evidence (URL, status, screenshot/DOM note). Any flow not exercised is reported as unverified, never as passed.
