# Offisio — Visual Design System (Torn Layers)

Recorded from the built world, 2026-10-27. Product truth lives in [PRODUCT.md](PRODUCT.md); product/engineering design lives in [docs/DESIGN.md](docs/DESIGN.md). Direction: décollage torn billboard (catalog `design-canon-decollage-torn-billboard`, seed:61aa4d49ce200241), chosen by the owner over the broker-sheet and café-receipt directions. Surface contract: `.impeccable/surfaces/app-lang-page-tsx.md`.

## World

A Cairo poster wall of layered sheets. The real room is pasted on top; the emptied room and the fit concepts (startup, clinic, training) are torn through beneath it. Operate surfaces (upload, chat, booking, specs-edit) quiet down to flat sheets with one torn strip.

## Tokens

| Token | Value | Use |
|---|---|---|
| board | `#D8D3C6` | page ground (paste-gray board, subtle dot grain) |
| sheet | `#EFEAE0` | pasted sheets, cards, inputs |
| torn | `#F3EDDD` | torn edge strips and seams |
| ink | `#211D17` | text, borders, chips |
| chalk | `#2F5468` | secondary headline voice, agent bubbles |
| brick | `#A63A2A` | primary action, price bands |
| mustard | `#C99A3C` | text selection only |

Defined in `app/globals.css` (`@theme`). Display type: Cairo 800/900 (`next/font/google`, OFL, subsets arabic+latin) via `.font-display`/ `--font-display`; body: system sans. Prices use tabular numerals (`.tnum`).

## Grammar

- Sheets are flat: 1px ink border, soft offset shadow (`8px 12px 28px rgba(33,29,23,.22)`), square corners. Listing sheets rotate ±0.5deg, straighten on hover.
- Torn edges: fibrous raster mask (`public/torn-edge.jpg`, luminance mask, `mask-size: 560px`) for `.torn-b`/`.torn-t` strips and `.tear-seam` overlays; the viewer tear is a flat irregular clip (90–98% band) over the previous layer, 500ms ease-out, disabled under `prefers-reduced-motion`.
- Labels: black ink chips (11px uppercase). Specs: ruled hairline rows. No gradient text, no glass, no kicker labels, no hard block shadows.
- 2026-10-30: the cream `.tear-seam` strip over photos was removed (it read as a white bar across every image); the jagged clip edge alone carries the tear, and it only appears when a different layer sits beneath. The torn-edge mask is read as luminance (`mask-mode: luminance`).
- Signature interaction: UnitViewer layer switching — the active image tears at its bottom edge to reveal the layer beneath; on load the emptied room already peeks under the real photo.
- Home first viewport: masthead strip, two-voice headline (ink + chalk), featured furnished unit as one large torn sheet.

## Asset provenance

- `public/torn-edge.jpg`: generated (muse-image-1.0), generation prompt embedded in the file (`impeccable embed-prompt`); used only as a mask, never shown directly.
- `public/demo/**` rasters: produced by the project pipeline (`scripts/run-unit.ts`, muse-image-1.0 edits of owned footage) — see docs/plan/02 and 03. No stock assets anywhere.

## Review record

Code-led build. Finish reviewer (fresh subagent) disposition on first round: `fix` (7 items: fibrous edge, viewer under-layer, headline split, mobile wrap, soft shadows, torn strips, disabled contrast). All 7 applied and re-captured (`.impeccable/review/vfy-*.png`); the reviewer's verdict-pass session could not inspect images (tool-restricted), so the verdict pass was performed by direct capture inspection in the build session: 6 resolved, 1 partial (AR mobile unit headline not recaptured after the wrap fix). `impeccable detect --json` on changed targets: `[]`.
