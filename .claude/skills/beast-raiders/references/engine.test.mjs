// node --test engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.mjs';

const warlock = { tier: 1, beastType: 0, level: 42, health: 700, shiny: 1 }; // Magic T1
const rat = { tier: 5, beastType: 1, level: 3, health: 40, shiny: 0 };       // Hunter T5

test('kit from traits', () => {
  assert.deepEqual(E.beastKit(warlock), { shields: 2, peeks: 5 - 1, tierBonus: 1.2, special: 'scry', typeName: 'Magic' });
  assert.equal(E.beastKit(rat).shields, 0);
  assert.equal(E.beastKit(rat).peeks, 0);
});

test('type triangle matches Loot Survivor', () => {
  const [M, H, B] = [0, 1, 2];
  assert.ok(E.beats(B, H) && E.beats(H, M) && E.beats(M, B));
  assert.ok(!E.beats(H, B) && !E.beats(M, M));
  assert.equal(E.trapDamage(M, B), 0);
  assert.equal(E.trapDamage(M, H), 2);
  assert.equal(E.trapDamage(M, M), 1);
});

test('board is deterministic and has the right trap count', async () => {
  const a = await E.generateBoard('s', 'c', 5);
  const b = await E.generateBoard('s', 'c', 5);
  assert.equal(a.traps.size, 5);
  assert.deepEqual([...a.traps], [...b.traps]);
});

test('multiplier grows and tier bonus applies', () => {
  assert.equal(E.multiplier(0, 5), 1);
  assert.ok(E.multiplier(3, 5) > E.multiplier(2, 5));
  assert.ok(E.multiplier(3, 5, 1.2) > E.multiplier(3, 5, 1));
});

test('full run: reveal safe tiles, cash out, verify', async () => {
  const run = await E.createRun({ beast: warlock, clientSeed: 'player-seed', serverSeed: 'fixed' });
  const safe = [...Array(25).keys()].filter((t) => !run.traps.has(t));
  E.reveal(run, safe[0]);
  E.reveal(run, safe[1]);
  assert.equal(E.publicView(run).serverSeed, undefined, 'seed hidden while active');
  const { reward } = E.cashOut(run);
  assert.ok(reward >= 10);
  assert.deepEqual(await E.verifyRun(E.publicView(run)), { ok: true });
});

test('rat dies on first non-countered trap', async () => {
  const run = await E.createRun({ beast: rat, clientSeed: 'x', serverSeed: 'y', difficulty: 'hard' });
  const [tile, trapType] = [...run.traps].find(([, t]) => E.trapDamage(1, t) > 0);
  const r = E.reveal(run, tile);
  assert.equal(r.survived, false);
  assert.equal(run.status, 'lost');
  assert.throws(() => E.cashOut(run));
});

test('smash makes the next trap free', async () => {
  const brute = { tier: 3, beastType: 2, level: 20, health: 100, shiny: 0 };
  const run = await E.createRun({ beast: brute, clientSeed: 'a', serverSeed: 'b', difficulty: 'hard' });
  E.useSpecial(run);
  const [tile] = [...run.traps].find(([, t]) => E.trapDamage(2, t) > 0);
  assert.equal(E.reveal(run, tile).survived, true);
});
