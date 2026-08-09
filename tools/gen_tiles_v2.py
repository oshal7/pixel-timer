#!/usr/bin/env python3
"""
Focus Kitchen v2 environment tileset generator.

Authors a cohesive 3/4 top-down pixel-art kitchen set styled after the new
reference sheet, using the PRD's locked palette (PRD 3.1):
    mahogany wood  #4A2C11    cream counter #F2E3D5
    brushed steel  #8C969E    terracotta    #B86536
    walnut border  #361F0A

Every sprite is drawn on a transparent canvas so it composites cleanly over the
floor. Output PNGs go to assets/tiles_v2/, and a schema-compatible manifest is
written to data/tiles_v2.json (same shape as data/tiles.json so the existing
gallery + scene composer read it unchanged).
"""
import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "tiles_v2")
os.makedirs(OUT_DIR, exist_ok=True)

# Render at 4x the logical pixel grid, then rely on CSS image-rendering:pixelated.
S = 4

# ---- palette --------------------------------------------------------------
CREAM      = (242, 227, 213)
CREAM_HI   = (252, 243, 232)
CREAM_LO   = (214, 196, 178)
MAHOG      = (74, 44, 17)
MAHOG_HI   = (110, 70, 34)
MAHOG_LO   = (52, 30, 12)
WALNUT     = (54, 31, 10)
WALNUT_HI  = (86, 54, 26)
STEEL      = (140, 150, 158)
STEEL_HI   = (196, 204, 210)
STEEL_LO   = (96, 104, 112)
STEEL_DK   = (70, 78, 86)
TERRA      = (184, 101, 54)
TERRA_HI   = (206, 128, 78)
TERRA_LO   = (150, 78, 38)
GREY_TILE  = (120, 122, 128)
GREY_TILE2 = (150, 152, 158)
BLACK      = (28, 22, 16)
GLASS      = (208, 224, 230)
GLASS_HI   = (240, 248, 250)
AMBER      = (196, 132, 60)
WOOD_LT    = (150, 96, 54)


def canvas(w, h):
    img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def rect(d, x, y, w, h, color):
    d.rectangle([x * S, y * S, (x + w) * S - 1, (y + h) * S - 1], fill=color)


def line(d, x1, y1, x2, y2, color, width=1):
    d.line([x1 * S, y1 * S, x2 * S, y2 * S], fill=color, width=width * S)


def save(img, name):
    img.save(os.path.join(OUT_DIR, name + ".png"))


# ---- floors (seamless 32x32) ---------------------------------------------

def floor_checker():
    img, d = canvas(32, 32)
    for gy in range(4):
        for gx in range(4):
            c = CREAM if (gx + gy) % 2 == 0 else CREAM_LO
            rect(d, gx * 8, gy * 8, 8, 8, c)
            rect(d, gx * 8, gy * 8, 8, 1, CREAM_HI if c == CREAM else CREAM)
    save(img, "floor_checker")


def floor_terracotta():
    img, d = canvas(32, 32)
    rect(d, 0, 0, 32, 32, TERRA)
    for gy in range(2):
        for gx in range(2):
            ox, oy = gx * 16, gy * 16
            rect(d, ox, oy, 16, 2, TERRA_HI)
            rect(d, ox, oy, 2, 16, TERRA_HI)
            rect(d, ox, oy + 15, 16, 1, TERRA_LO)
            rect(d, ox + 15, oy, 1, 16, TERRA_LO)
    save(img, "floor_terracotta")


def floor_stone():
    img, d = canvas(32, 32)
    rect(d, 0, 0, 32, 32, GREY_TILE)
    for gy in range(4):
        for gx in range(4):
            ox, oy = gx * 8, gy * 8
            c = GREY_TILE2 if (gx * 3 + gy) % 2 else GREY_TILE
            rect(d, ox, oy, 8, 8, c)
            rect(d, ox, oy, 8, 1, STEEL_HI)
            rect(d, ox, oy + 7, 8, 1, STEEL_LO)
    save(img, "floor_stone")


def floor_wood():
    img, d = canvas(32, 32)
    rect(d, 0, 0, 32, 32, WOOD_LT)
    for i in range(4):
        y = i * 8
        rect(d, 0, y, 32, 8, WOOD_LT if i % 2 == 0 else MAHOG_HI)
        rect(d, 0, y, 32, 1, (176, 120, 70))
        rect(d, 0, y + 7, 32, 1, MAHOG_LO)
    save(img, "floor_wood")


# ---- walls ----------------------------------------------------------------

def wall_wood_panel():
    # 32 wide, 24 tall: top-down depth trim + wainscot front face
    img, d = canvas(32, 24)
    rect(d, 0, 0, 32, 6, MAHOG_HI)          # top cap (depth)
    rect(d, 0, 0, 32, 1, WALNUT_HI)
    rect(d, 0, 6, 32, 18, MAHOG)            # front elevation
    for px in range(0, 32, 8):              # panel dividers
        rect(d, px, 8, 1, 14, MAHOG_LO)
        rect(d, px + 1, 8, 6, 14, MAHOG_HI)
        rect(d, px + 1, 8, 6, 1, (120, 80, 42))
    rect(d, 0, 22, 32, 2, WALNUT)           # baseboard
    save(img, "wall_wood_panel")


def wall_plaster():
    img, d = canvas(32, 24)
    rect(d, 0, 0, 32, 6, CREAM_LO)
    rect(d, 0, 6, 32, 18, CREAM)
    rect(d, 0, 6, 32, 1, CREAM_HI)
    rect(d, 0, 22, 32, 2, WALNUT)
    save(img, "wall_plaster")


# ---- helper: a counter block with cream top (3/4 view) -------------------

def counter_block(d, x, y, w, top_h=5, body_h=13):
    # cream top surface
    rect(d, x, y, w, top_h, CREAM)
    rect(d, x, y, w, 1, CREAM_HI)
    rect(d, x, y + top_h - 1, w, 1, CREAM_LO)
    # wood front
    rect(d, x, y + top_h, w, body_h, MAHOG)
    rect(d, x, y + top_h, w, 1, MAHOG_HI)
    rect(d, x, y + top_h + body_h - 1, w, 1, MAHOG_LO)


def cabinet_doors(d, x, y, w, top_h, body_h, n):
    dw = w // n
    for i in range(n):
        dx = x + i * dw
        rect(d, dx + 1, y + top_h + 2, dw - 2, body_h - 4, MAHOG_HI)
        rect(d, dx + 1, y + top_h + 2, dw - 2, 1, (120, 80, 42))
        rect(d, dx + 2, y + top_h + 3, dw - 4, body_h - 6, MAHOG)
        # knob
        rect(d, dx + dw - 4, y + top_h + body_h // 2, 2, 2, CREAM_LO)


def cabinet_lower_run():
    img, d = canvas(48, 20)
    counter_block(d, 0, 2, 48, top_h=5, body_h=13)
    cabinet_doors(d, 0, 2, 48, 5, 13, 4)
    save(img, "cabinet_lower_run")


def cabinet_upper_run():
    # wall cabinets: mahogany doors, no cream top
    img, d = canvas(48, 14)
    rect(d, 0, 0, 48, 14, MAHOG)
    rect(d, 0, 0, 48, 1, MAHOG_HI)
    rect(d, 0, 13, 48, 1, MAHOG_LO)
    dw = 12
    for i in range(4):
        dx = i * dw
        rect(d, dx + 1, 2, dw - 2, 10, MAHOG_HI)
        rect(d, dx + 2, 3, dw - 4, 8, MAHOG)
        rect(d, dx + dw - 4, 7, 2, 2, CREAM_LO)
    save(img, "cabinet_upper_run")


def counter_corner_L():
    img, d = canvas(24, 22)
    # L shape: horizontal arm + vertical arm
    counter_block(d, 0, 0, 24, top_h=5, body_h=6)
    # vertical arm below-left
    rect(d, 0, 5, 12, 17, MAHOG)
    rect(d, 0, 5, 12, 5, CREAM)       # continued top
    rect(d, 0, 5, 12, 1, CREAM_HI)
    rect(d, 0, 9, 12, 1, CREAM_LO)
    rect(d, 0, 10, 12, 12, MAHOG)
    rect(d, 0, 10, 12, 1, MAHOG_HI)
    cabinet_doors(d, 0, 5, 12, 5, 12, 1)
    save(img, "counter_corner_L")


def _sink_basin(d, x, y, w, h):
    rect(d, x, y, w, h, STEEL_LO)
    rect(d, x + 1, y + 1, w - 2, h - 2, STEEL)
    rect(d, x + 1, y + 1, w - 2, 1, STEEL_HI)


def counter_single_sink():
    img, d = canvas(28, 20)
    counter_block(d, 0, 2, 28, top_h=6, body_h=12)
    _sink_basin(d, 8, 4, 12, 3)
    # faucet
    rect(d, 13, 2, 2, 2, STEEL_HI)
    rect(d, 13, 3, 4, 1, STEEL_HI)
    cabinet_doors(d, 0, 2, 28, 6, 12, 2)
    save(img, "counter_single_sink")


def counter_double_sink():
    img, d = canvas(40, 20)
    counter_block(d, 0, 2, 40, top_h=6, body_h=12)
    _sink_basin(d, 6, 4, 12, 3)
    _sink_basin(d, 22, 4, 12, 3)
    rect(d, 19, 1, 2, 3, STEEL_HI)   # faucet
    rect(d, 19, 1, 4, 1, STEEL_HI)
    cabinet_doors(d, 0, 2, 40, 6, 12, 3)
    save(img, "counter_double_sink")


# ---- appliances -----------------------------------------------------------

def fridge():
    img, d = canvas(20, 34)
    rect(d, 0, 0, 20, 4, STEEL_HI)          # top cap depth
    rect(d, 0, 4, 20, 30, STEEL)
    rect(d, 0, 4, 2, 30, STEEL_HI)          # left highlight
    rect(d, 18, 4, 2, 30, STEEL_LO)         # right shade
    rect(d, 2, 14, 16, 1, STEEL_DK)         # door split
    rect(d, 15, 8, 2, 5, STEEL_DK)          # upper handle
    rect(d, 15, 17, 2, 5, STEEL_DK)         # lower handle
    save(img, "fridge")


def dishwasher():
    img, d = canvas(18, 18)
    rect(d, 0, 0, 18, 4, STEEL)             # under-counter top
    rect(d, 0, 4, 18, 14, STEEL_LO)
    rect(d, 1, 5, 16, 12, STEEL)
    rect(d, 1, 5, 16, 2, STEEL_DK)          # control strip
    rect(d, 3, 5, 2, 2, AMBER)              # indicator light
    rect(d, 6, 8, 6, 1, STEEL_HI)           # handle
    save(img, "dishwasher")


def stove_range():
    img, d = canvas(40, 20)
    rect(d, 0, 0, 40, 8, STEEL_LO)          # cooktop surface (top-down)
    rect(d, 0, 0, 40, 1, STEEL_HI)
    for gx in range(2):
        for gy in range(3):
            cx = 6 + gy * 11
            cy = 1 + gx * 4
            rect(d, cx, cy, 8, 3, BLACK)     # burner
            rect(d, cx + 2, cy + 1, 4, 1, STEEL_DK)
    rect(d, 0, 8, 40, 12, STEEL)            # oven front
    rect(d, 2, 10, 36, 3, STEEL_DK)         # control panel
    for k in range(6):
        rect(d, 4 + k * 6, 11, 2, 1, STEEL_HI)  # knobs
    rect(d, 4, 14, 15, 5, STEEL_LO)         # oven door L
    rect(d, 21, 14, 15, 5, STEEL_LO)        # oven door R
    rect(d, 6, 15, 11, 1, STEEL_HI)         # handles
    rect(d, 23, 15, 11, 1, STEEL_HI)
    save(img, "stove_range")


def extractor_hood():
    img, d = canvas(24, 14)
    rect(d, 8, 0, 8, 5, STEEL_LO)           # vent stack
    rect(d, 8, 0, 8, 1, STEEL_HI)
    d.polygon([  # trapezoid hood
        (0 * S, 13 * S), (24 * S, 13 * S), (18 * S, 5 * S), (6 * S, 5 * S)
    ], fill=STEEL)
    rect(d, 0, 12, 24, 2, STEEL_LO)
    rect(d, 4, 6, 16, 1, STEEL_HI)
    save(img, "extractor_hood")


# ---- storage --------------------------------------------------------------

def shelf_metal():
    img, d = canvas(16, 20)
    for sy in (2, 9, 16):
        rect(d, 0, sy, 16, 1, STEEL_HI)
        rect(d, 0, sy + 1, 16, 1, STEEL_LO)
    rect(d, 0, 0, 1, 20, STEEL_LO)
    rect(d, 15, 0, 1, 20, STEEL_LO)
    # jars
    rect(d, 3, 5, 3, 4, AMBER)
    rect(d, 9, 5, 3, 4, TERRA)
    rect(d, 5, 12, 3, 4, GLASS)
    save(img, "shelf_metal")


def shelf_wood():
    img, d = canvas(16, 20)
    for sy in (2, 10, 17):
        rect(d, 0, sy, 16, 2, MAHOG_HI)
        rect(d, 0, sy + 1, 16, 1, MAHOG_LO)
    rect(d, 0, 0, 1, 20, MAHOG)
    rect(d, 15, 0, 1, 20, MAHOG)
    rect(d, 3, 5, 3, 4, CREAM)
    rect(d, 9, 5, 3, 4, TERRA)
    save(img, "shelf_wood")


def spice_rack():
    img, d = canvas(16, 16)
    rect(d, 0, 0, 16, 16, MAHOG)
    rect(d, 0, 0, 16, 1, MAHOG_HI)
    for sy in (2, 8):
        for sx in range(4):
            jx = 1 + sx * 4
            rect(d, jx, sy + 1, 3, 5, (AMBER if sx % 2 else TERRA))
            rect(d, jx, sy + 1, 3, 1, CREAM_LO)
        rect(d, 0, sy + 6, 16, 1, MAHOG_LO)
    save(img, "spice_rack")


def utensil_rack():
    img, d = canvas(20, 10)
    rect(d, 0, 1, 20, 1, MAHOG)             # rail
    for i, c in enumerate((STEEL, MAHOG_HI, STEEL_HI, MAHOG_HI)):
        ux = 3 + i * 4
        rect(d, ux, 2, 1, 6, c)             # hanging utensil
        rect(d, ux - 1, 6, 3, 2, c)
    save(img, "utensil_rack")


# ---- PRD gadget widgets ---------------------------------------------------

def distillery_tube():
    # PRD widget_distillery_tube — glass condenser + beaker (static art; the
    # v2 app also renders a live CSS fill on top of this).
    img, d = canvas(16, 40)
    rect(d, 6, 2, 4, 22, GLASS)             # vertical tube
    rect(d, 6, 2, 1, 22, GLASS_HI)
    for cy in range(24, 32, 2):             # coil
        rect(d, 4, cy, 8, 1, GLASS)
    rect(d, 3, 32, 10, 6, GLASS)            # beaker
    rect(d, 3, 32, 1, 6, GLASS_HI)
    rect(d, 4, 35, 8, 3, AMBER)             # collected fluid
    save(img, "distillery_tube")


def desk_clock():
    img, d = canvas(16, 16)
    rect(d, 1, 2, 14, 12, MAHOG)            # case
    rect(d, 1, 2, 14, 1, MAHOG_HI)
    d.polygon([(1 * S, 2 * S), (15 * S, 2 * S), (8 * S, 0)], fill=MAHOG_HI)  # pediment
    rect(d, 4, 5, 8, 7, CREAM)             # face
    rect(d, 7, 6, 1, 3, MAHOG_LO)          # hands
    rect(d, 8, 8, 2, 1, MAHOG_LO)
    rect(d, 4, 13, 8, 1, MAHOG_LO)
    save(img, "desk_clock")


# ---- manifest -------------------------------------------------------------

SPRITES = [
    ("floor_checker", floor_checker), ("floor_terracotta", floor_terracotta),
    ("floor_stone", floor_stone), ("floor_wood", floor_wood),
    ("wall_wood_panel", wall_wood_panel), ("wall_plaster", wall_plaster),
    ("cabinet_upper_run", cabinet_upper_run), ("cabinet_lower_run", cabinet_lower_run),
    ("counter_corner_L", counter_corner_L),
    ("counter_single_sink", counter_single_sink),
    ("counter_double_sink", counter_double_sink),
    ("fridge", fridge), ("dishwasher", dishwasher),
    ("stove_range", stove_range), ("extractor_hood", extractor_hood),
    ("shelf_metal", shelf_metal), ("shelf_wood", shelf_wood),
    ("spice_rack", spice_rack), ("utensil_rack", utensil_rack),
    ("distillery_tube", distillery_tube), ("desk_clock", desk_clock),
]

if __name__ == "__main__":
    manifest = {
        "note": "v2 tileset — cohesive 3/4 top-down pixel art authored in the new "
                "reference sheet's style, on the PRD-locked palette (mahogany "
                "#4A2C11, cream #F2E3D5, steel #8C969E, terracotta #B86536, walnut "
                "#361F0A). Drawn at 4x the logical grid; CSS renders pixelated.",
        "sprites": [],
    }
    for sid, fn in SPRITES:
        fn()
        im = Image.open(os.path.join(OUT_DIR, sid + ".png"))
        manifest["sprites"].append({
            "id": sid,
            "file": f"assets/tiles_v2/{sid}.png",
            "px": {"w": im.width // S, "h": im.height // S},
        })
    with open(os.path.join(ROOT, "data", "tiles_v2.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"wrote {len(SPRITES)} sprites to assets/tiles_v2/ and data/tiles_v2.json")
