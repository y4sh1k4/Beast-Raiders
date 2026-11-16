// Live Sepolia token ID -> the beast shape engine.mjs expects, plus display fields.
// Replaces the kit's decodeBeast.mjs, which used the old 116-bit Loot Survivor layout.
// The live MOB contract uses the 251-bit layout in token-id.mjs (see beasts-hackathon skill).
// Pure ESM, no Node APIs: safe to import from server and the Vite client.

import {
  decodeTokenId, isGenesis, affixName, beastPower, BEAST_TYPES, SPECIES_NAMES,
} from './token-id.mjs';
import { beastKit } from './engine.mjs';

/** Genesis species 1-75 only; community species (10001+) are self-declared, so allowlist before paying real value. */
export const isGenesisSpecies = (speciesId) => BigInt(speciesId) >= 1n && BigInt(speciesId) <= 75n;

/**
 * Turns decoded fields into { tier, beastType, level, health, shiny } + names + kit.
 * Shiny: for species 1-75, visual_effects bit 0 selects the Shiny art.
 */
export function enrich(d, speciesName) {
  const sid = BigInt(d.speciesId);
  const baseName = speciesName ?? (isGenesisSpecies(sid) ? SPECIES_NAMES[Number(sid) - 1] : `Species #${sid}`);
  const affix = affixName(d);
  const beast = {
    speciesId: sid.toString(),
    tier: d.tier,
    beastType: d.beastType,
    level: d.level,
    health: d.health,
    prefix: d.prefix,
    suffix: d.suffix,
    shiny: (d.visualEffects ?? 0) & 1,
    visualEffects: d.visualEffects ?? 0,
    typeName: BEAST_TYPES[d.beastType],
    baseName,
    fullName: affix ? `"${affix}" ${baseName}` : `${baseName} (Genesis)`,
    isGenesis: isGenesis(d),
    community: !isGenesisSpecies(sid),
  };
  beast.power = beastPower(beast);
  beast.kit = beastKit(beast);
  return beast;
}

/** tokenId (bigint | decimal | 0x string) -> enriched beast. Throws TokenIdError on a bad ID. */
export const beastFromTokenId = (tokenId, speciesName) => enrich(decodeTokenId(tokenId), speciesName);

/** Off-chain demo beast for wallets with no Beasts. Demo runs can play but never claim. */
export const DEMO_BEAST = enrich({
  speciesId: 1n, tier: 1, beastType: 0, level: 100, health: 120, prefix: 1, suffix: 1, visualEffects: 0,
});
