#!/usr/bin/env python3
"""
Chroma-key + slice a generated sprite sheet into individual PNGs.

    python3 tools/key_and_slice.py SHEET.png --out assets/env_v3/floor [--tile]

Steps:
  1. key      — pure-green background -> alpha (distance in RGB, tolerant of JPEG noise)
  2. despill  — kill the green fringe that survives on object edges
  3. label    — connected-component detection to find each object's real bbox
  4. trim     — write one tightly-cropped PNG per object
  5. report   — sizes, plus a SEAMLESS check when --tile is passed

--tile also reports, per object, how badly its opposite edges disagree. A truly
tileable texture scores near 0; anything with a drawn border/shadow scores high
and will show a visible grid when repeated across a floor.
"""
import argparse, os, sys
from collections import deque

import numpy as np
from PIL import Image

GREEN = np.array([0, 255, 0], dtype=np.int32)


def key_green(img, tol=110):
    """RGB-distance key. Returns RGBA array with background alpha=0."""
    rgb = np.array(img.convert("RGB"), dtype=np.int32)
    dist = np.sqrt(((rgb - GREEN) ** 2).sum(axis=2))
    bg = dist < tol
    # also catch 'greenish' pixels: green channel dominates both others strongly
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    greenish = (g > r + 60) & (g > b + 60)
    bg |= greenish

    out = np.dstack([rgb.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)])
    return out, bg


def despill(rgba):
    """Clamp green channel on kept pixels so edges don't glow green."""
    a = rgba[..., 3] > 0
    r = rgba[..., 0].astype(np.int16)
    g = rgba[..., 1].astype(np.int16)
    b = rgba[..., 2].astype(np.int16)
    cap = np.maximum(r, b) + 12
    newg = np.where(a & (g > cap), cap, g)
    rgba[..., 1] = np.clip(newg, 0, 255).astype(np.uint8)
    return rgba


def label_components(mask, min_px=400):
    """BFS connected components over a boolean 'is object' mask (4-neighbour)."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    boxes = []
    for y0 in range(h):
        row = mask[y0]
        for x0 in range(w):
            if not row[x0] or seen[y0, x0]:
                continue
            q = deque([(y0, x0)])
            seen[y0, x0] = True
            minx = maxx = x0
            miny = maxy = y0
            n = 0
            while q:
                y, x = q.popleft()
                n += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if n >= min_px:
                boxes.append((minx, miny, maxx, maxy, n))
    return boxes


def seam_score(tile_rgb):
    """Mean abs difference between opposite edges. ~0 = seamless."""
    a = tile_rgb.astype(np.int16)
    lr = np.abs(a[:, 0, :3] - a[:, -1, :3]).mean()
    tb = np.abs(a[0, :, :3] - a[-1, :, :3]).mean()
    return lr, tb


def vignette_score(tile_rgb):
    """Centre brightness vs edge brightness. High = lighting hotspot that will
    repeat as a visible grid of bright blobs when tiled."""
    g = tile_rgb[..., :3].mean(axis=2)
    h, w = g.shape
    cy, cx = h // 2, w // 2
    ch, cw = max(1, h // 4), max(1, w // 4)
    centre = g[cy - ch:cy + ch, cx - cw:cx + cw].mean()
    edge = np.concatenate([g[0, :], g[-1, :], g[:, 0], g[:, -1]]).mean()
    return centre - edge


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--out", required=True)
    ap.add_argument("--prefix", default="item")
    ap.add_argument("--tol", type=int, default=110)
    ap.add_argument("--min-px", type=int, default=400)
    ap.add_argument("--tile", action="store_true", help="run seamless/vignette checks")
    args = ap.parse_args()

    img = Image.open(args.sheet)
    rgba, bg = key_green(img, args.tol)
    rgba = despill(rgba)
    obj = ~bg

    boxes = label_components(obj, args.min_px)
    # reading order: top-to-bottom in bands, then left-to-right
    boxes.sort(key=lambda b: (b[1] // max(1, img.height // 12), b[0]))

    os.makedirs(args.out, exist_ok=True)
    print(f"{os.path.basename(args.sheet)}: {img.width}x{img.height} -> {len(boxes)} objects\n")
    hdr = f"{'#':>3} {'file':<22} {'size':>12} {'px':>9}"
    if args.tile:
        hdr += f" {'seam L/R':>9} {'seam T/B':>9} {'hotspot':>8}  verdict"
    print(hdr)
    print("-" * (len(hdr) + 2))

    for i, (minx, miny, maxx, maxy, n) in enumerate(boxes):
        crop = rgba[miny:maxy + 1, minx:maxx + 1]
        name = f"{args.prefix}_{i:02d}.png"
        Image.fromarray(crop, "RGBA").save(os.path.join(args.out, name))
        w, h = maxx - minx + 1, maxy - miny + 1
        line = f"{i:>3} {name:<22} {f'{w}x{h}':>12} {n:>9}"
        if args.tile:
            lr, tb = seam_score(crop)
            vg = vignette_score(crop)
            bad = lr > 18 or tb > 18 or abs(vg) > 12
            line += f" {lr:>9.1f} {tb:>9.1f} {vg:>8.1f}  {'NOT SEAMLESS' if bad else 'ok'}"
        print(line)

    if args.tile:
        print("\nseam = mean edge mismatch (>18 shows a grid when tiled)")
        print("hotspot = centre-vs-edge brightness (>12 repeats as bright blobs)")


if __name__ == "__main__":
    main()
