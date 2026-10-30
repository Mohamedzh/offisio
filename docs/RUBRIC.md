# Space rubric — `RUBRIC_V1`

Owner-approved 2026-10-30 ([plan/06](plan/06-judge-ready.md) 6.4). This decides which uses an office unit fits, from its whole walkthrough video. Only uses that pass get fit-out mockups.

**What it is not:** a licensing check. Verdicts say the *layout* suits a use; the renter still needs the relevant permits (for clinics, Ministry of Health licensing). Every verdict is shown as an AI estimate (DESIGN D3).

## Two stages

1. **Survey (Muse Spark, `SURVEY_PROMPT_V1`).** Input: frames at ~1 per second (≤ 30, long side 1024 px), in walk order, each labelled with its index and timestamp. Output: every distinct space, with:
   - type: entrance, corridor, room, bathroom, kitchenette, storage, balcony, other
   - estimated width × length (m) and confidence
   - windows, natural light
   - plumbing seen: WC, sink, water stub, drain
   - finish and furnishing
   - frames where the space is visible, plus the single best frame
   - adjacency (which spaces connect)

   The best frames become the unit's keyframes, one hero per space.
   Why frames and not the video: a direct `video_url` call works (tested 2026-10-30), but its sampling missed one of the two rooms in `empty1`. Frames at 1/s see every space.
2. **Rules (code, [lib/pipeline/rubric.ts](../lib/pipeline/rubric.ts)).** Deterministic thresholds on the survey, so a verdict is reproducible and explainable. Reasons are code templates in Arabic and English, never free model text.

## Verdicts

- **fits** — the layout works as filmed.
- **fits after fit-out** — semifinished/bare units only. Partitions could create the missing rooms. The bathroom and plumbing must already exist, because they can't be added cheaply.
- **not suitable** — with the reason.

## Spaces that count

- **Usable room:** `room` or `other` (a partitioned nook). A `corridor` at least 2 m in both directions also counts as a room (calibration: the survey once labelled `empty2`'s inner room a corridor).
- **Never count toward capacity:** bathrooms, corridors, entrances.
- **Area:** width × length when both are known. A space without dimensions counts as present but contributes no area.

## Uses (v1)

| Use | Needs | Fit-out route (semifinished) |
|---|---|---|
| Private / startup office | ≥ 1 usable room ≥ 6 m²; a window or AC | — |
| Open-plan / coworking | largest room ≥ 25 m² | — |
| Meeting / training room | a room ≥ 15 m² | — |
| General clinic | an **exam room ≥ 9 m²**, a **separate waiting space ≥ 6 m²** (another room, or the entrance foyer), and a **bathroom** | one room ≥ 16 m² that could be split, plus a bathroom |
| Dental clinic | general clinic **plus a separate prep/sterilisation area ≥ 2 m²**. Any extra space counts (nook, kitchenette, storage, small room, or a second bathroom) | as clinic, with a room ≥ 18 m² to partition everything, **or** a clinic layout whose exam room (≥ 11 m²) or waiting room (≥ 8 m²) can lose 2 m² to a prep partition |
| Accounting / law office | a **reception/waiting space ≥ 6 m²** plus **≥ 1 private office room ≥ 7 m²** | one room ≥ 14 m² that could be split |

Planning heuristics, open to the owner's correction:
- exam room 9 m² (exam bed, desk, 2 chairs)
- waiting area 6 m² (4–6 seats)
- prep area 2 m² (sterilisation counter, sink)
- private office 7 m² (desk + 2 client chairs)

These are not Ministry of Health figures. Swap in official minimums if the owner provides them.

**Open owner question:** a dental unit whose *only* bathroom is repurposed as the prep room would have no patient WC. V1 requires the prep area to be separate from the one bathroom the clinic keeps.

## Capacity

**Desks.** Desk 120 × 70 cm (owner standard):
- Footprint = desk 0.84 m² + chair zone (1.2 × 1.0 m) 1.2 m² = 2.04 m².
- With circulation (aisles, door swing, storage): **comfortable ≈ 4.0 m² per desk**, **max ≈ 3.0 m² per desk** of usable room area. That's within common dense-office planning ranges (4–6 m² per workstation). Calibrated 2026-10-30: `muse-spark-1.3` estimates the filmed `full` room at 12 m², and the room really holds 3 desks; the earlier 4.5/3.5 gave only 2.
- Each room is counted separately. A room only counts if it is at least 1.4 m wide and 1.9 m deep, so one desk, its chair zone, and a 0.2 m wall gap fit.
- Calibration: the filmed `full` office really holds 3 desks.

**Seats** (meeting/training, in the largest room):
- classroom: area ÷ 1.9 m²
- theatre: area ÷ 1.0 m²

## Calibration targets (filmed units)

- `full`, 1 furnished room: office fits with about 3 desks; general and dental clinic **not suitable**.
- `empty1` / `empty2`, 2 rooms + bathroom + a small extra area (owner-confirmed): general clinic and dental clinic **fits** (or fits after fit-out).
