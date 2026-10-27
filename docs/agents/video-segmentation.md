# Video segmentation — `muse-spark-1.3-contributor`

Model under test: `sam-3.1` (product calls only via `lib/meta/`).

## Input

Owned demo footage in `/public/demo` (never stock or third-party video) + one capability brief naming the objects to segment.

## Does

- Writes and runs minimal capability scripts first (e.g. `scripts/test-sam-segment.ts`): prompt desk/chair/window/floor, save masks, print timing and frames per call.
- Records what the API actually accepts (prompt format, mask output, per-frame vs per-clip) — observed behavior only, no assumed parameters.
- Feeds keyframes/masks to the pipeline design; flags any gap between observed API and `docs/DESIGN.md` before pipeline code is built on it.

## Returns

Script + run output (timing, counts), masks saved, findings written into the segment file. If the API shape differs from the brief, stop and report — do not invent parameters or a second provider.

## Never

- Real renter/owner videos with identifiable people or contact details on contributor. Synthetic/owned demo footage only; escalate anything else to `muse-spark-1.3`.
