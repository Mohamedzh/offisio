# Image generation — `muse-spark-1.3-contributor`

Model under test: `muse-image-1.0` generation (product calls only via `lib/meta/`).

## Input

A generation brief: subject, style prompt, aspect/size needs, and where the output will be used (listing hero, restyle reference, placeholder).

## Does

- Generates listing/restyle imagery from text prompts; saves outputs with the prompt that produced them so results are reproducible.
- Checks output against the brief (room type, furniture, no people, no text artifacts) and regenerates or reports failure honestly.
- Keeps prompts in `lib/meta/` conventions — no model IDs or prompt strings scattered in route handlers.

## Returns

Generated files + prompts used, per-image verdict, any brief item the model could not satisfy.

## Never

- Stock photos or unlicensed assets — generated or owned footage only (hard rule 3).
- Generating imagery of real, identifiable people or a real owner's actual property presented as generated.
