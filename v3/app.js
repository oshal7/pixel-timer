// ---------------------------------------------------------------------------
// Focus Kitchen v3
//   * swappable chef animations via data/chef_v3.json (state -> folder)
//   * each dish has a real ingredient list (data/dishes_v3.json); the chef
//     gathers EXACTLY those ingredients
//   * the chef walks the pantry PERIMETER orthogonally (no diagonal jumps):
//     along a row, turn a corner, along the next side — one item at a time
//   * footstep / pickup SFX + soft music
// Self-contained; v1/v2 untouched.
// ---------------------------------------------------------------------------

const BASE = '../';
const asset = p => (p && !/^https?:|^\.\.\//.test(p)) ? BASE + p : p;

const STORAGE_KEY = 'focus-kitchen-v3-unlocked';
const MUTE_KEY    = 'focus-kitchen-v3-muted';

const WALK_SPEED = 90;     // px/second — slow, calm stroll
const GRAB_PAUSE_MS = 850; // gentle beat while plucking each item

const state = {
  data: { food: null, foodById: {}, tiles: null, chef: null, dishes: null, recipes: null },
  unlocked: loadSet(STORAGE_KEY),
};

function loadSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } }
function saveSet(key, set) { localStorage.setItem(key, JSON.stringify([...set])); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadData() {
  const [food, tiles, chef, dishes, recipes] = await Promise.all([
    fetch(BASE + 'data/food.json').then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(BASE + 'data/tiles_v2.json').then(r => r.json()),
    fetch(BASE + 'data/chef_v3.json').then(r => r.json()),
    fetch(BASE + 'data/dishes_v3.json').then(r => r.json()),
    fetch(BASE + 'data/recipes.json').then(r => r.json()),
  ]);
  let items = food && food.items ? food.items
    : (await fetch(BASE + 'data/ingredients.json').then(r => r.json())).sprites.map(s => ({ id: s.id, label: s.label, file: s.file }));
  const foodById = {};
  for (const it of items) foodById[it.id] = it;
  state.data = { food: items, foodById, tiles, chef, dishes: dishes.dishes, recipes };
}

function tileFile(id) { const s = state.data.tiles.sprites.find(t => t.id === id); return s ? asset(s.file) : ''; }
function recipeById(id) { return state.data.recipes.sprites.find(r => r.id === id); }

// ---------------------------------------------------------------------------
// Audio (synthesized)
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
  setMuted(m) { this.muted = m; localStorage.setItem(MUTE_KEY, m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.9; },
  footstep() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 90 + Math.random() * 20;
    g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  },
  pop() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1040, t + 0.12);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
  },
  ding() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [880, 1174.66].forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.15); g.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
      o.connect(g).connect(this.master); o.start(now + i * 0.15); o.stop(now + i * 0.15 + 0.5);
    });
  },
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00];
    let i = 0;
    const step = () => {
      if (this.muted) return;
      const t = this.ctx.currentTime, f = scale[i++ % scale.length];
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(lp).connect(this.master); o.start(t); o.stop(t + 1.0);
    };
    step(); this.musicTimer = setInterval(step, 560);
  },
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
};

// ---------------------------------------------------------------------------
// Animator — plays a named STATE from data/chef_v3.json (dir + count + timing).
// Sets --face so `flip` states (and CSS bob) mirror horizontally.
// ---------------------------------------------------------------------------

class Animator {
  constructor(imgEl, states) { this.img = imgEl; this.states = states; this.handle = null; this.i = 0; this.current = null; this.onComplete = null; }
  _frames(st) { return Array.from({ length: st.count }, (_, i) => asset(`${st.dir}/${String(i).padStart(2, '0')}.png`)); }
  play(name, { onComplete } = {}) {
    const st = this.states[name];
    if (!st || !st.count) return;
    this.stop();
    this.current = name; this.i = 0; this.onComplete = onComplete || null;
    this.frames = this._frames(st); this.loop = st.loop;
    this.img.style.setProperty('--face', st.flip ? '-1' : '1');
    this.img.src = this.frames[0];
    this.img.style.opacity = '1';
    this.handle = setInterval(() => this._tick(), st.frame_ms);
  }
  _tick() {
    this.i++;
    if (this.i >= this.frames.length) {
      if (this.loop) { this.i = 0; }
      else { this.i = this.frames.length - 1; this.img.src = this.frames[this.i]; this.stop(); if (this.onComplete) this.onComplete(); return; }
    }
    this.img.src = this.frames[this.i];
  }
  stop() { if (this.handle) { clearInterval(this.handle); this.handle = null; } }
}

// ---------------------------------------------------------------------------
// Scene + pantry
// ---------------------------------------------------------------------------

function composeKitchenScene(container) {
  container.innerHTML = '';
  container.style.backgroundImage = `url(${tileFile('floor_terracotta')})`;
  container.style.backgroundSize = '64px 64px'; container.style.backgroundRepeat = 'repeat';
  const wall = document.createElement('div');
  wall.className = 'scene-layer';
  Object.assign(wall.style, { left: 0, right: 0, top: 0, height: '30%', zIndex: '0',
    backgroundImage: `url(${tileFile('wall_wood_panel')})`, backgroundSize: '80px 60px', backgroundRepeat: 'repeat' });
  container.appendChild(wall);
  const layers = [
    { id: 'cabinet_upper_run', style: { left: '5%', top: '4%', width: '46%', zIndex: 2 } },
    { id: 'extractor_hood', style: { left: '14%', top: '14%', width: '18%', zIndex: 3 } },
    { id: 'desk_clock', style: { right: '6%', top: '5%', width: '9%', zIndex: 3 } },
    { id: 'fridge', style: { right: '4%', top: '20%', width: '15%', zIndex: 2 } },
    { id: 'cabinet_lower_run', style: { left: '4%', top: '40%', width: '40%', zIndex: 2 } },
    { id: 'stove_range', style: { left: '7%', top: '38%', width: '32%', zIndex: 3 } },
    { id: 'counter_double_sink', style: { left: '45%', top: '40%', width: '30%', zIndex: 2 } },
    { id: 'dishwasher', style: { right: '22%', top: '44%', width: '13%', zIndex: 2 } },
    { id: 'utensil_rack', style: { left: '52%', top: '20%', width: '15%', zIndex: 3 } },
    { id: 'spice_rack', style: { left: '70%', top: '18%', width: '11%', zIndex: 3 } },
  ];
  for (const layer of layers) {
    const img = document.createElement('img');
    img.className = 'scene-layer'; img.src = tileFile(layer.id);
    Object.assign(img.style, { position: 'absolute', height: 'auto', ...layer.style, zIndex: String(layer.style.zIndex) });
    container.appendChild(img);
  }
}

function edgeSplit(items) {
  const n = items.length;
  const topN = Math.round(n * 0.28), rightN = Math.round(n * 0.22), bottomN = Math.round(n * 0.28);
  const leftN = n - topN - rightN - bottomN;
  let i = 0; const take = k => items.slice(i, i += k);
  return { top: take(topN), right: take(rightN), bottom: take(bottomN), left: take(leftN) };
}

function buildPantry(prefix) {
  const sel = edgeSplit(state.data.food);
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const el = document.getElementById(`${prefix}-${edge}`);
    if (!el) continue;
    el.innerHTML = '';
    for (const item of sel[edge]) {
      const img = document.createElement('img');
      img.className = 'pantry-slot'; img.src = asset(item.file);
      img.alt = item.label; img.title = item.label; img.dataset.id = item.id; img.dataset.edge = edge;
      el.appendChild(img);
    }
  }
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
  document.getElementById('pantry-note').textContent =
    `${state.data.food.length} ingredients around the pantry — swap any art in assets/food_v3/.`;
  const scene = document.getElementById('home-scene');
  const chef = document.createElement('img');
  chef.className = 'chef-sprite scene-layer';
  Object.assign(chef.style, { position: 'absolute', left: '44%', top: '66%', width: '84px', height: 'auto', zIndex: 5 });
  scene.appendChild(chef);
  homeAnimator = new Animator(chef, state.data.chef.states);
  homeAnimator.play('idle');
}

// ---------------------------------------------------------------------------
// Dish selection — pick a dish whose tier matches the chosen focus length.
// ---------------------------------------------------------------------------

function tierForMinutes(m) { return m <= 10 ? 1 : m <= 20 ? 2 : m <= 35 ? 3 : 4; }

function chooseDish(minutes) {
  const tier = tierForMinutes(minutes);
  let pool = state.data.dishes.filter(d => d.tier === tier);
  if (!pool.length) pool = state.data.dishes;
  const locked = pool.filter(d => !state.unlocked.has(d.id));
  const from = locked.length ? locked : pool;
  return from[Math.floor(Math.random() * from.length)];
}

// ---------------------------------------------------------------------------
// THE GATHER SEQUENCE — orthogonal walk around the pantry perimeter,
// stopping only at this dish's ingredients, in clockwise order.
// ---------------------------------------------------------------------------

let gatherChef = null, gatherAnimator = null, chefPt = { x: 0, y: 0 };

function gatherLabel(text) {
  const el = document.getElementById('gather-label');
  el.style.opacity = '0';
  setTimeout(() => { el.innerHTML = text; el.style.opacity = '1'; }, 160);
}

function slotPoint(frame, slot) {
  const fr = frame.getBoundingClientRect(), r = slot.getBoundingClientRect();
  return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2 };
}
function placeGatherChef(x, y) {
  const w = gatherChef.offsetWidth || 78, h = gatherChef.offsetHeight || 78;
  gatherChef.style.left = `${x - w / 2}px`;
  gatherChef.style.top = `${y - h}px`;
}

// clockwise perimeter order for a set of slots
function clockwise(slots, frame) {
  const order = { top: 0, right: 1, bottom: 2, left: 3 };
  return slots.slice().sort((a, b) => {
    const ea = order[a.dataset.edge], eb = order[b.dataset.edge];
    if (ea !== eb) return ea - eb;
    const pa = slotPoint(frame, a), pb = slotPoint(frame, b);
    if (a.dataset.edge === 'top') return pa.x - pb.x;
    if (a.dataset.edge === 'right') return pa.y - pb.y;
    if (a.dataset.edge === 'bottom') return pb.x - pa.x;
    return pb.y - pa.y; // left, bottom->top
  });
}

// one axis-aligned step; picks the matching directional walk state
async function walkSegment(nx, ny) {
  const dx = nx - chefPt.x, dy = ny - chefPt.y;
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist < 1) return;
  const dur = Math.max(300, dist / WALK_SPEED * 1000);
  let st = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'walk_right' : 'walk_left') : (dy >= 0 ? 'walk_down' : 'walk_up');
  gatherChef.classList.add('walking');
  gatherAnimator.play(st);
  gatherChef.style.transitionDuration = `${dur}ms`;
  placeGatherChef(nx, ny);
  const steps = Math.max(2, Math.round(dur / 380));
  for (let s = 0; s < steps; s++) { audio.footstep(); await sleep(dur / steps); }
  chefPt = { x: nx, y: ny };
}

// orthogonal move: at most one corner, hugging the border
async function walkOrtho(tx, ty, centerX, centerY) {
  const needCorner = Math.abs(tx - chefPt.x) > 1 && Math.abs(ty - chefPt.y) > 1;
  if (needCorner) {
    const nearHorizontalEdge = Math.abs(chefPt.y - centerY) >= Math.abs(chefPt.x - centerX);
    if (nearHorizontalEdge) { await walkSegment(tx, chefPt.y); await walkSegment(tx, ty); }
    else { await walkSegment(chefPt.x, ty); await walkSegment(tx, ty); }
  } else {
    await walkSegment(tx, ty);
  }
}

async function runGatherSequence(dish, minutes) {
  showView('gather');
  const frame = document.getElementById('pantry-gather');
  composeKitchenScene(document.getElementById('gather-scene'));
  buildPantry('gather');

  // mark this dish's ingredients as the shopping list
  const allSlots = [...frame.querySelectorAll('.pantry-slot')];
  const needSet = new Set(dish.ingredients);
  const needed = clockwise(allSlots.filter(s => needSet.has(s.dataset.id)), frame);
  needed.forEach(s => s.classList.add('needed'));

  const chips = dish.ingredients.map(id => (state.data.foodById[id]?.label || id)).join(' · ');
  document.getElementById('basket-count').textContent = `0 / ${needed.length}`;
  gatherLabel(`Gathering for <b>${dish.name}</b> — ${chips}`);

  gatherChef = document.getElementById('gather-chef');
  gatherAnimator = new Animator(gatherChef, state.data.chef.states);

  await sleep(60);
  const cx = frame.clientWidth / 2, cy = frame.clientHeight / 2;
  chefPt = { x: cx, y: frame.clientHeight * 0.82 };  // start in the cooking area
  gatherChef.style.transitionDuration = '0ms';
  placeGatherChef(chefPt.x, chefPt.y);
  gatherAnimator.play('idle');
  await sleep(150);

  audio.ensure();
  if (audio.ctx.state === 'suspended') await audio.ctx.resume();
  audio.startMusic();

  let got = 0;
  for (const slot of needed) {
    const p = slotPoint(frame, slot);
    await walkOrtho(p.x, p.y, cx, cy);
    // pluck
    gatherChef.classList.remove('walking');
    gatherAnimator.play('idle');
    slot.classList.remove('needed');
    slot.classList.add('collected');
    audio.pop();
    got++;
    document.getElementById('basket-count').textContent = `${got} / ${needed.length}`;
    await sleep(GRAB_PAUSE_MS);
  }

  gatherLabel('Back to the kitchen!');
  await walkOrtho(cx, frame.clientHeight * 0.82, cx, cy);
  gatherChef.classList.remove('walking');
  gatherAnimator.play('present');
  await sleep(700);

  startCookingSession(minutes, dish);
}

// ---------------------------------------------------------------------------
// Cooking
// ---------------------------------------------------------------------------

let cookAnimator = null, timer = { totalMs: 0, endAt: 0, tickHandle: null, introTimers: [], paused: false, remainingAtPauseMs: 0, dish: null };

function formatMs(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
const RING = 2 * Math.PI * 54;
function updateRing(f) { document.getElementById('progress-ring-bar').style.strokeDasharray = `${Math.max(0, Math.min(1, f)) * RING} ${RING}`; }
function updateDistillery(f) { document.getElementById('distillery-fill').style.height = `${Math.max(0, Math.min(1, f)) * 100}%`; }
function setPhase(phase) {
  const order = ['gather', 'prep', 'cook', 'present'], idx = order.indexOf(phase);
  document.querySelectorAll('.phase-dot').forEach(d => { const i = order.indexOf(d.dataset.phase); d.classList.toggle('active', i === idx); d.classList.toggle('done', i < idx); });
}
function setStage(t) { const l = document.getElementById('countdown-stage'); l.style.opacity = '0'; setTimeout(() => { l.textContent = t; l.style.opacity = '1'; }, 180); }

function setupCookingScene() {
  const scene = document.getElementById('cooking-scene');
  composeKitchenScene(scene);
  const chef = document.createElement('img');
  chef.className = 'chef-sprite scene-layer';
  Object.assign(chef.style, { position: 'absolute', left: '12%', top: '50%', width: '88px', height: 'auto', zIndex: 5 });
  scene.appendChild(chef);
  cookAnimator = new Animator(chef, state.data.chef.states);
}

function runCookIntro() {
  setPhase('prep'); setStage('Chopping ingredients…'); cookAnimator.play('chop');
  timer.introTimers = [setTimeout(() => { setPhase('cook'); setStage('Cooking in progress…'); cookAnimator.play('stir'); }, 2600)];
}
function clearIntroTimers() { timer.introTimers.forEach(clearTimeout); timer.introTimers = []; }

function startTicking() {
  if (timer.tickHandle) clearInterval(timer.tickHandle);
  const tick = () => {
    const rem = Math.max(0, timer.endAt - Date.now());
    document.getElementById('countdown-readout').textContent = formatMs(rem);
    updateRing(rem / timer.totalMs); updateDistillery(1 - rem / timer.totalMs);
    if (rem <= 0) { clearInterval(timer.tickHandle); clearIntroTimers(); cookAnimator.stop(); finishCooking(); }
  };
  tick(); timer.tickHandle = setInterval(tick, 250);
}

function startCookingSession(minutes, dish) {
  timer.totalMs = minutes * 60 * 1000; timer.endAt = Date.now() + timer.totalMs; timer.paused = false; timer.dish = dish;
  setupCookingScene(); runCookIntro(); startTicking();
  document.getElementById('pause-cook-btn').textContent = 'Pause';
  showView('cooking');
}

function togglePauseCooking() {
  if (timer.paused) {
    timer.endAt = Date.now() + timer.remainingAtPauseMs; timer.paused = false;
    document.getElementById('pause-cook-btn').textContent = 'Pause'; setStage('Cooking in progress…'); cookAnimator.play('stir'); audio.startMusic(); startTicking();
  } else {
    timer.remainingAtPauseMs = Math.max(0, timer.endAt - Date.now()); timer.paused = true; clearIntroTimers();
    if (timer.tickHandle) clearInterval(timer.tickHandle); cookAnimator.stop(); audio.stopMusic();
    setStage('Paused'); document.getElementById('pause-cook-btn').textContent = 'Resume';
  }
}

function cancelCooking() {
  if (timer.tickHandle) clearInterval(timer.tickHandle); clearIntroTimers();
  if (cookAnimator) cookAnimator.stop(); audio.stopMusic(); timer.totalMs = 0; showView('home');
}

function finishCooking() {
  const dish = timer.dish;
  const recipe = recipeById(dish.id) || dish;
  const isNew = !state.unlocked.has(dish.id);
  if (isNew) { state.unlocked.add(dish.id); saveSet(STORAGE_KEY, state.unlocked); }
  updateDistillery(1); setPhase('present'); audio.stopMusic();
  document.getElementById('dish-image').src = asset(recipe.file);
  document.getElementById('dish-name').textContent = dish.name;
  document.getElementById('unlock-banner').classList.toggle('hidden', !isNew);
  updateBookBadge();
  new Animator(document.getElementById('chef-presenting'), state.data.chef.states).play('present');
  audio.ding(); showView('complete');
}

function updateBookBadge() { document.getElementById('book-count').textContent = state.unlocked.size; }

function renderRecipeBook() {
  const grid = document.getElementById('recipe-grid'); grid.innerHTML = '';
  for (const r of state.data.recipes.sprites) {
    const unlocked = state.unlocked.has(r.id);
    const card = document.createElement('div'); card.className = 'recipe-card' + (unlocked ? '' : ' locked');
    const img = document.createElement('img'); img.src = asset(r.file); img.alt = unlocked ? r.label : 'locked';
    const name = document.createElement('div'); name.className = 'rname'; name.textContent = unlocked ? r.label : '???';
    card.appendChild(img); card.appendChild(name); grid.appendChild(card);
  }
  document.getElementById('collection-complete').classList.toggle('hidden', state.unlocked.size < state.data.recipes.sprites.length);
}
function resetProgress() { state.unlocked = new Set(); saveSet(STORAGE_KEY, state.unlocked); updateBookBadge(); renderRecipeBook(); }

// ---------------------------------------------------------------------------
// Duration dial
// ---------------------------------------------------------------------------

let selectedMinutes = 25;
const DIAL_MAX = 180;
function tierLabel(m) { const t = tierForMinutes(m); return ['', 'Tier 1 · Quick prep', 'Tier 2 · Light meals', 'Tier 3 · Standard entrées', 'Tier 4 · Gourmet feasts'][t]; }
function setDialMinutes(m, { deselect = false } = {}) {
  selectedMinutes = m;
  document.getElementById('dial-readout').textContent = `${String(m).padStart(2, '0')}:00`;
  document.getElementById('dial-hand').style.transform = `translateX(-50%) rotate(${Math.min(m, DIAL_MAX) / DIAL_MAX * 360}deg)`;
  document.getElementById('tier-hint').textContent = tierLabel(m);
  if (deselect) document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
}
function wireSetup() {
  const buttons = document.querySelectorAll('.duration-btn'), range = document.getElementById('custom-range');
  buttons.forEach(btn => btn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('selected')); btn.classList.add('selected');
    if (btn.dataset.min === 'custom') { range.classList.remove('hidden'); setDialMinutes(Number(range.value)); }
    else { range.classList.add('hidden'); setDialMinutes(Number(btn.dataset.min)); }
  }));
  range.addEventListener('input', () => setDialMinutes(Number(range.value)));
  const dial = document.getElementById('dial'); let dragging = false;
  const mFromEvt = evt => { const r = dial.getBoundingClientRect(); const dx = evt.clientX - (r.left + r.width / 2), dy = evt.clientY - (r.top + r.height / 2); let a = Math.atan2(-dx, dy) * 180 / Math.PI; if (a < 0) a += 360; return Math.max(1, Math.round(a / 360 * DIAL_MAX)); };
  dial.addEventListener('pointerdown', e => { dragging = true; dial.setPointerCapture(e.pointerId); range.classList.remove('hidden'); const m = mFromEvt(e); range.value = Math.min(m, Number(range.max)); setDialMinutes(m, { deselect: true }); });
  dial.addEventListener('pointermove', e => { if (!dragging) return; const m = mFromEvt(e); range.value = Math.min(m, Number(range.max)); setDialMinutes(m, { deselect: true }); });
  dial.addEventListener('pointerup', () => { dragging = false; });
  dial.addEventListener('pointercancel', () => { dragging = false; });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function updateAudioButton() { const b = document.getElementById('audio-toggle'); b.textContent = audio.muted ? '🔇' : '🔊'; b.classList.toggle('muted', audio.muted); }

async function main() {
  await loadData();
  initHomeScene(); wireSetup(); updateBookBadge(); updateAudioButton(); setDialMinutes(25);

  document.getElementById('start-cooking-btn').addEventListener('click', () => { audio.ensure(); showView('setup'); });
  document.getElementById('back-to-home').addEventListener('click', () => showView('home'));
  document.getElementById('begin-timer-btn').addEventListener('click', () => runGatherSequence(chooseDish(selectedMinutes), selectedMinutes));
  document.getElementById('pause-cook-btn').addEventListener('click', togglePauseCooking);
  document.getElementById('cancel-cook-btn').addEventListener('click', cancelCooking);
  document.getElementById('done-btn').addEventListener('click', () => showView('home'));
  document.getElementById('nav-home').addEventListener('click', () => showView('home'));
  document.getElementById('nav-book').addEventListener('click', () => { renderRecipeBook(); showView('book'); });
  document.getElementById('reset-progress-btn').addEventListener('click', () => { if (confirm('Clear your recipe collection?')) resetProgress(); });
  document.getElementById('audio-toggle').addEventListener('click', () => { audio.ensure(); audio.setMuted(!audio.muted); updateAudioButton(); });
}

main();
