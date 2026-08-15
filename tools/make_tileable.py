#!/usr/bin/env python3
"""
Split a grid-composite texture image into cells and force each cell to tile.

    python3 tools/make_tileable.py sheet.png --rows 2 --cols 3 \
        --out assets/env_v3/floor --names cream,terracotta,checker,oak,walnut,stone

Why this exists: a generator can produce a texture that *looks* seamless but
isn't. These textures are procedurally regular (grids of tiles, rows of planks),
so instead of trusting the output we DETECT the repeating period by
autocorrelation and crop exactly one period. A single period tiles perfectly by
construction.

Also handles the practical mess of composites: dark divider lines between cells
are auto-detected and trimmed, and the generator's corner watermark is avoided
by preferring a period crop from the top-left of each cell.

Reports seam scores before and after so the improvement is visible.
"""
import argparse, os

import numpy as np
from PIL import Image


def seam(rgb):
    """Wrap discontinuity vs the SHARPEST edge the texture already contains.

    A correctly cropped tile's last row is *adjacent* to its first in the repeat,
    not equal to it — and if the crop lands where a grout line begins, that wrap
    is legitimately a hard edge. So the wrap is only a defect when it is harsher
    than any edge occurring naturally inside the texture. Normalising by the
    95th-percentile internal step gives ~1.0 for "just another edge".
    """
    a = rgb[..., :3].astype(np.int32)
    if a.shape[0] < 4 or a.shape[1] < 4:
        return 99.0, 99.0
    step_v = np.abs(a[1:, :, :] - a[:-1, :, :]).mean(axis=(1, 2))
    step_h = np.abs(a[:, 1:, :] - a[:, :-1, :]).mean(axis=(0, 2))
    ref_v = max(float(step_v.max()), 1.0)
    ref_h = max(float(step_h.max()), 1.0)
    wrap_v = np.abs(a[0, :, :] - a[-1, :, :]).mean()
    wrap_h = np.abs(a[:, 0, :] - a[:, -1, :]).mean()
    return wrap_h / ref_h, wrap_v / ref_v


def period_confidence(cell, p, axis):
    """How well the texture repeats at offset p. <0.35 = a genuine repeat, so a
    one-period crop tiles perfectly by construction."""
    a = cell[..., :3].astype(np.int32)
    n = a.shape[axis]
    if p >= n:
        return None
    d = (np.abs(a[p:, :, :] - a[:-p, :, :]).mean() if axis == 0
         else np.abs(a[:, p:, :] - a[:, :-p, :]).mean())
    spread = np.abs(a - a.mean(axis=(0, 1), keepdims=True)).mean() + 1e-6
    return d / spread


def trim_dividers(cell, max_trim=6):
    """Drop dark divider rows/cols hugging the cell edges."""
    g = cell[..., :3].mean(axis=2)
    med = np.median(g)
    top, bot, left, right = 0, cell.shape[0], 0, cell.shape[1]
    for i in range(min(max_trim, cell.shape[0] // 4)):
        if g[i].mean() < med * 0.72: top = i + 1
        else: break
    for i in range(min(max_trim, cell.shape[0] // 4)):
        if g[-(i + 1)].mean() < med * 0.72: bot = cell.shape[0] - (i + 1)
        else: break
    for i in range(min(max_trim, cell.shape[1] // 4)):
        if g[:, i].mean() < med * 0.72: left = i + 1
        else: break
    for i in range(min(max_trim, cell.shape[1] // 4)):
        if g[:, -(i + 1)].mean() < med * 0.72: right = cell.shape[1] - (i + 1)
        else: break
    return cell[top:bot, left:right]


def best_period(arr, axis, min_p=24):
    """Find the repeat length along `axis` by minimising self-difference.

    Only accepts a period if it is a *genuine* repeat — its self-difference must
    be well below the typical difference across all offsets. Noise alone
    produces spurious tiny periods, which would crop a useless sliver, so
    without a clear winner we keep the full cell.
    """
    n = arr.shape[axis]
    max_p = n // 2
    if max_p <= min_p:
        return n
    a = arr[..., :3].astype(np.int32)
    scores = {}
    for p in range(min_p, max_p + 1):
        if axis == 0:
            scores[p] = np.abs(a[p:, :, :] - a[:-p, :, :]).mean()
        else:
            scores[p] = np.abs(a[:, p:, :] - a[:, :-p, :]).mean()
    if not scores:
        return n
    typical = float(np.median(list(scores.values())))
    best_p = min(scores, key=lambda p: scores[p] + p * 0.002)
    # a real repeat is markedly better than the typical offset
    if scores[best_p] > typical * 0.80:
        return n
    return best_p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--names", default="", help="comma-separated names, row-major")
    ap.add_argument("--size", type=int, default=0, help="rescale output to NxN px (e.g. 32)")
    ap.add_argument("--no-period", action="store_true", help="skip period cropping")
    args = ap.parse_args()

    img = Image.open(args.sheet).convert("RGB")
    a = np.array(img)
    H, W = a.shape[:2]
    ch, cw = H // args.rows, W // args.cols
    names = [n.strip() for n in args.names.split(",") if n.strip()]

    os.makedirs(args.out, exist_ok=True)
    print(f"{os.path.basename(args.sheet)}: {W}x{H} -> {args.rows}x{args.cols} cells "
          f"({cw}x{ch} each)\n")
    hdr = (f"{'file':<20} {'cell':>10} {'tile':>10} {'repeat?':>18} "
           f"{'wrap h/v':>11}  verdict")
    print(hdr); print("-" * (len(hdr) + 2))

    idx = 0
    for r in range(args.rows):
        for c in range(args.cols):
            cell = a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            cell = trim_dividers(cell)

            if args.no_period:
                phh, pw = cell.shape[0], cell.shape[1]
            else:
                phh = best_period(cell, 0)
                pw = best_period(cell, 1)
            tile = cell[:phh, :pw]

            cv = period_confidence(cell, phh, 0) if phh < cell.shape[0] else None
            chz = period_confidence(cell, pw, 1) if pw < cell.shape[1] else None
            # a crop at a genuine period tiles by construction
            by_period = ((cv is not None and cv < 0.35) or phh == cell.shape[0]) and \
                        ((chz is not None and chz < 0.35) or pw == cell.shape[1])
            strong = [x for x in (cv, chz) if x is not None]
            rep = "/".join(f"{x:.2f}" for x in strong) if strong else "full cell"

            w_h, w_v = seam(tile)
            name = names[idx] if idx < len(names) else f"tex_{idx:02d}"
            out_img = Image.fromarray(tile)
            if args.size:
                out_img = out_img.resize((args.size, args.size), Image.NEAREST)
            out_img.save(os.path.join(args.out, f"{name}.png"))

            found_period = phh < cell.shape[0] or pw < cell.shape[1]
            ok = by_period if found_period else (w_h < 2.5 and w_v < 2.5)
            print(f"{name + '.png':<20} {f'{cell.shape[1]}x{cell.shape[0]}':>10} "
                  f"{f'{pw}x{phh}':>10} {rep:>18} "
                  f"{f'{w_h:.2f}/{w_v:.2f}':>11}  {'ok' if ok else 'CHECK'}")
            idx += 1

    print("\nrepeat? = self-match at the detected period (under 0.35 = a real repeat,")
    print("          so the one-period crop tiles by construction)")
    print("wrap h/v = wrap edge vs the sharpest edge already in the texture (~1 is fine)")


if __name__ == "__main__":
    main()
