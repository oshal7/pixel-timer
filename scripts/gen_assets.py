#!/usr/bin/env python3
"""
gen_assets.py — author the Focus Kitchen v2 environment as hand-drawn pixel art.

The labelled asset sheet could not be delivered as a file (only as chat previews),
so per the plan we RECREATE it: every environment tile, tool and hero ingredient is
drawn procedurally at native low resolution on the PRD 32px grid (3/4 top-down
orthographic, top-left light). CSS `image-rendering: pixelated` upscales them.

Outputs:
  v2/assets/tiles/*.png     environment tiles, appliances, widgets, tools
  v2/assets/ing2/*.png      hero ingredient icons
  v2/data/tiles.json        {id,file,source_bbox} manifest (tileById() unchanged)
"""
import os, json
from PIL import Image, ImageDraw

TILES_DIR = "v2/assets/tiles"
ING_DIR = "v2/assets/ing2"
MANIFEST = []

# ---- PRD palette (+ shading tints) -----------------------------------------
P = {
    "walnut":   (54, 31, 10),
    "outline":  (34, 22, 12),
    "mahogany": (74, 44, 17),
    "wood":     (107, 74, 48),
    "wood_lt":  (140, 100, 62),
    "wood_dk":  (78, 52, 32),
    "cream":    (242, 227, 213),
    "cream_sh": (206, 188, 168),
    "cream_hi": (252, 244, 233),
    "steel":    (140, 150, 158),
    "steel_lt": (196, 204, 210),
    "steel_hi": (226, 232, 236),
    "steel_dk": (92, 101, 109),
    "terra":    (184, 101, 54),
    "terra_dk": (150, 78, 40),
    "tan":      (232, 201, 160),
    "tan_dk":   (206, 172, 128),
    "black":    (22, 16, 11),
    "white":    (245, 240, 230),
    "glass":    (206, 224, 232),
    "glass_dk": (150, 176, 188),
    "amber":    (216, 150, 66),
    "red":      (196, 60, 46),
    "red_dk":   (150, 40, 34),
    "green":    (96, 150, 78),
    "green_dk": (66, 110, 54),
    "yellow":   (226, 188, 70),
    "salmon":   (226, 138, 118),
    "salmon_dk":(196, 100, 84),
}

def new(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))

def save(img, name, folder=TILES_DIR, record=True):
    os.makedirs(folder, exist_ok=True)
    img.save(f"{folder}/{name}.png")
    if record:
        rel = f"assets/{'ing2' if folder==ING_DIR else 'tiles'}/{name}.png"
        MANIFEST.append({"id": name, "file": rel,
                         "source_bbox": {"x": 0, "y": 0, "w": img.width, "h": img.height}})

def rrect(d, box, fill, outline=None):
    d.rectangle(box, fill=fill, outline=outline)

def outline_edges(d, box, color):
    x0, y0, x1, y1 = box
    d.rectangle(box, outline=color)

# ---------------------------------------------------------------------------
# FLOORS (32x32, seamless)
# ---------------------------------------------------------------------------
def floor_checkered():
    img = new(32, 32); d = ImageDraw.Draw(img)
    for gy in range(0, 32, 16):
        for gx in range(0, 32, 16):
            light = ((gx // 16) + (gy // 16)) % 2 == 0
            base = P["cream"] if light else P["terra"]
            d.rectangle([gx, gy, gx+15, gy+15], fill=base)
            # subtle inner shade for texel feel
            sh = P["cream_sh"] if light else P["terra_dk"]
            d.rectangle([gx, gy+14, gx+15, gy+15], fill=sh)
            d.rectangle([gx+14, gy, gx+15, gy+15], fill=sh)
    save(img, "floor_checkered")

def floor_wood():
    img = new(32, 32); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 31], fill=P["wood"])
    for y in range(0, 32, 8):
        d.rectangle([0, y, 31, y], fill=P["wood_dk"])       # plank seam
        d.rectangle([0, y+1, 31, y+1], fill=P["wood_lt"])   # highlight
    # stagger short seams
    for (sx, sy) in [(10, 0), (24, 8), (4, 16), (18, 24)]:
        d.rectangle([sx, sy+1, sx, sy+7], fill=P["wood_dk"])
    save(img, "floor_wood")

def floor_slate():
    img = new(32, 32); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 31], fill=P["steel_dk"])
    for gy in range(0, 32, 16):
        for gx in range(0, 32, 16):
            d.rectangle([gx+1, gy+1, gx+14, gy+14], fill=P["steel"])
            d.rectangle([gx+1, gy+1, gx+14, gy+2], fill=P["steel_lt"])
    save(img, "floor_slate")

# ---------------------------------------------------------------------------
# WALLS (32x48 with top trim)
# ---------------------------------------------------------------------------
def wall_wood_panel():
    img = new(32, 48); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 47], fill=P["mahogany"])
    d.rectangle([0, 0, 31, 3], fill=P["wood_dk"])           # top cap shadow
    d.rectangle([0, 4, 31, 5], fill=P["wood_lt"])           # trim highlight
    for x in range(2, 32, 6):                               # vertical planks
        d.rectangle([x, 6, x, 47], fill=P["wood_dk"])
        d.rectangle([x+1, 6, x+1, 47], fill=P["wood"])
    save(img, "wall_wood_panel")

def wall_plaster():
    img = new(32, 48); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 47], fill=P["cream"])
    d.rectangle([0, 0, 31, 3], fill=P["wood"])              # wood top rail
    d.rectangle([0, 4, 31, 4], fill=P["wood_dk"])
    d.rectangle([0, 44, 31, 47], fill=P["cream_sh"])        # baseboard shade
    for (x, y) in [(6, 12), (20, 22), (12, 34), (26, 16)]:  # faint speckle
        d.point((x, y), fill=P["cream_sh"])
    save(img, "wall_plaster")

# ---------------------------------------------------------------------------
# COUNTERS & SINK
# ---------------------------------------------------------------------------
def _cabinet_front(d, box):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=P["wood"], outline=P["outline"])
    midx = (x0 + x1) // 2
    for cx0, cx1 in [(x0+2, midx-1), (midx+1, x1-2)]:       # two doors
        d.rectangle([cx0, y0+2, cx1, y1-2], fill=P["wood_dk"], outline=P["wood_lt"])
        d.point((cx1-1, (y0+y1)//2), fill=P["cream"])       # handle

def counter_base_straight():
    img = new(32, 32); d = ImageDraw.Draw(img)
    # orthographic counter: cream top face (with front lip), wood cabinet below
    d.rectangle([0, 0, 31, 9], fill=P["cream"], outline=P["outline"])   # top surface
    d.rectangle([0, 2, 31, 3], fill=P["cream_hi"])
    d.rectangle([0, 10, 31, 12], fill=P["cream_sh"])                    # front lip
    _cabinet_front(d, [0, 12, 31, 31])
    save(img, "counter_base_straight")

def counter_corner_l():
    img = new(32, 32); d = ImageDraw.Draw(img)
    # L-shaped cream top wrapping a corner cabinet
    d.rectangle([0, 0, 31, 31], fill=(0, 0, 0, 0))
    d.rectangle([0, 0, 31, 13], fill=P["cream"], outline=P["outline"])
    d.rectangle([0, 0, 13, 31], fill=P["cream"], outline=P["outline"])
    d.rectangle([0, 2, 31, 3], fill=P["cream_hi"])
    _cabinet_front(d, [0, 14, 13, 31])
    d.rectangle([14, 14, 31, 31], fill=P["wood"], outline=P["outline"])
    d.rectangle([16, 16, 29, 29], fill=P["wood_dk"], outline=P["wood_lt"])
    save(img, "counter_corner_l")

def sink_double_basin():
    img = new(64, 32); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 63, 11], fill=P["cream"], outline=P["outline"])   # counter top
    d.rectangle([0, 2, 63, 3], fill=P["cream_hi"])
    d.rectangle([0, 12, 63, 14], fill=P["cream_sh"])
    _cabinet_front(d, [0, 14, 63, 31])
    # two steel basins inset in the top
    for bx in (8, 36):
        d.rectangle([bx, 2, bx+18, 9], fill=P["steel_dk"], outline=P["outline"])
        d.rectangle([bx+2, 4, bx+16, 8], fill=P["steel"])
        d.rectangle([bx+2, 4, bx+16, 4], fill=P["steel_lt"])
    # faucet
    d.rectangle([30, 0, 31, 4], fill=P["steel_dk"])
    d.rectangle([30, 0, 34, 1], fill=P["steel_lt"])
    save(img, "sink_double_basin")

# ---------------------------------------------------------------------------
# APPLIANCES
# ---------------------------------------------------------------------------
def stove_range():
    img = new(64, 32); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 63, 31], fill=P["steel"], outline=P["outline"])
    d.rectangle([0, 0, 63, 12], fill=P["steel_dk"])                     # cooktop top face
    for i, bx in enumerate((7, 24, 41, 55)):
        r = 6 if i < 3 else 4
        d.ellipse([bx, 2, bx+r+2, 9], fill=P["black"], outline=P["steel_lt"])
    # front: two oven doors + handles + knobs
    for ox0, ox1 in [(3, 30), (33, 60)]:
        d.rectangle([ox0, 15, ox1, 29], fill=P["steel_dk"], outline=P["outline"])
        d.rectangle([ox0+3, 17, ox1-3, 19], fill=P["steel_lt"])        # handle
        d.rectangle([ox0+4, 22, ox1-4, 27], fill=(40, 44, 48))         # window
    for kx in (14, 22, 42, 50):
        d.ellipse([kx, 13, kx+2, 15], fill=P["steel_lt"])
    save(img, "stove_range")

def range_hood():
    img = new(64, 32); d = ImageDraw.Draw(img)
    d.rectangle([26, 0, 37, 8], fill=P["steel_dk"], outline=P["outline"])   # duct
    # trapezoid hood
    for y in range(9, 24):
        inset = int((y - 9) * 0.6)
        d.rectangle([6 + (14 - inset) - 4, y, 57 - (14 - inset) + 4, y], fill=P["steel"])
    d.polygon([(6, 24), (57, 24), (63, 31), (0, 31)], fill=P["steel_lt"], outline=P["outline"])
    d.rectangle([0, 28, 63, 31], fill=P["steel_dk"])
    d.line([(8, 26), (55, 26)], fill=P["steel_dk"])
    save(img, "range_hood")

def refrigerator():
    img = new(32, 64); d = ImageDraw.Draw(img)
    d.rectangle([2, 0, 29, 63], fill=P["steel"], outline=P["outline"])
    d.rectangle([2, 0, 29, 2], fill=P["steel_dk"])                     # top cap
    d.rectangle([4, 4, 27, 22], fill=P["steel_lt"], outline=P["steel_dk"])  # freezer door
    d.rectangle([4, 25, 27, 60], fill=P["steel_lt"], outline=P["steel_dk"]) # fridge door
    d.rectangle([24, 8, 25, 18], fill=P["steel_dk"])                  # handles
    d.rectangle([24, 30, 25, 52], fill=P["steel_dk"])
    d.rectangle([4, 23, 27, 24], fill=P["outline"])                   # seam
    save(img, "refrigerator")

def dishwasher():
    img = new(32, 40); d = ImageDraw.Draw(img)
    d.rectangle([1, 0, 30, 39], fill=P["steel"], outline=P["outline"])
    d.rectangle([3, 2, 28, 5], fill=P["steel_dk"])                    # control panel
    for lx in range(5, 26, 4):
        d.point((lx, 3), fill=P["steel_lt"])
    d.rectangle([4, 7, 27, 37], fill=P["steel_lt"], outline=P["steel_dk"])  # door
    d.rectangle([6, 9, 25, 10], fill=P["steel_dk"])                   # handle
    save(img, "dishwasher")

# ---------------------------------------------------------------------------
# STORAGE
# ---------------------------------------------------------------------------
def shelf_metal():
    img = new(32, 40); d = ImageDraw.Draw(img)
    for sy in (2, 18, 34):
        d.rectangle([2, sy, 29, sy+1], fill=P["steel_lt"])
        d.rectangle([2, sy+2, 29, sy+2], fill=P["steel_dk"])
    d.rectangle([2, 2, 3, 37], fill=P["steel"]); d.rectangle([28, 2, 29, 37], fill=P["steel"])
    # a couple of pots on shelves
    d.rectangle([6, 10, 14, 17], fill=P["steel_dk"], outline=P["outline"])
    d.rectangle([18, 26, 25, 33], fill=P["red"], outline=P["outline"])
    save(img, "shelf_metal")

def shelf_wood():
    img = new(32, 40); d = ImageDraw.Draw(img)
    d.rectangle([1, 0, 30, 39], fill=(0, 0, 0, 0))
    d.rectangle([1, 0, 2, 39], fill=P["wood_dk"]); d.rectangle([29, 0, 30, 39], fill=P["wood_dk"])
    for sy in (6, 20, 34):
        d.rectangle([1, sy, 30, sy+2], fill=P["wood"], outline=P["wood_dk"])
    jar_cols = [P["red"], P["yellow"], P["green"], P["terra"]]
    for i, jx in enumerate(range(5, 26, 6)):
        d.rectangle([jx, 1, jx+3, 5], fill=jar_cols[i % 4], outline=P["outline"])
        d.rectangle([jx, 15, jx+3, 19], fill=jar_cols[(i+1) % 4], outline=P["outline"])
    save(img, "shelf_wood")

def spice_rack():
    img = new(32, 32); d = ImageDraw.Draw(img)
    d.rectangle([1, 0, 30, 31], fill=P["wood"], outline=P["wood_dk"])
    d.rectangle([1, 0, 30, 1], fill=P["wood_lt"])
    cols = [P["red"], P["yellow"], P["green_dk"], P["terra"], P["red_dk"], P["amber"]]
    for row, ry in enumerate((3, 13, 23)):
        d.rectangle([2, ry+7, 29, ry+8], fill=P["wood_dk"])           # rail
        for i, jx in enumerate(range(3, 28, 5)):
            c = cols[(row*5 + i) % len(cols)]
            d.rectangle([jx, ry, jx+3, ry+7], fill=c, outline=P["outline"])
            d.rectangle([jx, ry, jx+3, ry], fill=P["steel_lt"])       # lid
    save(img, "spice_rack")

# ---------------------------------------------------------------------------
# WIDGETS  (drawn as glass/wood HOUSING; app overlays animated fluid/hands)
# ---------------------------------------------------------------------------
def distillery_tube():
    img = new(32, 96); d = ImageDraw.Draw(img)
    glass_fill = (200, 222, 232, 90)
    # --- tall condenser column (interior kept clear for the CSS fluid overlay:
    #     interior spans x 9..15, y 8..62 -> app overlays fluid there) ---
    d.rectangle([6, 5, 17, 64], fill=glass_fill, outline=P["glass_dk"])
    d.rectangle([6, 5, 17, 7], fill=P["glass"])                      # ground-glass top cap
    d.rectangle([5, 4, 18, 4], fill=P["glass_dk"])
    d.line([(8, 9), (8, 60)], fill=(255, 255, 255, 120))            # glass shine
    # --- condenser coil to the right, connected to the column ---
    d.line([(17, 12), (24, 12)], fill=P["glass_dk"])
    for cy in range(14, 46, 6):
        d.arc([22, cy, 31, cy + 8], 90, 300, fill=P["glass_dk"])
        d.arc([22, cy + 3, 31, cy + 11], 90, 300, fill=(180, 200, 212))
    d.line([(26, 46), (22, 60)], fill=P["glass_dk"])               # coil outflow -> beaker
    # --- round-bottom boiling flask under the column ---
    d.ellipse([2, 60, 21, 82], fill=glass_fill, outline=P["glass_dk"])
    d.ellipse([5, 72, 18, 80], fill=(P["amber"][0], P["amber"][1], P["amber"][2], 200))  # pooled amber
    d.line([(6, 65), (9, 70)], fill=(255, 255, 255, 130))
    # --- collection beaker, bottom-right (interior clear: x 22..30, y 78..92) ---
    d.rectangle([21, 76, 31, 93], fill=glass_fill, outline=P["glass_dk"])
    d.rectangle([20, 75, 32, 76], fill=P["glass_dk"])              # rim
    save(img, "distillery_tube")

def desk_clock():
    img = new(32, 32); d = ImageDraw.Draw(img)
    # ornate wooden mantel clock body (face kept open; CSS hands overlay)
    d.polygon([(4, 6), (27, 6), (24, 2), (7, 2)], fill=P["wood_dk"])  # pediment
    d.rectangle([3, 6, 28, 29], fill=P["wood"], outline=P["outline"])
    d.rectangle([3, 6, 28, 7], fill=P["wood_lt"])
    d.rectangle([2, 29, 29, 31], fill=P["wood_dk"])                  # base
    d.ellipse([7, 9, 24, 26], fill=P["cream_hi"], outline=P["outline"])   # dial
    for hx, hy in [(15, 11), (15, 24), (9, 17), (22, 17)]:           # tick marks
        d.point((hx, hy), fill=P["outline"])
    save(img, "desk_clock")

# ---------------------------------------------------------------------------
# TOOLS
# ---------------------------------------------------------------------------
def knife():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.polygon([(2, 11), (11, 4), (13, 6), (4, 13)], fill=P["steel_lt"], outline=P["outline"])
    d.line([(11, 4), (13, 6)], fill=P["steel_hi"])
    d.rectangle([12, 5, 15, 8], fill=P["wood_dk"], outline=P["outline"])  # handle
    save(img, "knife")

def cutting_board():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.rectangle([1, 3, 12, 14], fill=P["wood_lt"], outline=P["wood_dk"])  # board
    d.rectangle([1, 3, 12, 4], fill=(P["cream_hi"][0], P["cream_hi"][1], P["cream_hi"][2]))
    d.line([(4, 5), (4, 13)], fill=P["wood"])                            # grain
    d.line([(9, 5), (9, 13)], fill=P["wood"])
    d.rectangle([12, 6, 15, 9], fill=P["wood_lt"], outline=P["wood_dk"])  # handle
    for cx in (5, 8):                                                     # chopped veg
        d.ellipse([cx-1, 8, cx+1, 10], fill=P["red"], outline=P["red_dk"])
    save(img, "cutting_board")

def spatula():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.rectangle([9, 2, 10, 11], fill=P["wood"], outline=P["wood_dk"])    # handle
    d.rectangle([6, 10, 13, 14], fill=P["steel_lt"], outline=P["outline"])
    save(img, "spatula")

def spoon():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.rectangle([7, 1, 8, 9], fill=P["wood"], outline=P["wood_dk"])
    d.ellipse([4, 8, 11, 15], fill=P["wood_lt"], outline=P["wood_dk"])
    save(img, "spoon")

def whisk():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.rectangle([7, 1, 8, 6], fill=P["steel_dk"])
    for x0 in (5, 7, 9):
        d.arc([x0-1, 6, x0+3, 15], 200, 340, fill=P["steel_lt"])
    save(img, "whisk")

def ladle():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.line([(9, 1), (7, 9)], fill=P["steel_dk"], width=1)
    d.ellipse([3, 8, 10, 15], fill=P["steel"], outline=P["outline"])
    d.ellipse([5, 9, 8, 12], fill=P["steel_lt"])
    save(img, "ladle")

# ---------------------------------------------------------------------------
# HERO INGREDIENTS (16x16)  -> v2/assets/ing2 ; ids match v1 ingredient ids
# ---------------------------------------------------------------------------
def _leaf(d, x, y):
    d.polygon([(x, y), (x+2, y-2), (x+3, y)], fill=P["green_dk"])

def ing_tomato():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.ellipse([3, 4, 13, 14], fill=P["red"], outline=P["red_dk"])
    d.ellipse([5, 6, 8, 9], fill=(230, 120, 100))          # highlight
    _leaf(d, 7, 4)
    save(img, "tomato", ING_DIR)

def ing_bell_pepper():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.ellipse([3, 4, 12, 14], fill=P["yellow"], outline=(180, 140, 40))
    d.rectangle([7, 2, 8, 5], fill=P["green_dk"])
    d.ellipse([5, 6, 7, 9], fill=(245, 220, 120))
    save(img, "bell_pepper", ING_DIR)

def ing_chili():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.polygon([(5, 3), (7, 4), (11, 12), (8, 13), (5, 6)], fill=P["red"], outline=P["red_dk"])
    d.rectangle([5, 2, 6, 4], fill=P["green_dk"])
    save(img, "chili", ING_DIR)

def ing_fish():  # salmon fillet
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.ellipse([2, 5, 14, 12], fill=P["salmon"], outline=P["salmon_dk"])
    for lx in (5, 8, 11):
        d.line([(lx, 6), (lx, 11)], fill=P["cream_hi"])
    save(img, "fish", ING_DIR)

def ing_ground_beef():  # steak
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.ellipse([2, 4, 13, 13], fill=P["red_dk"], outline=P["outline"])
    d.ellipse([4, 6, 11, 11], fill=(170, 70, 60))
    d.rectangle([11, 5, 13, 12], fill=(235, 235, 225))     # fat edge
    save(img, "ground_beef", ING_DIR)

def ing_eggs():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.rectangle([2, 8, 14, 14], fill=P["wood"], outline=P["wood_dk"])   # carton
    for ex in (4, 8, 12):
        d.ellipse([ex-2, 4, ex+2, 10], fill=P["white"], outline=P["cream_sh"])
    save(img, "eggs", ING_DIR)

def ing_flour():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.polygon([(4, 5), (12, 5), (13, 14), (3, 14)], fill=P["cream"], outline=P["cream_sh"])
    d.rectangle([6, 3, 10, 5], fill=P["cream_hi"])         # folded top
    d.rectangle([6, 9, 10, 12], fill=P["terra"])           # label
    save(img, "flour", ING_DIR)

def ing_sugar():
    img = new(16, 16); d = ImageDraw.Draw(img)
    d.rectangle([3, 4, 12, 14], fill=P["white"], outline=P["cream_sh"])
    d.rectangle([3, 7, 12, 10], fill=(150, 200, 230))      # blue band
    d.rectangle([5, 8, 10, 9], fill=P["white"])
    save(img, "sugar", ING_DIR)

# ---------------------------------------------------------------------------
def main():
    for f in (floor_checkered, floor_wood, floor_slate,
              wall_wood_panel, wall_plaster,
              counter_base_straight, counter_corner_l, sink_double_basin,
              stove_range, range_hood, refrigerator, dishwasher,
              shelf_metal, shelf_wood, spice_rack,
              distillery_tube, desk_clock,
              knife, cutting_board, spatula, spoon, whisk, ladle,
              ing_tomato, ing_bell_pepper, ing_chili, ing_fish, ing_ground_beef,
              ing_eggs, ing_flour, ing_sugar):
        f()
    os.makedirs("v2/data", exist_ok=True)
    json.dump({"note": "hand-authored pixel-art recreation of the labelled asset sheet "
                       "(PRD 3/4 orthographic, 32px grid). Generated by scripts/gen_assets.py.",
               "sprites": MANIFEST},
              open("v2/data/tiles.json", "w"), indent=2)
    print(f"generated {len(MANIFEST)} sprites")

if __name__ == "__main__":
    main()
