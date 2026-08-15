# Raw sheets

Unprocessed Nano Banana output, straight from generation — green background
(`#00FF00`) included, not yet keyed or sliced. This is the archive of every
iteration, not just the ones currently wired into the game, so we can go
back and pick a different run later without regenerating.

## Naming

`Sheet<NN><letter?>_<name>_<iteration>.png`, matching the sheet IDs in
`docs/asset-bible.html` (section 05, "The prompts"):

- `Sheet01_floors_1.png`, `Sheet01_floors_2.png`, …
- `Sheet09a_produce_1.png` for batched sheets (Sheet 09, Sheet 10)

## Pipeline

These are inputs to `tools/key_and_slice.py`, not final assets. Nothing in
here is loaded by the game directly — processed output goes to
`assets/env_v3/`, `assets/food_v3/`, `assets/fx_v3/` etc. per the table in
asset-bible.html section 06.
