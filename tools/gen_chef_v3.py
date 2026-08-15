#!/usr/bin/env python3
"""
Build the v3 chef animation system: one folder per STATE and a single manifest
so animations are easy to reference and swap in-game.

To replace an animation later: drop your new frames into
assets/chef_v3/<state>/ named 00.png, 01.png, … and update that state's
"count" in data/chef_v3.json. Nothing else in the game needs to change.

States map to concrete in-game actions. Directional walks are separated so
real up/down/left/right art can be dropped in per direction. Until then they
reuse the one existing walk cycle (left is just right, mirrored in-game).
"""
import json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "chef")
OUT = os.path.join(ROOT, "assets", "chef_v3")

# state -> (source prefix in assets/chef, count, frame_ms, loop, note)
STATES = {
    "idle":       ("idle",        10, 450, True,  "Standing still (home screen)."),
    "walk_right": ("walking",     12, 110, True,  "Walking to the right / along a row."),
    "walk_left":  ("walking",     12, 110, True,  "Walking left — mirrored from walk_right in-game until dedicated art exists."),
    "walk_up":    ("walking",     12, 110, True,  "Walking up a column (PLACEHOLDER: reuses side walk; needs real up art)."),
    "walk_down":  ("walking",     12, 110, True,  "Walking down a column (PLACEHOLDER: reuses side walk; needs real down art)."),
    "carry":      ("walking",     12, 130, True,  "Walking while carrying the basket (PLACEHOLDER: reuses walk; needs a basket pose)."),
    "pick":       ("interaction",  8, 220, False, "Reaching to pick an item up (PLACEHOLDER: currently the book-read frames; needs a real reach/grab)."),
    "chop":       ("chopping",     6, 300, True,  "Chopping at the prep counter."),
    "stir":       ("stirring",     6, 260, True,  "Stirring the pot on the stove."),
    "present":    ("presenting",   6, 500, False, "Holding up the finished dish."),
    "read_book":  ("interaction",  8, 350, False, "Reading the recipe book (the real meaning of the old 'interaction' frames)."),
}

def frame_name(prefix, i):
    return f"{prefix}_{i:02d}.png"

def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    manifest = {
        "_readme": "v3 chef animations. Swap art by replacing frames in "
                   "assets/chef_v3/<state>/ (named 00.png, 01.png, …) and updating "
                   "'count' here. 'flip' mirrors a state horizontally in-game. "
                   "States are referenced by name from v3/app.js.",
        "states": {},
    }
    for state, (prefix, count, ms, loop, note) in STATES.items():
        d = os.path.join(OUT, state)
        os.makedirs(d, exist_ok=True)
        real = 0
        for i in range(count):
            src = os.path.join(SRC, frame_name(prefix, i))
            if os.path.exists(src):
                shutil.copyfile(src, os.path.join(d, f"{i:02d}.png"))
                real += 1
        manifest["states"][state] = {
            "dir": f"assets/chef_v3/{state}",
            "count": real,
            "frame_ms": ms,
            "loop": loop,
            "flip": state == "walk_left",
            "note": note,
        }
    with open(os.path.join(ROOT, "data", "chef_v3.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("states:", ", ".join(f"{k}({v['count']})" for k, v in manifest["states"].items()))

if __name__ == "__main__":
    build()
