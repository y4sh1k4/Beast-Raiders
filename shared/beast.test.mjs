// node --test shared/
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTokenId } from './token-id.mjs';
import { beastFromTokenId, DEMO_BEAST } from './beast.mjs';

const PERFECT = {
  centeringXBps: 10000, centeringXDirection: 0, centeringYBps: 10000, centeringYDirection: 0,
  hickeyCount: 0, hickeysInArt: 0, voidLevel: 0, voidsInArt: 0, rollerLevel: 0, rollersInArt: 0,
  edgeChipLevel: 0, cornerChipLevel: 0,
};

const id = encodeTokenId({
  speciesId: 1n, prefix: 63, suffix: 4, level: 42, health: 700, tier: 1, beastType: 0,
  visualEffects: 1, soundEffects: 1, transferDamageChance: 0, transferLockHours: 0n,
  mintedAtMinute: 29000000, mintedAtBlockNumber: 1000n, minterData: 0, condition: PERFECT,
});

test('251-bit token id -> engine beast shape', () => {
  const b = beastFromTokenId(id.toString());
  assert.equal(b.fullName, '"Victory Song" Warlock');
  assert.equal(b.typeName, 'Magic');
  assert.equal(b.shiny, 1);
  assert.equal(b.power, 210);
  assert.deepEqual(b.kit, { shields: 2, peeks: 1, tierBonus: 1.2, special: 'scry', typeName: 'Magic' });
});

test('demo beast is a Magic T1 Warlock', () => {
  assert.equal(DEMO_BEAST.fullName, '"Agony Bane" Warlock');
  assert.equal(DEMO_BEAST.kit.special, 'scry');
});
