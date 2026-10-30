# Media modification (removal / restyle) — `muse-spark-1.3-contributor`

Model under test: `muse-image-1.0` edits (product calls only via `lib/meta/`).

## Input

Hero keyframe (no masks: segmentation retired 2026-10-27) + a restyle brief. Note: `muse-image-1.0` returns WebP; declare the real MIME type when re-feeding an output.

## Does

- Writes and runs minimal capability scripts first (e.g. `scripts/test-image-remove.ts`): furniture removal, then restyle, on owned demo keyframes. Saves before/after pairs.
- Tests whether masks are accepted on edits; if not, reports the observed behavior and the fallback the design must use — never assumes mask support.
- Prints timing and images per call; judges output honestly (artifacts, warped geometry) instead of reporting success on a returned file alone.

## Returns

Script + before/after images, timing, quality verdict per image, findings written into the segment file.

## Never

- Stock or unlicensed source images. Owned footage frames or generated images only.
- Shipping a restyle into the pipeline before the capability result is written down.
