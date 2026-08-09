// ---------------------------------------------------------------------------
// Focus Kitchen v2 — data-driven pixel kitchen timer
//
// v2 duplicates the original experience and layers on PRD/storyboard features:
//   • 4-sided Border Pantry with ingredient depletion + persistence
//   • Duration -> dish-tier recipe selection (no longer random)
//   • Distillery-tube fluid gauge + mantel-clock HUD during cooking
//   • Chef walks to the pantry to gather, then preps -> chops -> stirs
//   • Focus stats + day streak, a burnt-dish fail state, and ambient audio
//
// Sprite geometry still comes from data/*.json (measured from the source
// reference sheets). v2 reuses the shared chef / ingredient / recipe art under
// ../assets and ../data; only the environment tiles are v2-local (data/tiles.json).
// ---------------------------------------------------------------------------

const K = {
  unlocked: 'focus-kitchen-v2-unlocked-recipes',
  session:  'focus-kitchen-v2-session',
  pantry:   'focus-kitchen-v2-pantry',
  stats:    'focus-kitchen-v2-stats',
  muted:    'focus-kitchen-v2-muted',
};

// Duration -> dish tier. recipes.json is a 10x12 grid whose rows trend
// simple -> complex, so each tier maps to a band of rows.
const TIERS = [
  { id: 1, name: 'Quick Prep & Drinks',    maxMin: 12,       rows: [0, 1],    ingredients: 1 },
  { id: 2, name: 'Light Meals & Snacks',   maxMin: 30,       rows: [2, 3, 4], ingredients: 2 },
  { id: 3, name: 'Standard Entrées',       maxMin: 45,       rows: [5, 6, 7], ingredients: 3 },
  { id: 4, name: 'Gourmet Feasts',         maxMin: Infinity, rows: [8, 9],    ingredients: 5 },
];
function tierForMinutes(min) {
  return TIERS.find(t => min <= t.maxMin) || TIERS[TIERS.length - 1];
}

const state = {
  data: { ingredients: null, tiles: null, chef: null, recipes: null },
  unlocked: loadJSONSet(K.unlocked),
  pantry: {},
  stats: null,
  muted: localStorage.getItem(K.muted) === '1',
  timer: { totalMs: 0, endAt: 0, tickHandle: null, introTimers: [], introDone: false, paused: false, remainingAtPauseMs: 0 },
  pending: { recipe: null, ingredientIds: [] }, // dish being cooked this session
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------
function loadJSONSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveUnlocked() { localStorage.setItem(K.unlocked, JSON.stringify([...state.unlocked])); }

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(K.stats)) ||
      { totalFocusMinutes: 0, completedSessions: 0, streakDays: 0, lastCompletedDate: null };
  } catch {
    return { totalFocusMinutes: 0, completedSessions: 0, streakDays: 0, lastCompletedDate: null };
  }
}
function saveStats() { localStorage.setItem(K.stats, JSON.stringify(state.stats)); }

function loadPantry() {
  try { return JSON.parse(localStorage.getItem(K.pantry)) || {}; } catch { return {}; }
}
function savePantry() { localStorage.setItem(K.pantry, JSON.stringify(state.pantry)); }
function isAvailable(id) { return !state.pantry[id] || state.pantry[id].status === 'AVAILABLE'; }

function saveSession() {
  const t = state.timer;
  if (!t.totalMs) { localStorage.removeItem(K.session); return; }
  localStorage.setItem(K.session, JSON.stringify({
    totalMs: t.totalMs,
    endAt: t.paused ? null : t.endAt,
    paused: t.paused,
    remainingAtPauseMs: t.remainingAtPauseMs,
    pending: state.pending,
  }));
}
function clearSession() { localStorage.removeItem(K.session); }
function loadSession() { try { return JSON.parse(localStorage.getItem(K.session)); } catch { return null; } }

// ---------------------------------------------------------------------------
// Data loading — shared art lives one level up, so its file paths get ../
// ---------------------------------------------------------------------------
async function loadData() {
  const [ingredients, tiles, chef, recipes] = await Promise.all([
    fetch('../data/ingredients.json').then(r => r.json()),
    fetch('data/tiles.json').then(r => r.json()),
    fetch('../data/chef_animations.json').then(r => r.json()),
    fetch('../data/recipes.json').then(r => r.json()),
  ]);
  ingredients.sprites.forEach(s => { s.file = '../' + s.file; });
  recipes.sprites.forEach(s => { s.file = '../' + s.file; });
  for (const name in chef.sections) chef.sections[name].frames.forEach(f => { f.file = '../' + f.file; });
  state.data = { ingredients, tiles, chef, recipes };
}
function tileById(id) { return state.data.tiles.sprites.find(s => s.id === id); }

// ---------------------------------------------------------------------------
// Animator: cycles an <img> through a named animation section's frames
// ---------------------------------------------------------------------------
class Animator {
  constructor(imgEl, sections) {
    this.img = imgEl; this.sections = sections;
    this.handle = null; this.frameIndex = 0; this.current = null; this.onComplete = null;
  }
  play(name, { onComplete } = {}) {
    this.stop();
    const section = this.sections[name];
    if (!section) return;
    const isSwitch = this.current !== null && this.current !== name;
    this.current = name; this.frameIndex = 0; this.onComplete = onComplete || null;
    const start = () => {
      this._render(section); this.img.style.opacity = '1';
      this.handle = setInterval(() => this._advance(section), section.frame_ms);
    };
    if (isSwitch) { this.img.style.opacity = '0'; setTimeout(start, 160); } else { start(); }
  }
  _advance(section) {
    this.frameIndex++;
    if (this.frameIndex >= section.frames.length) {
      if (section.loop) { this.frameIndex = 0; }
      else {
        this.frameIndex = section.frames.length - 1; this._render(section);
        this.stop(); if (this.onComplete) this.onComplete(); return;
      }
    }
    this._render(section);
  }
  _render(section) { this.img.src = section.frames[this.frameIndex].file; }
  stop() { if (this.handle) { clearInterval(this.handle); this.handle = null; } }
}

// ---------------------------------------------------------------------------
// Scene composition — layered kitchen inside the border-pantry frame
// ---------------------------------------------------------------------------
function composeKitchenScene(container) {
  container.innerHTML = '';
  const t = id => { const s = tileById(id); return s ? s.file : ''; };

  container.style.backgroundImage = `url(${t('floor_tile_stone')})`;
  container.style.backgroundSize = '84px 84px';
  container.style.backgroundRepeat = 'repeat';

  const floor = document.createElement('div');
  floor.className = 'scene-layer';
  Object.assign(floor.style, {
    left: 0, right: 0, bottom: 0, height: '40%', zIndex: '0',
    backgroundImage: `url(${t('floor_tile_tan')})`, backgroundSize: '84px 92px', backgroundRepeat: 'repeat',
  });
  container.appendChild(floor);

  const layers = [
    { id: 'cabinet_upper_run', style: { left: '3%',  top: '2%',  width: '50%', zIndex: 2 } },
    { id: 'extractor_hood',    style: { left: '19%', top: '12%', width: '17%', zIndex: 3 } },
    { id: 'fridge',            style: { right: '4%', top: '3%',  width: '15%', zIndex: 2 } },
    { id: 'cabinet_lower_run', style: { left: '3%',  top: '38%', width: '60%', zIndex: 2 } },
    { id: 'counter_double_sink', style: { right: '5%', top: '44%', width: '26%', zIndex: 3 } },
    { id: 'stove_range',       style: { left: '8%',  top: '36%', width: '33%', zIndex: 3 } },
  ];
  for (const layer of layers) {
    const tile = tileById(layer.id);
    if (!tile) continue;
    const img = document.createElement('img');
    img.className = 'scene-layer';
    img.src = tile.file;
    Object.assign(img.style, { position: 'absolute', height: 'auto', ...layer.style, zIndex: String(layer.style.zIndex) });
    container.appendChild(img);
  }
}

function placeChef(container, anchor, imgId) {
  const img = document.createElement('img');
  img.id = imgId; img.className = 'chef-sprite scene-layer';
  Object.assign(img.style, { position: 'absolute', height: 'auto', transition: 'left 1.1s ease, top 1.1s ease', ...anchor });
  container.appendChild(img);
  return img;
}

// ---------------------------------------------------------------------------
// Border pantry — 4-sided ingredient frame with depletion
// ---------------------------------------------------------------------------
const PANTRY_LAYOUT = { top: 12, bottom: 12, left: 6, right: 6 }; // items per side
function pantrySidesFor(prefix) {
  return {
    top: document.getElementById(`${prefix}pantry-top`),
    bottom: document.getElementById(`${prefix}pantry-bottom`),
    left: document.getElementById(`${prefix}pantry-left`),
    right: document.getElementById(`${prefix}pantry-right`),
  };
}
function renderPantry(prefix = '') {
  const sprites = state.data.ingredients.sprites;
  const sides = pantrySidesFor(prefix);
  let i = 0;
  for (const [side, count] of Object.entries(PANTRY_LAYOUT)) {
    const el = sides[side];
    if (!el) continue;
    el.innerHTML = '';
    for (let n = 0; n < count; n++) {
      const s = sprites[i % sprites.length]; i++;
      const img = document.createElement('img');
      img.className = 'pantry-item' + (isAvailable(s.id) ? '' : ' spent');
      img.src = s.file; img.alt = s.label; img.title = s.label;
      img.dataset.ing = s.id;
      el.appendChild(img);
    }
  }
}
function refreshAllPantries() { renderPantry(''); renderPantry('cook-'); }

function flashGathering(ids, prefix = 'cook-') {
  document.querySelectorAll(`#${prefix}pantry-top .pantry-item, #${prefix}pantry-bottom .pantry-item, #${prefix}pantry-left .pantry-item, #${prefix}pantry-right .pantry-item`)
    .forEach(el => { if (ids.includes(el.dataset.ing)) el.classList.add('gathering'); });
  setTimeout(() => document.querySelectorAll('.pantry-item.gathering').forEach(el => el.classList.remove('gathering')), 2000);
}

function resetPantry() {
  state.pantry = {};
  savePantry();
  refreshAllPantries();
}

// ---------------------------------------------------------------------------
// Recipe selection by tier + synthesized ingredient requirements
// ---------------------------------------------------------------------------
function recipeRow(r) { return Number(r.id.split('_')[1]); }

// Deterministic per-recipe ingredient requirement (source data has no explicit
// recipe->ingredient map, so we derive a stable set from the recipe id).
function requiredIngredientsFor(recipe, tier) {
  const ings = state.data.ingredients.sprites;
  let h = 0;
  for (const ch of recipe.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const picks = [];
  for (let k = 0; k < tier.ingredients; k++) {
    h = (h * 1103515245 + 12345) >>> 0;
    picks.push(ings[(h + k * 7) % ings.length].id);
  }
  return [...new Set(picks)];
}

function chooseRecipeForMinutes(minutes) {
  const tier = tierForMinutes(minutes);
  const inBand = state.data.recipes.sprites.filter(r => tier.rows.includes(recipeRow(r)));
  // Prefer dishes whose required ingredients are all still available in the pantry.
  const withReqs = inBand.map(r => ({ r, req: requiredIngredientsFor(r, tier) }));
  const cookable = withReqs.filter(x => x.req.every(isAvailable));
  const pool = cookable.length ? cookable : withReqs;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { recipe: pick.r, ingredientIds: pick.req, tier };
}

// ---------------------------------------------------------------------------
// Audio — synthesized SFX bank + optional cozy pad BGM
// ---------------------------------------------------------------------------
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function tone(freq, start, dur, { type = 'sine', gain = 0.15, sweepTo = null } = {}) {
  if (state.muted) return;
  try {
    const c = ctx(), t0 = c.currentTime + start;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch { /* audio unavailable */ }
}
const SFX = {
  click:   () => tone(420, 0, 0.08, { type: 'triangle', gain: 0.08 }),
  gather:  () => tone(660, 0, 0.12, { type: 'sine', gain: 0.1, sweepTo: 990 }),
  chop:    () => { tone(180, 0, 0.05, { type: 'square', gain: 0.06 }); },
  drip:    () => tone(1200, 0, 0.14, { type: 'sine', gain: 0.06, sweepTo: 700 }),
  complete:() => { [880, 1174.66, 1567.98].forEach((f, i) => tone(f, i * 0.14, 0.5, { gain: 0.18 })); },
  unlock:  () => { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, i * 0.08, 0.3, { type: 'triangle', gain: 0.12 })); },
  fail:    () => { tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.12, sweepTo: 70 }); },
};

// Cozy ambient pad BGM (very soft, seamless). Synth so no audio asset is needed.
let bgmNodes = null;
function startBGM() {
  if (state.muted || bgmNodes) return;
  try {
    const c = ctx(), master = c.createGain();
    master.gain.value = 0.04; master.connect(c.destination);
    const freqs = [130.81, 196.0, 261.63]; // C3 / G3 / C4 warm triad
    const oscs = freqs.map(f => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = 0.5; o.connect(g).connect(master); o.start();
      // slow shimmer
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.08 + Math.random() * 0.05; lg.gain.value = 0.25;
      lfo.connect(lg).connect(g.gain); lfo.start();
      return { o, lfo };
    });
    bgmNodes = { master, oscs };
  } catch { /* ignore */ }
}
function stopBGM() {
  if (!bgmNodes) return;
  try { bgmNodes.oscs.forEach(n => { n.o.stop(); n.lfo.stop(); }); } catch {}
  bgmNodes = null;
}
function applyMute() {
  document.getElementById('mute-btn').textContent = state.muted ? '🔇' : '🔊';
  if (state.muted) stopBGM();
}

// ---------------------------------------------------------------------------
// Completion sound helpers / tab-title flash
// ---------------------------------------------------------------------------
let titleFlashHandle = null;
const originalTitle = document.title;
function startTitleFlash() {
  stopTitleFlash(); let on = false;
  titleFlashHandle = setInterval(() => { document.title = on ? originalTitle : '🍽️ Dish ready!'; on = !on; }, 1000);
}
function stopTitleFlash() {
  if (titleFlashHandle) { clearInterval(titleFlashHandle); titleFlashHandle = null; }
  document.title = originalTitle;
}

// ---------------------------------------------------------------------------
// View management
// ---------------------------------------------------------------------------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const homeish = ['home', 'setup', 'cooking', 'complete', 'fail'].includes(name);
  document.getElementById('nav-home').classList.toggle('active', homeish);
  document.getElementById('nav-book').classList.toggle('active', name === 'book');
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
let homeAnimator = null;
function initHomeScene() {
  const scene = document.getElementById('kitchen-scene');
  composeKitchenScene(scene);
  const chefImg = placeChef(scene, { left: '42%', top: '58%', width: '78px', zIndex: 4 }, 'chef-idle');
  homeAnimator = new Animator(chefImg, state.data.chef.sections);
  homeAnimator.play('idle');
}
function renderStats() {
  document.getElementById('stat-minutes').textContent = state.stats.totalFocusMinutes;
  document.getElementById('stat-sessions').textContent = state.stats.completedSessions;
  document.getElementById('stat-streak').textContent = state.stats.streakDays;
}

// ---------------------------------------------------------------------------
// Timer / cooking loop
// ---------------------------------------------------------------------------
let cookAnimator = null;

function formatMs(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 54;
function updateProgressRing(remainingFraction) {
  const bar = document.getElementById('progress-ring-bar');
  const arc = Math.max(0, Math.min(1, remainingFraction)) * RING_CIRCUMFERENCE;
  bar.style.strokeDasharray = `${arc} ${RING_CIRCUMFERENCE}`;
}

// Distillery tube + mantel clock reflect elapsed progress (0..1).
let lastDistillStep = -1;
function updateWidgets(elapsedFraction) {
  const pct = Math.max(0, Math.min(1, elapsedFraction)) * 100;
  const fluid = document.getElementById('distillery-fluid');
  const beaker = document.getElementById('distillery-beaker-fluid');
  if (fluid) fluid.style.height = pct.toFixed(1) + '%';
  if (beaker) beaker.style.height = Math.max(0, pct - 30).toFixed(1) + '%';
  const min = document.getElementById('clock-hand-min');
  const hour = document.getElementById('clock-hand-hour');
  if (min) min.style.transform = `translateX(-50%) rotate(${(elapsedFraction * 360 * 4) % 360}deg)`;
  if (hour) hour.style.transform = `translateX(-50%) rotate(${elapsedFraction * 330}deg)`;
  const step = Math.floor(elapsedFraction * 10);
  if (step !== lastDistillStep && elapsedFraction > 0.3) { SFX.drip(); lastDistillStep = step; }
}

function setStage(text) {
  const el = document.getElementById('countdown-stage');
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 200);
}

function setupCookingScene() {
  const scene = document.getElementById('cooking-scene');
  composeKitchenScene(scene);
  const chefImg = placeChef(scene, { left: '42%', top: '60%', width: '78px', zIndex: 4 }, 'chef-cook');
  cookAnimator = new Animator(chefImg, state.data.chef.sections);
  return chefImg;
}

// Chef physically walks the storyboard beat: floor -> pantry (gather) -> counter
// (chop) -> stove (stir). Movement is CSS-transitioned; animation sections are
// switched on a fixed timeline (looping sections have no onComplete).
function runIntroSequence(chefImg) {
  lastDistillStep = -1;
  document.getElementById('countdown-stage').textContent = 'The chef arrives & gathers ingredients…';
  cookAnimator.play('walking');
  chefImg.style.left = '8%'; chefImg.style.top = '66%'; // walk toward the left pantry

  state.timer.introTimers = [
    setTimeout(() => {
      setStage('Gathering from the pantry…');
      cookAnimator.play('interaction');
      SFX.gather();
      flashGathering(state.pending.ingredientIds || []);
    }, 1400),
    setTimeout(() => {
      setStage('Checking the recipe book…');
      cookAnimator.play('walking');
      chefImg.style.left = '52%'; chefImg.style.top = '62%'; // walk to the prep counter
    }, 3200),
    setTimeout(() => {
      setStage('Chopping ingredients…');
      cookAnimator.play('chopping');
      SFX.chop();
    }, 4600),
    setTimeout(() => {
      setStage('Cooking in progress…');
      cookAnimator.play('walking');
      chefImg.style.left = '18%'; chefImg.style.top = '52%'; // walk to the stove
    }, 6600),
    setTimeout(() => {
      cookAnimator.play('stirring');
      state.timer.introDone = true;
    }, 7700),
  ];
}
function clearIntroTimers() { state.timer.introTimers.forEach(clearTimeout); state.timer.introTimers = []; }

function startTicking() {
  if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
  const tick = () => {
    const remainingMs = Math.max(0, state.timer.endAt - Date.now());
    document.getElementById('countdown-readout').textContent = formatMs(remainingMs);
    const remainingFraction = remainingMs / state.timer.totalMs;
    updateProgressRing(remainingFraction);
    updateWidgets(1 - remainingFraction);
    if (remainingMs <= 0) {
      clearInterval(state.timer.tickHandle);
      clearIntroTimers(); cookAnimator.stop(); clearSession();
      finishCooking();
    }
  };
  tick();
  state.timer.tickHandle = setInterval(tick, 250);
}

function startCookingSession(minutes) {
  const { recipe, ingredientIds, tier } = chooseRecipeForMinutes(minutes);
  state.pending = { recipe: { id: recipe.id, file: recipe.file, label: recipe.label }, ingredientIds };

  state.timer.totalMs = minutes * 60 * 1000;
  state.timer.endAt = Date.now() + state.timer.totalMs;
  state.timer.paused = false; state.timer.introDone = false;
  saveSession();

  renderPantry('cook-');
  const chefImg = setupCookingScene();
  document.getElementById('cook-dish-hint').textContent = `Tier ${tier.id} · ${tier.name}`;
  runIntroSequence(chefImg);
  startTicking();
  startBGM();

  document.getElementById('pause-cook-btn').textContent = 'Pause';
  showView('cooking');
}

function restoreActiveSession(session) {
  state.timer.totalMs = session.totalMs;
  state.timer.endAt = session.endAt;
  state.timer.paused = false; state.timer.introDone = true;
  state.pending = session.pending || { recipe: null, ingredientIds: [] };

  renderPantry('cook-');
  const chefImg = setupCookingScene();
  chefImg.style.left = '18%'; chefImg.style.top = '52%';
  document.getElementById('cook-dish-hint').textContent = 'Cooking in progress…';
  document.getElementById('countdown-stage').textContent = 'Cooking in progress…';
  cookAnimator.play('stirring');
  startTicking(); startBGM();

  document.getElementById('pause-cook-btn').textContent = 'Pause';
  showView('cooking');
}

function restorePausedSession(session) {
  state.timer.totalMs = session.totalMs;
  state.timer.remainingAtPauseMs = session.remainingAtPauseMs;
  state.timer.paused = true; state.timer.introDone = true;
  state.pending = session.pending || { recipe: null, ingredientIds: [] };

  renderPantry('cook-');
  const chefImg = setupCookingScene();
  chefImg.style.left = '18%'; chefImg.style.top = '52%';
  cookAnimator.play('stirring'); cookAnimator.stop();
  document.getElementById('countdown-stage').textContent = 'Paused';
  document.getElementById('cook-dish-hint').textContent = 'Paused';
  document.getElementById('countdown-readout').textContent = formatMs(session.remainingAtPauseMs);
  const frac = session.remainingAtPauseMs / session.totalMs;
  updateProgressRing(frac); updateWidgets(1 - frac);

  document.getElementById('pause-cook-btn').textContent = 'Resume';
  showView('cooking');
}

function togglePauseCooking() {
  if (state.timer.paused) {
    state.timer.endAt = Date.now() + state.timer.remainingAtPauseMs;
    state.timer.paused = false;
    document.getElementById('pause-cook-btn').textContent = 'Pause';
    document.getElementById('countdown-stage').textContent = 'Cooking in progress…';
    cookAnimator.play('stirring'); startTicking(); startBGM();
  } else {
    state.timer.remainingAtPauseMs = Math.max(0, state.timer.endAt - Date.now());
    state.timer.paused = true; state.timer.introDone = true;
    clearIntroTimers();
    if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
    cookAnimator.stop(); stopBGM();
    document.getElementById('countdown-stage').textContent = 'Paused';
    document.getElementById('pause-cook-btn').textContent = 'Resume';
  }
  saveSession();
}

function cancelCooking() {
  if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
  clearIntroTimers();
  if (cookAnimator) cookAnimator.stop();
  stopBGM();
  state.timer.totalMs = 0;
  clearSession();
  showFailState();
}

// ---------------------------------------------------------------------------
// Completion & fail
// ---------------------------------------------------------------------------
function depleteIngredients(ids) {
  const now = new Date().toISOString();
  ids.forEach(id => { state.pantry[id] = { status: 'DISABLED', usedAt: now }; });
  savePantry();
  refreshAllPantries();
}

function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const last = state.stats.lastCompletedDate;
  if (last === today) { /* same day, streak unchanged */ }
  else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.stats.streakDays = (last === yesterday) ? state.stats.streakDays + 1 : 1;
    state.stats.lastCompletedDate = today;
  }
}

function finishCooking() {
  stopBGM();
  const pending = state.pending.recipe;
  const recipe = pending || state.data.recipes.sprites[0];
  const isNew = !state.unlocked.has(recipe.id);
  if (isNew) { state.unlocked.add(recipe.id); saveUnlocked(); }

  // Deplete the pantry ingredients this dish consumed.
  depleteIngredients(state.pending.ingredientIds || []);

  // Stats
  state.stats.totalFocusMinutes += Math.round(state.timer.totalMs / 60000);
  state.stats.completedSessions += 1;
  updateStreak();
  saveStats(); renderStats();

  document.getElementById('dish-image').src = recipe.file;
  document.getElementById('dish-name').textContent = recipe.label;
  document.getElementById('unlock-banner').classList.toggle('hidden', !isNew);
  renderUsedIngredients(state.pending.ingredientIds || []);
  updateBookBadge();

  const presentImg = document.getElementById('chef-presenting');
  new Animator(presentImg, state.data.chef.sections).play('presenting');

  SFX.complete();
  if (isNew) setTimeout(() => SFX.unlock(), 500);
  if (document.hidden) startTitleFlash();

  state.pending = { recipe: null, ingredientIds: [] };
  showView('complete');
}

function renderUsedIngredients(ids) {
  const wrap = document.getElementById('used-ingredients');
  wrap.innerHTML = '';
  if (!ids.length) return;
  const label = document.createElement('span');
  label.className = 'ui-label'; label.textContent = 'Used from pantry:';
  wrap.appendChild(label);
  ids.forEach(id => {
    const s = state.data.ingredients.sprites.find(x => x.id === id);
    if (!s) return;
    const img = document.createElement('img'); img.src = s.file; img.alt = s.label; img.title = s.label;
    wrap.appendChild(img);
  });
}

function showFailState() {
  // No dedicated STATE_FAIL sprite exists; reuse an idle frame under a
  // desaturated/darkened filter (styled via .chef-slumped) next to a smoking pot.
  const failImg = document.getElementById('chef-fail');
  failImg.src = state.data.chef.sections.idle.frames[0].file;
  SFX.fail();
  // gathered ingredients return to the pantry with no recipe credit -> nothing depleted
  state.pending = { recipe: null, ingredientIds: [] };
  showView('fail');
}

// ---------------------------------------------------------------------------
// Recipe book (grouped by tier)
// ---------------------------------------------------------------------------
function updateBookBadge() { document.getElementById('book-count').textContent = state.unlocked.size; }

function renderRecipeBook() {
  const host = document.getElementById('book-tiers');
  host.innerHTML = '';
  const all = state.data.recipes.sprites;
  for (const tier of TIERS) {
    const dishes = all.filter(r => tier.rows.includes(recipeRow(r)));
    if (!dishes.length) continue;
    const unlockedCount = dishes.filter(r => state.unlocked.has(r.id)).length;
    const head = document.createElement('div');
    head.className = 'book-tier-head';
    head.innerHTML = `Tier ${tier.id} · ${tier.name} <small>${unlockedCount}/${dishes.length}</small>`;
    host.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const r of dishes) {
      const unlocked = state.unlocked.has(r.id);
      const card = document.createElement('div');
      card.className = 'recipe-card' + (unlocked ? '' : ' locked');
      const img = document.createElement('img'); img.src = r.file; img.alt = unlocked ? r.label : 'locked recipe';
      const name = document.createElement('div'); name.className = 'rname'; name.textContent = unlocked ? r.label : '???';
      card.appendChild(img); card.appendChild(name); grid.appendChild(card);
    }
    host.appendChild(grid);
  }
  document.getElementById('collection-complete').classList.toggle('hidden', state.unlocked.size < all.length);
}

function resetProgress() {
  state.unlocked = new Set(); saveUnlocked();
  updateBookBadge(); renderRecipeBook();
}

// ---------------------------------------------------------------------------
// Duration dial wiring
// ---------------------------------------------------------------------------
let selectedMinutes = 25;
const DIAL_MAX_MINUTES = 180;

function updateTierPreview(minutes) {
  const tier = tierForMinutes(minutes);
  document.getElementById('tier-preview').textContent = `Tier ${tier.id} · ${tier.name}`;
}
function setDialMinutes(minutes, { deselectPresets = false } = {}) {
  selectedMinutes = minutes;
  document.getElementById('dial-readout').textContent = `${String(minutes).padStart(2, '0')}:00`;
  const angle = Math.min(minutes, DIAL_MAX_MINUTES) / DIAL_MAX_MINUTES * 360;
  document.getElementById('dial-hand').style.transform = `translateX(-50%) rotate(${angle}deg)`;
  updateTierPreview(minutes);
  if (deselectPresets) document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
}

function wireSetupView() {
  const buttons = document.querySelectorAll('.duration-btn');
  const customRange = document.getElementById('custom-range');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      SFX.click();
      buttons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (btn.dataset.min === 'custom') { customRange.classList.remove('hidden'); setDialMinutes(Number(customRange.value)); }
      else { customRange.classList.add('hidden'); setDialMinutes(Number(btn.dataset.min)); }
    });
  });
  customRange.addEventListener('input', () => setDialMinutes(Number(customRange.value)));

  const dial = document.getElementById('dial');
  let dragging = false;
  const minutesFromEvent = evt => {
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = evt.clientX - cx, dy = evt.clientY - cy;
    let angle = Math.atan2(-dx, dy) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return Math.max(1, Math.round(angle / 360 * DIAL_MAX_MINUTES));
  };
  dial.addEventListener('pointerdown', evt => {
    dragging = true; dial.setPointerCapture(evt.pointerId);
    customRange.classList.remove('hidden');
    const minutes = minutesFromEvent(evt);
    customRange.value = Math.min(minutes, Number(customRange.max));
    setDialMinutes(minutes, { deselectPresets: true });
  });
  dial.addEventListener('pointermove', evt => {
    if (!dragging) return;
    const minutes = minutesFromEvent(evt);
    customRange.value = Math.min(minutes, Number(customRange.max));
    setDialMinutes(minutes, { deselectPresets: true });
  });
  dial.addEventListener('pointerup', () => { dragging = false; });
  dial.addEventListener('pointercancel', () => { dragging = false; });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  await loadData();
  state.pantry = loadPantry();
  state.stats = loadStats();

  initHomeScene();
  renderPantry('');
  renderStats();
  wireSetupView();
  updateBookBadge();
  setDialMinutes(25);
  applyMute();

  document.getElementById('start-cooking-btn').addEventListener('click', () => { SFX.click(); showView('setup'); });
  document.getElementById('back-to-home').addEventListener('click', () => showView('home'));
  document.getElementById('begin-timer-btn').addEventListener('click', () => { SFX.click(); startCookingSession(selectedMinutes); });
  document.getElementById('pause-cook-btn').addEventListener('click', togglePauseCooking);
  document.getElementById('cancel-cook-btn').addEventListener('click', cancelCooking);
  document.getElementById('done-btn').addEventListener('click', () => showView('home'));
  document.getElementById('fail-done-btn').addEventListener('click', () => showView('home'));
  document.getElementById('nav-home').addEventListener('click', () => showView('home'));
  document.getElementById('nav-book').addEventListener('click', () => { renderRecipeBook(); showView('book'); });
  document.getElementById('reset-progress-btn').addEventListener('click', () => {
    if (confirm('Clear your entire recipe collection? This can\'t be undone.')) resetProgress();
  });
  document.getElementById('reset-pantry-btn').addEventListener('click', () => {
    if (confirm('Restock the pantry? All spent ingredients become available again.')) resetPantry();
  });
  document.getElementById('mute-btn').addEventListener('click', () => {
    state.muted = !state.muted;
    localStorage.setItem(K.muted, state.muted ? '1' : '0');
    applyMute();
    if (!state.muted && state.timer.totalMs && !state.timer.paused) startBGM();
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) stopTitleFlash(); });

  // Resume an in-progress focus session if the page was reloaded mid-cook.
  const session = loadSession();
  if (session) {
    if (session.paused) restorePausedSession(session);
    else if (session.endAt > Date.now()) restoreActiveSession(session);
    else {
      state.timer.totalMs = session.totalMs;
      state.pending = session.pending || { recipe: null, ingredientIds: [] };
      clearSession();
      finishCooking();
    }
  }
}

main();
