// ---------------------------------------------------------------------------
// Focus Kitchen v2 — new environment tileset + PRD improvements
//   * new v2 tileset (data/tiles_v2.json + assets/tiles_v2/*)
//   * border pantry with persistent ingredient depletion (PRD 5.3 / 6.2)
//   * distillery tube fluid-fill widget + desk clock (PRD 5.1)
//   * visible 4-phase chef journey: Gather -> Prep -> Cook -> Serve (PRD 2.1)
// Built as a self-contained copy so the v1 app at ../ stays untouched.
// ---------------------------------------------------------------------------

const BASE = '../';                       // v2/ pages resolve shared assets one level up
const asset = p => (p && !/^https?:|^\.\.\//.test(p)) ? BASE + p : p;

const STORAGE_KEY = 'focus-kitchen-v2-unlocked';
const SESSION_KEY = 'focus-kitchen-v2-session';
const PANTRY_KEY  = 'focus-kitchen-v2-pantry';

const state = {
  data: { ingredients: null, tiles: null, chef: null, recipes: null },
  unlocked: loadSet(STORAGE_KEY),
  spent: loadSet(PANTRY_KEY),
  timer: { totalMs: 0, endAt: 0, tickHandle: null, introTimers: [], introDone: false, paused: false, remainingAtPauseMs: 0 },
};

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSet(key, set) { localStorage.setItem(key, JSON.stringify([...set])); }

function saveSession() {
  const t = state.timer;
  if (!t.totalMs) { localStorage.removeItem(SESSION_KEY); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    totalMs: t.totalMs, endAt: t.paused ? null : t.endAt,
    paused: t.paused, remainingAtPauseMs: t.remainingAtPauseMs,
  }));
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadData() {
  const [ingredients, tiles, chef, recipes] = await Promise.all([
    fetch(BASE + 'data/ingredients.json').then(r => r.json()),
    fetch(BASE + 'data/tiles_v2.json').then(r => r.json()),
    fetch(BASE + 'data/chef_animations.json').then(r => r.json()),
    fetch(BASE + 'data/recipes.json').then(r => r.json()),
  ]);
  state.data = { ingredients, tiles, chef, recipes };
}

function tileFile(id) {
  const s = state.data.tiles.sprites.find(t => t.id === id);
  return s ? asset(s.file) : '';
}

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
      this._render(section);
      this.img.style.opacity = '1';
      this.handle = setInterval(() => this._advance(section), section.frame_ms);
    };
    if (isSwitch) { this.img.style.opacity = '0'; setTimeout(start, 180); } else { start(); }
  }
  _advance(section) {
    this.frameIndex++;
    if (this.frameIndex >= section.frames.length) {
      if (section.loop) { this.frameIndex = 0; }
      else { this.frameIndex = section.frames.length - 1; this._render(section); this.stop(); if (this.onComplete) this.onComplete(); return; }
    }
    this._render(section);
  }
  _render(section) { this.img.src = asset(section.frames[this.frameIndex].file); }
  stop() { if (this.handle) { clearInterval(this.handle); this.handle = null; } }
}

// ---------------------------------------------------------------------------
// Scene composition — new v2 tileset, laid out to match the storyboard:
//   wall band  : wood-panel wall, upper cabinets, hood, clock
//   counter band: lower cabinets, double sink, stove, fridge, dishwasher
//   floor band : open terracotta floor where the chef works
// ---------------------------------------------------------------------------

const CHEF_SPOTS = {
  idle:    { left: '42%', top: '68%' },
  gather:  { left: '6%',  top: '64%' },
  prep:    { left: '40%', top: '60%' },
  cook:    { left: '12%', top: '50%' },
};

function composeKitchenScene(container) {
  container.innerHTML = '';
  container.style.backgroundImage = `url(${tileFile('floor_terracotta')})`;
  container.style.backgroundSize = '64px 64px';
  container.style.backgroundRepeat = 'repeat';

  // wall strip across the top
  const wall = document.createElement('div');
  wall.className = 'scene-layer';
  Object.assign(wall.style, {
    left: 0, right: 0, top: 0, height: '30%', zIndex: '0',
    backgroundImage: `url(${tileFile('wall_wood_panel')})`,
    backgroundSize: '80px 60px', backgroundRepeat: 'repeat',
  });
  container.appendChild(wall);

  const layers = [
    { id: 'cabinet_upper_run', style: { left: '5%',  top: '4%',  width: '46%', zIndex: 2 } },
    { id: 'extractor_hood',    style: { left: '14%', top: '14%', width: '18%', zIndex: 3 } },
    { id: 'desk_clock',        style: { right: '6%', top: '5%',  width: '9%',  zIndex: 3 } },
    { id: 'fridge',            style: { right: '4%', top: '20%', width: '15%', zIndex: 2 } },
    { id: 'cabinet_lower_run', style: { left: '4%',  top: '40%', width: '40%', zIndex: 2 } },
    { id: 'stove_range',       style: { left: '7%',  top: '38%', width: '32%', zIndex: 3 } },
    { id: 'counter_double_sink', style: { left: '45%', top: '40%', width: '30%', zIndex: 2 } },
    { id: 'dishwasher',        style: { right: '22%', top: '44%', width: '13%', zIndex: 2 } },
    { id: 'utensil_rack',      style: { left: '52%', top: '20%', width: '15%', zIndex: 3 } },
    { id: 'spice_rack',        style: { left: '70%', top: '18%', width: '11%', zIndex: 3 } },
  ];
  for (const layer of layers) {
    const img = document.createElement('img');
    img.className = 'scene-layer';
    img.src = tileFile(layer.id);
    Object.assign(img.style, { position: 'absolute', height: 'auto', ...layer.style, zIndex: String(layer.style.zIndex) });
    container.appendChild(img);
  }
}

function placeChef(container, spot, imgId) {
  const img = document.createElement('img');
  img.id = imgId;
  img.className = 'chef-sprite scene-layer';
  Object.assign(img.style, { position: 'absolute', height: 'auto', width: '88px', zIndex: 5, ...spot });
  container.appendChild(img);
  return img;
}

function moveChef(img, spot) { Object.assign(img.style, spot); }

// ---------------------------------------------------------------------------
// Border pantry — the surrounding frame of ingredient icons. Spent ones
// gray out (state_disabled) and persist until the pantry is restocked.
// ---------------------------------------------------------------------------

function pantrySelection() {
  // Spread EVERY ingredient around the four edges, in perimeter order
  // (top L->R, right T->B, bottom L->R, left T->B). Horizontal edges are wider
  // so they carry more icons, keeping the spacing even all the way around.
  const sprites = state.data.ingredients.sprites;
  const n = sprites.length;
  const topN = Math.round(n * 0.28);
  const rightN = Math.round(n * 0.22);
  const bottomN = Math.round(n * 0.28);
  const leftN = n - topN - rightN - bottomN;
  let i = 0;
  const take = k => sprites.slice(i, i += k);
  return { top: take(topN), right: take(rightN), bottom: take(bottomN), left: take(leftN) };
}

function decoratePantry() {
  const sel = pantrySelection();
  for (const [edge, list] of Object.entries(sel)) {
    const el = document.getElementById('pantry-' + edge);
    if (!el) continue;
    el.innerHTML = '';
    for (const s of list) {
      const img = document.createElement('img');
      img.className = 'pantry-slot' + (state.spent.has(s.id) ? ' spent' : '');
      img.src = asset(s.file);
      img.alt = s.label;
      img.title = s.label + (state.spent.has(s.id) ? ' (used)' : '');
      img.dataset.ing = s.id;
      el.appendChild(img);
    }
  }
  const note = document.getElementById('pantry-note');
  if (note) {
    const total = state.data.ingredients.sprites.length;
    note.textContent = state.spent.size
      ? `Pantry: ${total - state.spent.size}/${total} ingredients fresh — restock from the Recipe Book.`
      : `Pantry fully stocked — ${total} ingredients ready.`;
  }
}

// Deterministic per-dish ingredient consumption (recipe data has no ingredient
// list, so we derive a stable small subset from the recipe id — enough to give
// the PRD's persistent pantry-depletion feel).
function consumeIngredientsFor(recipe) {
  const sprites = state.data.ingredients.sprites;
  let h = 0;
  for (const ch of recipe.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const count = 2 + (h % 3); // 2–4 items
  const used = [];
  for (let i = 0; i < count; i++) {
    const ing = sprites[(h + i * 7) % sprites.length];
    if (!state.spent.has(ing.id)) { state.spent.add(ing.id); used.push(ing.id); }
  }
  saveSet(PANTRY_KEY, state.spent);
  return used;
}

// ---------------------------------------------------------------------------
// Completion sound + tab-title flash
// ---------------------------------------------------------------------------

let audioCtx = null;
function playDingSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.5);
    });
  } catch { /* audio not available */ }
}

let titleFlashHandle = null;
const originalTitle = document.title;
function startTitleFlash() {
  stopTitleFlash();
  let on = false;
  titleFlashHandle = setInterval(() => { document.title = on ? originalTitle : '🍲 Dish ready!'; on = !on; }, 1000);
}
function stopTitleFlash() { if (titleFlashHandle) { clearInterval(titleFlashHandle); titleFlashHandle = null; } document.title = originalTitle; }

// ---------------------------------------------------------------------------
// View management
// ---------------------------------------------------------------------------

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.getElementById('nav-home').classList.toggle('active', ['home', 'setup', 'cooking', 'complete'].includes(name));
  document.getElementById('nav-book').classList.toggle('active', name === 'book');
}

// ---------------------------------------------------------------------------
// Timer / cooking loop
// ---------------------------------------------------------------------------

let homeAnimator = null;
let cookAnimator = null;
let cookChefImg = null;

function initHomeScene() {
  const scene = document.getElementById('kitchen-scene');
  composeKitchenScene(scene);
  const chefImg = placeChef(scene, CHEF_SPOTS.idle, 'chef-idle');
  homeAnimator = new Animator(chefImg, state.data.chef.sections);
  homeAnimator.play('idle');
}

function formatMs(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 54;
function updateProgressRing(remainingFraction) {
  const bar = document.getElementById('progress-ring-bar');
  const arc = Math.max(0, Math.min(1, remainingFraction)) * RING_CIRCUMFERENCE;
  bar.style.strokeDasharray = `${arc} ${RING_CIRCUMFERENCE}`;
}

function updateDistillery(elapsedFraction) {
  const fill = document.getElementById('distillery-fill');
  if (fill) fill.style.height = `${Math.max(0, Math.min(1, elapsedFraction)) * 100}%`;
}

function setPhase(phase) {
  const order = ['gather', 'prep', 'cook', 'present'];
  const idx = order.indexOf(phase);
  document.querySelectorAll('.phase-dot').forEach(dot => {
    const i = order.indexOf(dot.dataset.phase);
    dot.classList.toggle('active', i === idx);
    dot.classList.toggle('done', i < idx);
  });
}

function setStage(text) {
  const stageLabel = document.getElementById('countdown-stage');
  stageLabel.style.opacity = '0';
  setTimeout(() => { stageLabel.textContent = text; stageLabel.style.opacity = '1'; }, 200);
}

function setupCookingScene() {
  const scene = document.getElementById('cooking-scene');
  composeKitchenScene(scene);
  cookChefImg = placeChef(scene, CHEF_SPOTS.gather, 'chef-sprite');
  cookAnimator = new Animator(cookChefImg, state.data.chef.sections);
}

// The 4-phase journey: chef visibly walks between pantry, prep counter and
// stove. Driven on a fixed intro timeline (looping sections never fire an
// onComplete), matching the storyboard panels.
function runIntroSequence() {
  document.getElementById('countdown-stage').textContent = 'The chef arrives & gathers ingredients…';
  setPhase('gather');
  moveChef(cookChefImg, CHEF_SPOTS.gather);
  cookAnimator.play('walking');
  state.timer.introTimers = [
    setTimeout(() => { setStage('Gathering from the pantry…'); cookAnimator.play('interaction'); }, 1400),
    setTimeout(() => {
      setStage('Chopping ingredients…'); setPhase('prep');
      moveChef(cookChefImg, CHEF_SPOTS.prep); cookAnimator.play('chopping');
    }, 4200),
    setTimeout(() => {
      setStage('Cooking in progress…'); setPhase('cook');
      moveChef(cookChefImg, CHEF_SPOTS.cook); cookAnimator.play('stirring');
      state.timer.introDone = true;
    }, 7300),
  ];
}

function clearIntroTimers() { state.timer.introTimers.forEach(clearTimeout); state.timer.introTimers = []; }

function startTicking() {
  if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
  const tick = () => {
    const remainingMs = Math.max(0, state.timer.endAt - Date.now());
    document.getElementById('countdown-readout').textContent = formatMs(remainingMs);
    updateProgressRing(remainingMs / state.timer.totalMs);
    updateDistillery(1 - remainingMs / state.timer.totalMs);
    if (remainingMs <= 0) {
      clearInterval(state.timer.tickHandle);
      clearIntroTimers();
      cookAnimator.stop();
      clearSession();
      finishCooking();
    }
  };
  tick();
  state.timer.tickHandle = setInterval(tick, 250);
}

function startCookingSession(minutes) {
  state.timer.totalMs = minutes * 60 * 1000;
  state.timer.endAt = Date.now() + state.timer.totalMs;
  state.timer.paused = false;
  state.timer.introDone = false;
  saveSession();
  setupCookingScene();
  runIntroSequence();
  startTicking();
  document.getElementById('pause-cook-btn').textContent = 'Pause';
  showView('cooking');
}

function restoreActiveSession(session) {
  state.timer.totalMs = session.totalMs;
  state.timer.endAt = session.endAt;
  state.timer.paused = false;
  state.timer.introDone = true;
  setupCookingScene();
  setPhase('cook');
  moveChef(cookChefImg, CHEF_SPOTS.cook);
  document.getElementById('countdown-stage').textContent = 'Cooking in progress…';
  cookAnimator.play('stirring');
  startTicking();
  document.getElementById('pause-cook-btn').textContent = 'Pause';
  showView('cooking');
}

function restorePausedSession(session) {
  state.timer.totalMs = session.totalMs;
  state.timer.remainingAtPauseMs = session.remainingAtPauseMs;
  state.timer.paused = true;
  state.timer.introDone = true;
  setupCookingScene();
  setPhase('cook');
  moveChef(cookChefImg, CHEF_SPOTS.cook);
  cookAnimator.play('stirring'); cookAnimator.stop();
  document.getElementById('countdown-stage').textContent = 'Paused';
  document.getElementById('countdown-readout').textContent = formatMs(session.remainingAtPauseMs);
  updateProgressRing(session.remainingAtPauseMs / session.totalMs);
  updateDistillery(1 - session.remainingAtPauseMs / session.totalMs);
  document.getElementById('pause-cook-btn').textContent = 'Resume';
  showView('cooking');
}

function togglePauseCooking() {
  if (state.timer.paused) {
    state.timer.endAt = Date.now() + state.timer.remainingAtPauseMs;
    state.timer.paused = false;
    document.getElementById('pause-cook-btn').textContent = 'Pause';
    document.getElementById('countdown-stage').textContent = 'Cooking in progress…';
    cookAnimator.play('stirring');
    startTicking();
  } else {
    state.timer.remainingAtPauseMs = Math.max(0, state.timer.endAt - Date.now());
    state.timer.paused = true;
    state.timer.introDone = true;
    clearIntroTimers();
    if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
    cookAnimator.stop();
    document.getElementById('countdown-stage').textContent = 'Paused';
    document.getElementById('pause-cook-btn').textContent = 'Resume';
  }
  saveSession();
}

function cancelCooking() {
  if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
  clearIntroTimers();
  if (cookAnimator) cookAnimator.stop();
  state.timer.totalMs = 0;
  clearSession();
  showView('home');
}

function pickRecipeToReveal() {
  const all = state.data.recipes.sprites;
  const locked = all.filter(r => !state.unlocked.has(r.id));
  const pool = locked.length ? locked : all;
  const recipe = pool[Math.floor(Math.random() * pool.length)];
  const isNew = !state.unlocked.has(recipe.id);
  if (isNew) state.unlocked.add(recipe.id);
  saveSet(STORAGE_KEY, state.unlocked);
  return { recipe, isNew };
}

function finishCooking() {
  const { recipe, isNew } = pickRecipeToReveal();
  updateDistillery(1);
  setPhase('present');
  consumeIngredientsFor(recipe);
  decoratePantry();

  document.getElementById('dish-image').src = asset(recipe.file);
  document.getElementById('dish-name').textContent = recipe.label;
  document.getElementById('unlock-banner').classList.toggle('hidden', !isNew);
  updateBookBadge();

  const presentImg = document.getElementById('chef-presenting');
  new Animator(presentImg, state.data.chef.sections).play('presenting');

  playDingSound();
  if (document.hidden) startTitleFlash();
  showView('complete');
}

function updateBookBadge() { document.getElementById('book-count').textContent = state.unlocked.size; }

function renderRecipeBook() {
  const grid = document.getElementById('recipe-grid');
  grid.innerHTML = '';
  const all = state.data.recipes.sprites;
  for (const r of all) {
    const unlocked = state.unlocked.has(r.id);
    const card = document.createElement('div');
    card.className = 'recipe-card' + (unlocked ? '' : ' locked');
    const img = document.createElement('img');
    img.src = asset(r.file);
    img.alt = unlocked ? r.label : 'locked recipe';
    const name = document.createElement('div');
    name.className = 'rname';
    name.textContent = unlocked ? r.label : '???';
    card.appendChild(img); card.appendChild(name);
    grid.appendChild(card);
  }
  document.getElementById('collection-complete').classList.toggle('hidden', state.unlocked.size < all.length);
}

function resetProgress() {
  state.unlocked = new Set();
  saveSet(STORAGE_KEY, state.unlocked);
  updateBookBadge();
  renderRecipeBook();
}

function restockPantry() {
  state.spent = new Set();
  saveSet(PANTRY_KEY, state.spent);
  decoratePantry();
}

// ---------------------------------------------------------------------------
// Duration dial wiring
// ---------------------------------------------------------------------------

let selectedMinutes = 25;
const DIAL_MAX_MINUTES = 180;

function tierFor(min) {
  if (min <= 10) return 'Tier 1 · Quick prep — drinks & light bites';
  if (min <= 20) return 'Tier 2 · Light meals & snacks';
  if (min <= 35) return 'Tier 3 · Standard entrées';
  return 'Tier 4 · Gourmet feasts (5+ ingredients)';
}

function setDialMinutes(minutes, { deselectPresets = false } = {}) {
  selectedMinutes = minutes;
  document.getElementById('dial-readout').textContent = `${String(minutes).padStart(2, '0')}:00`;
  const angle = Math.min(minutes, DIAL_MAX_MINUTES) / DIAL_MAX_MINUTES * 360;
  document.getElementById('dial-hand').style.transform = `translateX(-50%) rotate(${angle}deg)`;
  const hint = document.getElementById('tier-hint');
  if (hint) hint.textContent = tierFor(minutes);
  if (deselectPresets) document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
}

function wireSetupView() {
  const buttons = document.querySelectorAll('.duration-btn');
  const customRange = document.getElementById('custom-range');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (btn.dataset.min === 'custom') {
        customRange.classList.remove('hidden');
        setDialMinutes(Number(customRange.value));
      } else {
        customRange.classList.add('hidden');
        setDialMinutes(Number(btn.dataset.min));
      }
    });
  });
  customRange.addEventListener('input', () => setDialMinutes(Number(customRange.value)));

  const dial = document.getElementById('dial');
  let dragging = false;
  const minutesFromEvent = evt => {
    const rect = dial.getBoundingClientRect();
    const dx = evt.clientX - (rect.left + rect.width / 2);
    const dy = evt.clientY - (rect.top + rect.height / 2);
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
  initHomeScene();
  decoratePantry();
  wireSetupView();
  updateBookBadge();
  setDialMinutes(25);

  document.getElementById('start-cooking-btn').addEventListener('click', () => showView('setup'));
  document.getElementById('back-to-home').addEventListener('click', () => showView('home'));
  document.getElementById('begin-timer-btn').addEventListener('click', () => startCookingSession(selectedMinutes));
  document.getElementById('pause-cook-btn').addEventListener('click', togglePauseCooking);
  document.getElementById('cancel-cook-btn').addEventListener('click', cancelCooking);
  document.getElementById('done-btn').addEventListener('click', () => { decoratePantry(); showView('home'); });
  document.getElementById('nav-home').addEventListener('click', () => showView('home'));
  document.getElementById('nav-book').addEventListener('click', () => { renderRecipeBook(); showView('book'); });
  document.getElementById('reset-progress-btn').addEventListener('click', () => {
    if (confirm('Clear your entire recipe collection? This can\'t be undone.')) resetProgress();
  });
  document.getElementById('reset-pantry-btn').addEventListener('click', restockPantry);

  document.addEventListener('visibilitychange', () => { if (!document.hidden) stopTitleFlash(); });

  const session = loadSession();
  if (session) {
    if (session.paused) restorePausedSession(session);
    else if (session.endAt > Date.now()) restoreActiveSession(session);
    else { state.timer.totalMs = session.totalMs; clearSession(); finishCooking(); }
  }
}

main();
