// Beast Raiders — reference game engine. Pure functions, zero dependencies.
// Runs unchanged in Node 18+ and the browser (uses globalThis.crypto.subtle).
// Copy to shared/engine.mjs. The server is the only place that calls
// createRun/reveal/cashOut with the real seed; the client only uses
// verifyRun() after the seed is revealed, plus beastKit() for display.

export const GRID = 25;
export const DIFFICULTY = { easy: 3, normal: 5, hard: 8 }; // trap counts
export const BASE_REWARD = 10;   // GEM per 1.00x
export const HOUSE_EDGE = 0.97;
export const TYPE_NAMES = ['Magic', 'Hunter', 'Brute'];

// ---------- traits -> kit ----------

/**
 * beast: { tier 1..5, beastType 0|1|2, level, health, shiny 0|1 }
 * Thresholds are first guesses: tune after looking at real Beasts (see game-rules.md).
 */
export function beastKit(beast) {
  // Tuned on ~40 live Sepolia beasts (2026-11-16): most are L100/H100, range L25-181, H69-709.
  const shields = beast.health >= 500 ? 2 : beast.health >= 90 ? 1 : 0;
  const peeks = (beast.level >= 150 ? 2 : beast.level >= 50 ? 1 : 0) + (beast.shiny ? 1 : 0);
  const tierBonus = 1 + 0.05 * (5 - beast.tier); // T1 1.20x ... T5 1.00x
  const special = ['scry', 'track', 'smash'][beast.beastType];
  return { shields, peeks, tierBonus, special, typeName: TYPE_NAMES[beast.beastType] };
}

/** Loot Survivor triangle: Brute > Hunter > Magic > Brute. Codes: Magic 0, Hunter 1, Brute 2. */
export const beats = (a, b) => (b - a + 3) % 3 === 2;

/** Shields a trap costs this beast: 0 if the beast counters it, 2 if the trap counters the beast, else 1. */
export function trapDamage(beastType, trapType) {
  if (beats(beastType, trapType)) return 0;
  if (beats(trapType, beastType)) return 2;
  return 1;
}

export function multiplier(safeCount, trapCount, tierBonus = 1) {
  let m = 1;
  for (let i = 0; i < safeCount; i++) m *= (GRID - i) / (GRID - trapCount - i);
  return safeCount === 0 ? 1 : Math.floor(m * HOUSE_EDGE * tierBonus * 100) / 100;
}

// ---------- provably fair board ----------

async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSeed() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const commitFor = (serverSeed) => sha256Hex(serverSeed);

/** Returns { traps: Map<tile, trapType> }. Deterministic from the seeds. */
export async function generateBoard(serverSeed, clientSeed, trapCount) {
  const scored = [];
  for (let i = 0; i < GRID; i++) scored.push({ i, h: await sha256Hex(`${serverSeed}:${clientSeed}:${i}`) });
  scored.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const traps = new Map();
  for (const { i, h } of scored.slice(0, trapCount)) traps.set(i, parseInt(h.slice(-2), 16) % 3);
  return { traps };
}

// ---------- run state machine (server side) ----------

export async function createRun({ beast, clientSeed, difficulty = 'normal', serverSeed = randomSeed() }) {
  const trapCount = DIFFICULTY[difficulty];
  if (!trapCount) throw new Error('bad difficulty');
  const kit = beastKit(beast);
  const { traps } = await generateBoard(serverSeed, clientSeed, trapCount);
  return {
    serverSeed, clientSeed, trapCount, difficulty,
    commit: await commitFor(serverSeed),
    beastType: beast.beastType, kit,
    shields: kit.shields, peeks: kit.peeks, specialUsed: false, smashArmed: false,
    traps, revealed: new Map(), // tile -> {safe, trapType?, damage?}
    safeCount: 0, status: 'active', // active | lost | cashed
  };
}

/** Public view: never includes serverSeed or unrevealed traps while active. */
export function publicView(run) {
  const done = run.status !== 'active';
  return {
    status: run.status, difficulty: run.difficulty, trapCount: run.trapCount, commit: run.commit,
    clientSeed: run.clientSeed, shields: run.shields, peeks: run.peeks, kit: run.kit,
    specialUsed: run.specialUsed, safeCount: run.safeCount,
    multiplier: multiplier(run.safeCount, run.trapCount, run.kit.tierBonus),
    revealed: Object.fromEntries(run.revealed),
    ...(done ? { serverSeed: run.serverSeed, traps: Object.fromEntries(run.traps) } : {}),
  };
}

function assertTile(run, tile) {
  if (run.status !== 'active') throw new Error('run is over');
  if (!Number.isInteger(tile) || tile < 0 || tile >= GRID) throw new Error('bad tile');
  if (run.revealed.has(tile)) throw new Error('already revealed');
}

export function reveal(run, tile) {
  assertTile(run, tile);
  if (!run.traps.has(tile)) {
    run.revealed.set(tile, { safe: true });
    run.safeCount++;
    if (run.safeCount === GRID - run.trapCount) run.status = 'cashed'; // cleared the board
    return { tile, safe: true };
  }
  const trapType = run.traps.get(tile);
  let damage = trapDamage(run.beastType, trapType);
  if (run.smashArmed && damage > 0) { damage = 0; run.smashArmed = false; }
  run.shields -= damage;
  const survived = run.shields >= 0;
  if (!survived) { run.shields = 0; run.status = 'lost'; }
  run.revealed.set(tile, { safe: false, trapType, damage });
  return { tile, safe: false, trapType, damage, survived };
}

export function peek(run, tile) {
  assertTile(run, tile);
  if (run.peeks <= 0) throw new Error('no peeks left');
  run.peeks--;
  return { tile, safe: !run.traps.has(tile) };
}

/** scry: arg = row 0..4 -> trap count in that row. track: arg = tile -> disarm if trap. smash: next trap is free. */
export function useSpecial(run, arg) {
  if (run.status !== 'active') throw new Error('run is over');
  if (run.specialUsed) throw new Error('special already used');
  run.specialUsed = true;
  const s = run.kit.special;
  if (s === 'scry') {
    if (!Number.isInteger(arg) || arg < 0 || arg > 4) throw new Error('bad row');
    let n = 0;
    for (let c = 0; c < 5; c++) if (run.traps.has(arg * 5 + c)) n++;
    return { special: s, row: arg, traps: n };
  }
  if (s === 'track') {
    assertTile(run, arg);
    const isTrap = run.traps.has(arg);
    run.revealed.set(arg, isTrap ? { safe: false, trapType: run.traps.get(arg), damage: 0, disarmed: true } : { safe: true });
    if (!isTrap) run.safeCount++;
    return { special: s, tile: arg, safe: !isTrap };
  }
  run.smashArmed = true;
  return { special: s, armed: true };
}

export function cashOut(run) {
  if (run.status === 'lost') throw new Error('run lost');
  if (run.safeCount === 0) throw new Error('reveal at least one tile');
  run.status = 'cashed';
  const m = multiplier(run.safeCount, run.trapCount, run.kit.tierBonus);
  return { multiplier: m, reward: Math.floor(BASE_REWARD * m) };
}

/** Client-side check after the run: seed matches commit and board matches what was shown. */
export async function verifyRun(view) {
  if ((await commitFor(view.serverSeed)) !== view.commit) return { ok: false, reason: 'commit mismatch' };
  const { traps } = await generateBoard(view.serverSeed, view.clientSeed, view.trapCount);
  for (const [tile, r] of Object.entries(view.revealed)) {
    const isTrap = traps.has(Number(tile));
    if (isTrap === r.safe) return { ok: false, reason: `tile ${tile} mismatch` };
  }
  return { ok: true };
}
