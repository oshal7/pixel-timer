#!/usr/bin/env python3
"""
slice_sheet.py — slice the new Focus Kitchen asset sheet into individual tile PNGs.

STATUS: ready to run once the asset-sheet image is on disk. The sheet only came
through as an inline chat image so far; save it (e.g. to assets_src/new_sheet.png)
and run this script to populate v2/assets/tiles/ and v2/data/tiles.json.

The new sheet has a TRANSPARENT checkerboard background, so sprites are isolated
by connected-component blob detection on the ALPHA channel (mirrors the original
pipeline noted in data/tiles.json, which subtracted a two-tone checkerboard).

Usage:
    python3 scripts/slice_sheet.py assets_src/new_sheet.png

Then hand-label the emitted blobs using the labelled reference the user provided
(tile_floor_checkered, tile_wall_wood_panel, counter_base_straight, sink_double_basin,
appliance_stove_range, appliance_range_hood, appliance_refrigerator, widget_distillery_tube,
widget_desk_clock, shelf_*, spice_rack, ...) and drop them into v2/data/tiles.json.
"""
import sys, os, json

def main(path):
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow required: pip install pillow")

    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    ALPHA_MIN = 24            # treat near-transparent as background
    visited = [[False] * w for _ in range(h)]
    blobs = []

    def flood(sx, sy):
        stack = [(sx, sy)]
        minx = maxx = sx
        miny = maxy = sy
        while stack:
            x, y = stack.pop()
            if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
                continue
            if px[x, y][3] <= ALPHA_MIN:
                continue
            visited[y][x] = True
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
            stack.extend([(x+1, y), (x-1, y), (x, y+1), (x, y-1)])
        return (minx, miny, maxx - minx + 1, maxy - miny + 1)

    for y in range(h):
        for x in range(w):
            if not visited[y][x] and px[x, y][3] > ALPHA_MIN:
                bx, by, bw, bh = flood(x, y)
                if bw >= 20 and bh >= 20:      # drop specks / label text
                    blobs.append({"x": bx, "y": by, "w": bw, "h": bh})

    os.makedirs("v2/assets/tiles", exist_ok=True)
    sprites = []
    for i, b in enumerate(sorted(blobs, key=lambda b: (b["y"] // 40, b["x"]))):
        crop = img.crop((b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]))
        fid = f"blob_{i:02d}"
        crop.save(f"v2/assets/tiles/{fid}.png")
        sprites.append({"id": fid, "file": f"assets/tiles/{fid}.png", "source_bbox": b})

    json.dump(
        {"note": f"auto-sliced from {os.path.basename(path)} via alpha blob detection; rename ids to match the labelled reference sheet",
         "sprites": sprites},
        open("v2/data/tiles.json.new", "w"), indent=2,
    )
    print(f"sliced {len(sprites)} blobs -> v2/assets/tiles/ ; review + rename in v2/data/tiles.json.new")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
