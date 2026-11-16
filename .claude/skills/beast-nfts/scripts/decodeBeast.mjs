// Reference implementation: decode a Beasts NFT token ID (new 116-bit format)
// into its traits. Mirrors src/pack.cairo in github.com/Provable-Games/beasts.
// Zero dependencies. Copy into shared/ and import from both server and client.
//
// IMPORTANT: Only token IDs minted by the *new* deterministic-ID contract decode.
// Legacy collection IDs (small sequential numbers) decode with tier 0 and are
// rejected; for those, call get_beast(token_id) on-chain (see SKILL.md).

// Node-only as written (reads JSON from disk). For the browser, replace the two lines
// below with: import DATA from './beasts-data.json' (Vite supports JSON imports).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = [join(here, 'beasts-data.json'), join(here, '../references/beasts-data.json')].find(existsSync);
const DATA = JSON.parse(readFileSync(dataPath, 'utf8'));

export const TYPE_NAMES = ['Magic', 'Hunter', 'Brute'];

// [field, bit width] — low bits first. Total 116 bits.
const LAYOUT = [
  ['id', 64], ['prefix', 7], ['suffix', 5], ['level', 16], ['health', 16],
  ['shiny', 1], ['animated', 1], ['tier', 3], ['beastType', 3],
];

export function decodeTokenId(tokenId) {
  let v = BigInt(tokenId);
  const out = {};
  for (const [field, bits] of LAYOUT) {
    const mask = (1n << BigInt(bits)) - 1n;
    out[field] = v & mask;
    v >>= BigInt(bits);
  }
  if (v !== 0n) throw new Error('invalid token id: more than 116 bits');
  const b = Object.fromEntries(
    Object.entries(out).map(([k, x]) => [k, k === 'id' ? x : Number(x)]),
  );
  if (b.id === 0n) throw new Error('invalid beast id');
  if (b.tier < 1 || b.tier > 5) throw new Error('invalid tier (legacy token id?)');
  if (b.beastType > 2) throw new Error('invalid type');
  if (b.prefix > 69 || b.suffix > 18) throw new Error('invalid affix');
  if ((b.prefix === 0) !== (b.suffix === 0)) throw new Error('invalid affix combo');
  return enrich(b);
}

export function encodeTokenId(b) {
  let v = 0n, shift = 0n;
  for (const [field, bits] of LAYOUT) {
    v |= BigInt(b[field]) << shift;
    shift += BigInt(bits);
  }
  return v;
}

/** Add display name, type name and power. Works for any {id,prefix,suffix,level,tier,beastType,...}. */
export function enrich(b) {
  const idNum = Number(b.id);
  const species = DATA.species.find((s) => s.id === idNum); // undefined for community species (76+)
  const prefixName = b.prefix ? DATA.prefixes[b.prefix - 1] : null;
  const suffixName = b.suffix ? DATA.suffixes[b.suffix - 1] : null;
  const baseName = species?.name ?? `Beast #${idNum}`;
  return {
    ...b,
    id: idNum,
    typeName: TYPE_NAMES[b.beastType],
    baseName,
    prefixName,
    suffixName,
    // Loot Survivor naming: "<Prefix> <Suffix>" "<Beast>", e.g. "Agony Bane" Warlock
    fullName: prefixName ? `"${prefixName} ${suffixName}" ${baseName}` : `${baseName} (Genesis)`,
    power: b.level * (6 - b.tier),
    isGenesis: b.prefix === 0 && b.suffix === 0,
  };
}

// Self-test: node decodeBeast.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sample = { id: 1n, prefix: 1, suffix: 1, level: 42, health: 500, shiny: 1, animated: 0, tier: 1, beastType: 0 };
  const id = encodeTokenId(sample);
  const d = decodeTokenId(id);
  console.log('token id', '0x' + id.toString(16));
  console.log(d);
  if (d.fullName !== '"Agony Bane" Warlock' || d.power !== 210 || d.typeName !== 'Magic') {
    throw new Error('self-test failed');
  }
  try { decodeTokenId(17n); throw new Error('legacy id should fail'); }
  catch (e) { if (!/tier/.test(e.message)) throw e; }
  console.log('self-test ok');
}
