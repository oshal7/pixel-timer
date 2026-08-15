#!/usr/bin/env python3
"""
Author an ingredient list + tier + time band for every dish, constrained to the
50 pantry ingredients. Output: data/dishes_v3.json — fully editable by hand.

The chef in v3 gathers EXACTLY the ingredients listed here for the chosen dish.
Variants ("… Bowl/Plate/Cup/Skewers/Wrap/Platter/Slice") inherit their base
dish. "Chef's Surprise #n" get a stable pseudo-random handful.
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

AVAILABLE = set(json.load(open(os.path.join(ROOT, "data", "ingredients.json")))
                ["sprites"] and [s["id"] for s in json.load(open(os.path.join(ROOT, "data", "ingredients.json")))["sprites"]])

# base dish name -> ingredient ids (from the 50-item pantry)
EXPLICIT = {
    # tier 1 — quick / drinks
    "tea": ["lemon", "sugar"], "coffee": ["milk", "sugar"], "orange juice": ["orange"],
    "toast": ["bread", "butter"], "banana": ["banana"], "apple slices": ["apple"],
    "cheese slices": ["cheese"], "hard-boiled egg": ["eggs"], "cereal": ["milk", "sugar"],
    "yogurt": ["milk", "blueberry"], "gelato": ["milk", "sugar", "vanilla"],
    "bubble tea": ["milk", "sugar"], "fruit": ["apple", "banana", "grapes"],
    "fruit salad": ["apple", "strawberry", "orange", "banana"],
    # tier 2 — light meals / snacks
    "grilled cheese": ["bread", "cheese", "butter"], "omelette": ["eggs", "cheese", "pepper"],
    "pretzel": ["flour", "yeast", "salt"], "bagel": ["flour", "yeast"],
    "miso soup": ["soy_sauce", "mushroom", "onion"], "french fries": ["potato", "salt"],
    "hot dog": ["bread", "sausage"], "pita & hummus": ["bread", "olive_oil", "garlic"],
    "hummus": ["bread", "olive_oil", "garlic"], "croissant": ["flour", "butter", "yeast"],
    "mochi": ["rice", "sugar"], "onigiri": ["rice", "fish"],
    "churros": ["flour", "sugar", "cinnamon"], "instant ramen": ["pasta", "soy_sauce", "onion"],
    "pizza": ["dough", "tomato", "cheese", "basil"], "takoyaki": ["flour", "fish", "eggs"],
    "caprese salad": ["tomato", "cheese", "basil", "olive_oil"],
    "greek salad": ["tomato", "cheese", "onion", "olive_oil", "bell_pepper"],
    "bao buns": ["flour", "pork_chop", "yeast"],
    # tier 3 — standard entrees
    "taco": ["ground_beef", "cheese", "tomato", "onion"],
    "dim sum": ["pork_chop", "flour", "ginger"], "mac & cheese": ["pasta", "cheese", "milk", "butter"],
    "gyro": ["chicken", "bread", "onion", "tomato"], "arepas": ["corn", "cheese"],
    "kung pao chicken": ["chicken", "chili", "peppercorns", "bell_pepper"],
    "enchiladas": ["chicken", "tomato", "cheese", "chili"],
    "pelmeni": ["flour", "ground_beef", "onion"], "poutine": ["potato", "cheese"],
    "pad thai": ["pasta", "eggs", "chicken", "soy_sauce"],
    "falafel": ["bread", "garlic", "onion", "parsley"],
    "kebab": ["chicken", "bell_pepper", "onion"], "satay skewers": ["chicken", "garlic", "chili"],
    "adobo": ["chicken", "soy_sauce", "garlic", "bay_leaf"],
    "bulgogi": ["ground_beef", "soy_sauce", "garlic", "onion"],
    "tom yum": ["chili", "ginger", "mushroom", "lime"],
    "laksa": ["pasta", "chili", "fish", "ginger"],
    "ramen": ["pasta", "soy_sauce", "eggs", "onion"],
    "shakshuka": ["eggs", "tomato", "bell_pepper", "onion", "garlic"],
    "pesto pasta": ["pasta", "basil", "garlic", "olive_oil", "cheese"],
    "sushi platter": ["rice", "fish", "soy_sauce"],
    "chicken": ["chicken", "rice", "onion"], "baklava": ["flour", "sugar", "butter", "cinnamon"],
    "gyoza": ["pork_chop", "flour", "ginger"], "sauerkraut & sausage": ["sausage", "onion", "potato"],
    # tier 4 — gourmet feasts
    "biryani": ["rice", "chicken", "saffron", "onion", "ginger", "garlic"],
    "fish & chips": ["fish", "potato", "flour", "lemon"],
    "lasagna": ["pasta", "ground_beef", "tomato", "cheese", "onion", "garlic"],
    "seafood paella": ["rice", "fish", "saffron", "bell_pepper", "onion", "garlic"],
    "paella valenciana": ["rice", "chicken", "saffron", "bell_pepper", "tomato"],
    "spaghetti bolognese": ["pasta", "ground_beef", "tomato", "onion", "garlic"],
    "roast chicken": ["chicken", "potato", "rosemary", "garlic", "butter"],
    "butter chicken curry": ["chicken", "butter", "tomato", "milk", "ginger", "garlic"],
    "korma curry": ["chicken", "milk", "ginger", "garlic", "saffron"],
    "borscht": ["carrot", "onion", "potato", "tomato"],
    "pho bo": ["pasta", "ground_beef", "ginger", "onion", "star_anise"],
    "pho": ["pasta", "chicken", "ginger", "onion", "star_anise"],
    "mulligatawny": ["chicken", "carrot", "onion", "rice", "ginger"],
    "gumbo": ["sausage", "fish", "bell_pepper", "onion", "rice"],
    "jumbalaya": ["sausage", "chicken", "rice", "bell_pepper", "tomato"],
    "peking duck": ["chicken", "soy_sauce", "ginger", "onion"],
    "mussel": ["fish", "garlic", "butter", "parsley"],
    "cassoulet": ["sausage", "pork_chop", "bacon", "onion", "thyme"],
    "ratatouille": ["tomato", "bell_pepper", "mushroom", "onion", "garlic", "olive_oil"],
}

KEYWORDS = [
    ("chicken", ["chicken"]), ("beef", ["ground_beef"]), ("pork", ["pork_chop"]),
    ("bacon", ["bacon"]), ("sausage", ["sausage"]), ("duck", ["chicken"]),
    ("fish", ["fish"]), ("seafood", ["fish"]), ("sushi", ["rice", "fish"]),
    ("rice", ["rice"]), ("spaghetti", ["pasta", "tomato"]), ("pasta", ["pasta"]),
    ("noodle", ["pasta"]), ("cheese", ["cheese"]), ("egg", ["eggs"]),
    ("tomato", ["tomato"]), ("fries", ["potato"]), ("chips", ["potato"]),
    ("potato", ["potato"]), ("toast", ["bread"]), ("bun", ["bread"]),
    ("bagel", ["bread"]), ("bread", ["bread"]), ("salad", ["tomato", "onion", "olive_oil"]),
    ("soup", ["onion", "carrot"]), ("curry", ["ginger", "garlic", "onion"]),
    ("tea", ["sugar"]), ("coffee", ["milk", "sugar"]), ("fruit", ["apple", "banana"]),
    ("pizza", ["dough", "tomato", "cheese"]), ("cake", ["flour", "sugar", "eggs"]),
]

SUFFIXES = ["bowl", "plate", "cup", "skewers", "skewer", "wrap", "platter", "slice", "slices", "#1", "#2"]

def normalize(label):
    s = label.lower().strip()
    s = re.sub(r"chef's surprise\s*#?\d*", "chefs surprise", s)
    for suf in ["bowl", "plate", "cup", "skewers", "skewer", "wrap", "platter", "slice", "slices"]:
        if s.endswith(" " + suf):
            s = s[: -(len(suf) + 1)].strip()
    return s

def tier_and_time(n_ing):
    if n_ing <= 2: return 1, [5, 10]
    if n_ing == 3: return 2, [15, 20]
    if n_ing == 4: return 3, [25, 35]
    return 4, [45, 75]

def resolve(label):
    raw = re.sub(r"chef's surprise\s*#?\d*", "chefs surprise", label.lower().strip())
    if raw == "chefs surprise":
        # stable handful from the label hash
        h = sum(ord(c) for c in label)
        pool = sorted(AVAILABLE)
        pick = [pool[(h + i * 13) % len(pool)] for i in range(3)]
        return list(dict.fromkeys(pick))
    # full name first (so "Apple Slices", "Satay Skewers", "Sushi Platter" match)
    if raw in EXPLICIT:
        return EXPLICIT[raw]
    norm = normalize(label)
    if norm in EXPLICIT:
        return EXPLICIT[norm]
    # base-dish prefix (e.g. a variant that starts with a known base)
    for key in EXPLICIT:
        if norm.startswith(key) or raw.startswith(key):
            return EXPLICIT[key]
    # keyword fallback
    found = []
    for kw, ings in KEYWORDS:
        if kw in norm:
            found += ings
    found = list(dict.fromkeys(found))
    return found or ["salt"]

def build():
    recipes = json.load(open(os.path.join(ROOT, "data", "recipes.json")))["sprites"]
    dishes = []
    fell_back = []
    for r in recipes:
        ings = [i for i in resolve(r["label"]) if i in AVAILABLE]
        ings = list(dict.fromkeys(ings)) or ["salt"]
        tier, trange = tier_and_time(len(ings))
        dishes.append({
            "id": r["id"], "name": r["label"], "tier": tier,
            "minutes": trange, "ingredients": ings,
        })
        if normalize(r["label"]) not in EXPLICIT and "surprise" not in r["label"].lower():
            fell_back.append(r["label"])
    out = {
        "_readme": "Per-dish ingredient lists (ids from the 50-item pantry). The v3 "
                   "chef gathers exactly these. Edit freely: change 'ingredients', "
                   "'tier' (1-4) or 'minutes' [min,max]. 'tier' controls which dishes "
                   "a chosen focus length can produce.",
        "dishes": dishes,
    }
    json.dump(out, open(os.path.join(ROOT, "data", "dishes_v3.json"), "w"), indent=2)
    by_tier = {}
    for d in dishes: by_tier[d["tier"]] = by_tier.get(d["tier"], 0) + 1
    print(f"{len(dishes)} dishes | by tier {by_tier}")
    if fell_back:
        print(f"keyword-fallback ({len(fell_back)}):", ", ".join(fell_back))

if __name__ == "__main__":
    build()
