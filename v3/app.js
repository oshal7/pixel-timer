// ---------------------------------------------------------------------------
// Focus Kitchen v3
//   * food items arranged around the whole pantry frame, loaded from
//     data/food.json -> assets/food_v3/<id>.png (drop-in replaceable art)
//   * "Start" sends the chef roaming the entire border to GATHER every item
//     into a basket, with footstep + pickup sounds and gentle music
//   * then the usual cook -> complete -> recipe-book flow (from v2)
// Self-contained copy; v1/v2 untouched.
// ---------------------------------------------------------------------------

const BASE = '../';
const asset = p => (p && !/^https?:|^\.\.\//.test(p)) ? BASE + p : p;

const STORAGE_KEY = 'focus-kitchen-v3-unlocked';
const SESSION_KEY = 'focus-kitchen-v3-session';
const MUTE_KEY    = 'focus-kitchen-v3-muted';

const GATHER_COUNT = 14;   // how many items the chef visits (spread around the border)
const HOP_MS = 620;        // time to walk between two items

const state = {
  data: { food: null, tiles: null, chef: null, recipes: null },
  unlocked: loadSet(STORAGE_KEY),
  timer: { totalMs: 0, endAt: 0, tickHandle: null, introTimers: [], paused: false, remainingAtPauseMs: 0 },
};

function loadSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } }
function saveSet(key, set) { localStorage.setItem(key, JSON.stringify([...set])); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Data loading — food.json is the single source for the pantry; if it is
// missing we fall back to the shared ingredients.json so the app still runs.
// ---------------------------------------------------------------------------

async function loadData() {
  const [food, tiles, chef, recipes] = await Promise.all([
    fetch(BASE + 'data/food.json').then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(BASE + 'data/tiles_v2.json').then(r => r.json()),
    fetch(BASE + 'data/chef_animations.json').then(r => r.json()),
    fetch(BASE + 'data/recipes.json').then(r => r.json()),
  ]);
  let items;
  if (food && food.items) {
    items = food.items;
  } else {
    const ing = await fetch(BASE + 'data/ingredients.json').then(r => r.json());
    items = ing.sprites.map(s => ({ id: s.id, label: s.label, file: s.file }));
  }
  state.data = { food: items, tiles, chef, recipes };
}

function tileFile(id) {
  const s = state.data.tiles.sprites.find(t => t.id === id);
  return s ? asset(s.file) : '';
}

// ---------------------------------------------------------------------------
// Audio — all synthesized with WebAudio, so no audio files are needed and the
// art stays the only thing you have to supply. Footsteps + pickups + a soft
// lofi arpeggio, all behind one mute toggle.
// ---------------------------------------------------------------------------

const audio = {
  ctx: null, master: null, musicTimer: null, muted: localStorage.getItem(MUTE_KEY) === '1',
  ensure() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
  },
  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  },
  footstep() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 90 + Math.random() * 20;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  },
  pop() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(1040, t + 0.12);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
  },
  ding() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [880, 1174.66].forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.15);
      g.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
      o.connect(g).connect(this.master); o.start(now + i * 0.15); o.stop(now + i * 0.15 + 0.5);
    });
  },
  // soft, slow pentatonic arpeggio — cozy background bed
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00]; // A minor pentatonic-ish
    let i = 0;
    const step = () => {
      if (this.muted) return;
      const t = this.ctx.currentTime;
      const f = scale[i % scale.length];
      i++;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(lp).connect(this.master); o.start(t); o.stop(t + 1.0);
    };
    step();
    this.musicTimer = setInterval(step, 430);
  },
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
};

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

class Animator {
  constructor(imgEl, sections) { this.img = imgEl; this.sections = sections; this.handle = null; this.frameIndex = 0; this.current = null; this.onComplete = null; }
  play(name, { onComplete } = {}) {
    this.stop();
    const section = this.sections[name];
    if (!section) return;
    const isSwitch = this.current !== null && this.current !== name;
    this.current = name; this.frameIndex = 0; this.onComplete = onComplete || null;
    const start = () => { this._render(section); this.img.style.opacity = '1'; this.handle = setInterval(() => this._advance(section), section.frame_ms); };
    if (isSwitch) { this.img.style.opacity = '0'; setTimeout(start, 140); } else { start(); }
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
// Scene + pantry building
// ---------------------------------------------------------------------------

function composeKitchenScene(container) {
  container.innerHTML = '';
  container.style.backgroundImage = `url(${tileFile('floor_terracotta')})`;
  container.style.backgroundSize = '64px 64px';
  container.style.backgroundRepeat = 'repeat';

  const wall = document.createElement('div');
  wall.className = 'scene-layer';
  Object.assign(wall.style, { left: 0, right: 0, top: 0, height: '30%', zIndex: '0',
    backgroundImage: `url(${tileFile('wall_wood_panel')})`, backgroundSize: '80px 60px', backgroundRepeat: 'repeat' });
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

// Distribute EVERY food item around the four edges of a frame (perimeter order).
function edgeSplit(items) {
  const n = items.length;
  const topN = Math.round(n * 0.28), rightN = Math.round(n * 0.22), bottomN = Math.round(n * 0.28);
  const leftN = n - topN - rightN - bottomN;
  let i = 0; const take = k => items.slice(i, i += k);
  return { top: take(topN), right: take(rightN), bottom: take(bottomN), left: take(leftN) };
}

function buildPantry(prefix) {
  const sel = edgeSplit(state.data.food);
  const slots = [];
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const el = document.getElementById(`${prefix}-${edge}`);
    if (!el) continue;
    el.innerHTML = '';
    for (const item of sel[edge]) {
      const img = document.createElement('img');
      img.className = 'pantry-slot';
      img.src = asset(item.file);
      img.alt = item.label; img.title = item.label; img.dataset.id = item.id;
      el.appendChild(img);
      slots.push(img);
    }
  }
  return slots; // in perimeter order
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.getElementById('nav-home').classList.toggle('active', ['home', 'setup', 'gather', 'cooking', 'complete'].includes(name));
  document.getElementById('nav-book').classList.toggle('active', name === 'book');
}

let homeAnimator = null;
function initHomeScene() {
  composeKitchenScene(document.getElementById('home-scene'));
  buildPantry('home');
  const note = document.getElementById('pantry-note');
  note.textContent = `${state.data.food.length} ingredients around the pantry — swap any art in assets/food_v3/.`;
  // idle chef sits in the home scene
  const scene = document.getElementById('home-scene');
  const chef = document.createElement('img');
  chef.className = 'chef-sprite scene-layer';
  Object.assign(chef.style, { position: 'absolute', left: '44%', top: '66%', width: '84px', height: 'auto', zIndex: 5 });
  scene.appendChild(chef);
  homeAnimator = new Animator(chef, state.data.chef.sections);
  homeAnimator.play('idle');
}

// ---------------------------------------------------------------------------
// THE GATHER SEQUENCE — chef roams the whole border collecting food.
// ---------------------------------------------------------------------------

let gatherChef = null, gatherAnimator = null;

function gatherLabel(text) {
  const el = document.getElementById('gather-label');
  el.style.opacity = '0';
  setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 160);
}

function centerOfFrame(frame) {
  return { x: frame.clientWidth / 2, y: frame.clientHeight / 2 };
}

// position (relative to the frame) of a slot's centre
function slotPoint(frame, slot) {
  const fr = frame.getBoundingClientRect(), r = slot.getBoundingClientRect();
  return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2 };
}

function placeGatherChef(x, y) {
  const w = gatherChef.offsetWidth || 74, h = gatherChef.offsetHeight || 74;
  gatherChef.style.left = `${x - w / 2}px`;
  gatherChef.style.top = `${y - h}px`; // feet at the point
}

// Pick GATHER_COUNT slots evenly spread around the perimeter so the chef
// visits every side, not just one corner.
function pickTargets(slots) {
  const n = Math.min(GATHER_COUNT, slots.length);
  const step = slots.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(slots[Math.floor(i * step)]);
  return out;
}

async function runGatherSequence(minutes) {
  showView('gather');
  const frame = document.getElementById('pantry-gather');
  composeKitchenScene(document.getElementById('gather-scene'));
  const slots = buildPantry('gather');
  document.getElementById('basket-count').textContent = '0';

  gatherChef = document.getElementById('gather-chef');
  gatherChef.style.setProperty('--hop', `${HOP_MS}ms`);
  gatherAnimator = new Animator(gatherChef, state.data.chef.sections);

  // let layout settle so getBoundingClientRect is correct
  await sleep(60);
  const c = centerOfFrame(frame);
  gatherChef.style.transition = 'none';
  placeGatherChef(c.x, c.y);
  gatherAnimator.play('idle');
  await sleep(120);
  gatherChef.style.transition = '';

  audio.ensure();
  if (audio.ctx.state === 'suspended') await audio.ctx.resume();
  audio.startMusic();

  const targets = pickTargets(slots);
  let collected = 0;
  gatherLabel('The chef heads out to gather…');

  for (const slot of targets) {
    const p = slotPoint(frame, slot);
    gatherAnimator.play('walking');
    placeGatherChef(p.x, p.y);
    // footsteps across the hop
    for (let s = 0; s < 3; s++) { audio.footstep(); await sleep(HOP_MS / 3); }
    // grab
    gatherAnimator.play('interaction');
    slot.classList.add('collected');
    audio.pop();
    collected++;
    document.getElementById('basket-count').textContent = String(collected);
    if (collected === Math.ceil(targets.length / 2)) gatherLabel('Basket filling up…');
    await sleep(200);
  }

  gatherLabel('Back to the kitchen!');
  gatherAnimator.play('walking');
  placeGatherChef(c.x, c.y);
  await sleep(HOP_MS);
  gatherAnimator.play('presenting');
  await sleep(500);

  startCookingSession(minutes);
}

// ---------------------------------------------------------------------------
// Cooking (compact version of v2's flow)
// ---------------------------------------------------------------------------

let cookAnimator = null, cookChefImg = null;

function formatMs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const RING = 2 * Math.PI * 54;
function updateRing(frac) { document.getElementById('progress-ring-bar').style.strokeDasharray = `${Math.max(0, Math.min(1, frac)) * RING} ${RING}`; }
function updateDistillery(frac) { document.getElementById('distillery-fill').style.height = `${Math.max(0, Math.min(1, frac)) * 100}%`; }
function setPhase(phase) {
  const order = ['gather', 'prep', 'cook', 'present'], idx = order.indexOf(phase);
  document.querySelectorAll('.phase-dot').forEach(d => { const i = order.indexOf(d.dataset.phase); d.classList.toggle('active', i === idx); d.classList.toggle('done', i < idx); });
}
function setStage(text) { const l = document.getElementById('countdown-stage'); l.style.opacity = '0'; setTimeout(() => { l.textContent = text; l.style.opacity = '1'; }, 180); }

function setupCookingScene() {
  const scene = document.getElementById('cooking-scene');
  composeKitchenScene(scene);
  cookChefImg = document.createElement('img');
  cookChefImg.className = 'chef-sprite scene-layer';
  Object.assign(cookChefImg.style, { position: 'absolute', left: '12%', top: '50%', width: '88px', height: 'auto', zIndex: 5 });
  scene.appendChild(cookChefImg);
  cookAnimator = new Animator(cookChefImg, state.data.chef.sections);
}

function runCookIntro() {
  setPhase('prep'); setStage('Chopping ingredients…');
  cookAnimator.play('chopping');
  state.timer.introTimers = [ setTimeout(() => { setPhase('cook'); setStage('Cooking in progress…'); cookAnimator.play('stirring'); }, 2600) ];
}
function clearIntroTimers() { state.timer.introTimers.forEach(clearTimeout); state.timer.introTimers = []; }

function startTicking() {
  if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
  const tick = () => {
    const rem = Math.max(0, state.timer.endAt - Date.now());
    document.getElementById('countdown-readout').textContent = formatMs(rem);
    updateRing(rem / state.timer.totalMs);
    updateDistillery(1 - rem / state.timer.totalMs);
    if (rem <= 0) { clearInterval(state.timer.tickHandle); clearIntroTimers(); cookAnimator.stop(); finishCooking(); }
  };
  tick();
  state.timer.tickHandle = setInterval(tick, 250);
}

function startCookingSession(minutes) {
  state.timer.totalMs = minutes * 60 * 1000;
  state.timer.endAt = Date.now() + state.timer.totalMs;
  state.timer.paused = false;
  setupCookingScene();
  runCookIntro();
  startTicking();
  document.getElementById('pause-cook-btn').textContent = 'Pause';
  showView('cooking');
}

function togglePauseCooking() {
  if (state.timer.paused) {
    state.timer.endAt = Date.now() + state.timer.remainingAtPauseMs;
    state.timer.paused = false;
    document.getElementById('pause-cook-btn').textContent = 'Pause';
    setStage('Cooking in progress…'); cookAnimator.play('stirring'); audio.startMusic();
    startTicking();
  } else {
    state.timer.remainingAtPauseMs = Math.max(0, state.timer.endAt - Date.now());
    state.timer.paused = true;
    clearIntroTimers();
    if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
    cookAnimator.stop(); audio.stopMusic();
    setStage('Paused'); document.getElementById('pause-cook-btn').textContent = 'Resume';
  }
}

function cancelCooking() {
  if (state.timer.tickHandle) clearInterval(state.timer.tickHandle);
  clearIntroTimers();
  if (cookAnimator) cookAnimator.stop();
  audio.stopMusic();
  state.timer.totalMs = 0;
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
  updateDistillery(1); setPhase('present');
  audio.stopMusic();
  document.getElementById('dish-image').src = asset(recipe.file);
  document.getElementById('dish-name').textContent = recipe.label;
  document.getElementById('unlock-banner').classList.toggle('hidden', !isNew);
  updateBookBadge();
  new Animator(document.getElementById('chef-presenting'), state.data.chef.sections).play('presenting');
  audio.ding();
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
    const img = document.createElement('img'); img.src = asset(r.file); img.alt = unlocked ? r.label : 'locked recipe';
    const name = document.createElement('div'); name.className = 'rname'; name.textContent = unlocked ? r.label : '???';
    card.appendChild(img); card.appendChild(name); grid.appendChild(card);
  }
  document.getElementById('collection-complete').classList.toggle('hidden', state.unlocked.size < all.length);
}

function resetProgress() { state.unlocked = new Set(); saveSet(STORAGE_KEY, state.unlocked); updateBookBadge(); renderRecipeBook(); }

// ---------------------------------------------------------------------------
// Duration dial
// ---------------------------------------------------------------------------

let selectedMinutes = 25;
const DIAL_MAX = 180;
function tierFor(m) { return m <= 10 ? 'Tier 1 · Quick prep' : m <= 20 ? 'Tier 2 · Light meals' : m <= 35 ? 'Tier 3 · Standard entrées' : 'Tier 4 · Gourmet feasts'; }
function setDialMinutes(m, { deselect = false } = {}) {
  selectedMinutes = m;
  document.getElementById('dial-readout').textContent = `${String(m).padStart(2, '0')}:00`;
  document.getElementById('dial-hand').style.transform = `translateX(-50%) rotate(${Math.min(m, DIAL_MAX) / DIAL_MAX * 360}deg)`;
  document.getElementById('tier-hint').textContent = tierFor(m);
  if (deselect) document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
}
function wireSetup() {
  const buttons = document.querySelectorAll('.duration-btn');
  const range = document.getElementById('custom-range');
  buttons.forEach(btn => btn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('selected')); btn.classList.add('selected');
    if (btn.dataset.min === 'custom') { range.classList.remove('hidden'); setDialMinutes(Number(range.value)); }
    else { range.classList.add('hidden'); setDialMinutes(Number(btn.dataset.min)); }
  }));
  range.addEventListener('input', () => setDialMinutes(Number(range.value)));
  const dial = document.getElementById('dial'); let dragging = false;
  const minutesFromEvent = evt => {
    const rect = dial.getBoundingClientRect();
    const dx = evt.clientX - (rect.left + rect.width / 2), dy = evt.clientY - (rect.top + rect.height / 2);
    let a = Math.atan2(-dx, dy) * 180 / Math.PI; if (a < 0) a += 360;
    return Math.max(1, Math.round(a / 360 * DIAL_MAX));
  };
  dial.addEventListener('pointerdown', e => { dragging = true; dial.setPointerCapture(e.pointerId); range.classList.remove('hidden'); const m = minutesFromEvent(e); range.value = Math.min(m, Number(range.max)); setDialMinutes(m, { deselect: true }); });
  dial.addEventListener('pointermove', e => { if (!dragging) return; const m = minutesFromEvent(e); range.value = Math.min(m, Number(range.max)); setDialMinutes(m, { deselect: true }); });
  dial.addEventListener('pointerup', () => { dragging = false; });
  dial.addEventListener('pointercancel', () => { dragging = false; });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function updateAudioButton() {
  const b = document.getElementById('audio-toggle');
  b.textContent = audio.muted ? '🔇' : '🔊';
  b.classList.toggle('muted', audio.muted);
}

async function main() {
  await loadData();
  initHomeScene();
  wireSetup();
  updateBookBadge();
  updateAudioButton();
  setDialMinutes(25);

  document.getElementById('start-cooking-btn').addEventListener('click', () => { audio.ensure(); showView('setup'); });
  document.getElementById('back-to-home').addEventListener('click', () => showView('home'));
  document.getElementById('begin-timer-btn').addEventListener('click', () => runGatherSequence(selectedMinutes));
  document.getElementById('pause-cook-btn').addEventListener('click', togglePauseCooking);
  document.getElementById('cancel-cook-btn').addEventListener('click', cancelCooking);
  document.getElementById('done-btn').addEventListener('click', () => showView('home'));
  document.getElementById('nav-home').addEventListener('click', () => showView('home'));
  document.getElementById('nav-book').addEventListener('click', () => { renderRecipeBook(); showView('book'); });
  document.getElementById('reset-progress-btn').addEventListener('click', () => { if (confirm('Clear your recipe collection?')) resetProgress(); });
  document.getElementById('audio-toggle').addEventListener('click', () => { audio.ensure(); audio.setMuted(!audio.muted); updateAudioButton(); });
}

main();
