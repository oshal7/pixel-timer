# Processing report — commit 6b28d06 (branch `oshal7-patch-1`)

21 raw sheets pulled in, keyed, sliced, and sorted. Summary below; full detail inline.

## Shipped to `assets/env_v3/`, `assets/fx_v3/`, manifests written

| Category | Count | Notes |
|---|---|---|
| `floor/` | 6/6 | All pass the seamless check. `checkerboard` needed a phase-aligned re-crop (its naive crop scored a 61-point seam mismatch — fixed by searching for an offset that lands on a full tile period, now 0.6). |
| `fixture/` | 8/8 | Doors, windows, stairs, pantry door, clock, chalkboard menu. Clean. |
| `counter/` | 6/6 | Iteration 4 used — cleanest of the 4 you sent. Text labels ("Gas Stove Unit" etc.) baked into these sheets were auto-dropped: individual letters fall under the slicer's 400px component-size floor, so they never made it into the output. |
| `appliance/` | 6/6 | Same text-label auto-filtering as counters. Clean. |
| `nook/` | 12/12 | Armchairs, tables, lamp, plants, footstool. Some have a baked-in drop shadow (the style rules ask for none on green — cosmetic only, doesn't affect keying, left as-is). |
| `prop/` | 17/17 | Pots, board, plates, book, teapot, spices, honey, fruit bowl, rolling pin, basket, mortar, herbs, canister (labelled "CHALK MADELIED" — minor text slip, one item, not blocking), pitcher. |
| `wall/` | 5 | Crown moulding, skirting board, 2 mirrored corners, one flat banister run. **Wall plank/wainscot textures from this batch failed the seamless check (LR seam 24–46, threshold 18) — they were sliced from the green-background grid version, which bakes in a border, exactly the failure mode the bible warned about. Excluded. Still need a dedicated borderless texture run for walls, same treatment as Sheet01a.** |
| `fx_v3/steam,flour_dust,burnt_smoke,flame,sparkle,bubbles` | 4 frames each | **Big improvement over the first FX pass** — genuine hard-edged dithered pixel art, no gaussian blur, real 4-frame progression. Came back on a magenta background instead of green; `key_and_slice.py` now takes `--key magenta` so this didn't need a re-request. |

## Staged, not yet live: `assets_src/processed/food_v3_staged/` (40 of 50)

Cross-checked against the actual 50 ids in `assets/food_v3/` (not just my batch prompts, which I should have derived from that file directly rather than writing from memory). 40 map cleanly. **Not swapped into `assets/food_v3/` yet** — that folder is live in the running game, and a partial swap would mix two visibly different art styles until the rest catches up. Say the word and I'll drop these 40 in.

**10 ids with no usable new art:**
- Never generated: `cinnamon`, `saffron`, `star_anise`, `yeast`, `pepper`, `flour`
- Generated but broken/unclear in-batch (herbs & citrus drifted off-topic in its later rows — classic coherence loss past ~10 items, the same failure mode the bible's batching was meant to prevent, still crept in here): `basil`, `parsley`, `lime`
- `ground_beef`: batch rendered a whole steak, not ground beef — visually wrong for this id, left unmapped rather than forcing a bad match

**Generated but with nowhere to go** (not in the current 50 ids — either add them to the game or drop): `lettuce`/cabbage, `yoghurt`, `vinegar`, `honey`, `prawn`, one ambiguous unlabelled sack (could be flour or rice, can't tell which was intended).

## Not processed

`Sheet02_walls_2.png` — third exploratory iteration, superseded by `walls_3`/`walls_1` picks above; raw file kept in `raw_sheets/` per the "keep every iteration" policy, just not sliced into the shipped set.
