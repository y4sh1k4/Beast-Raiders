---
name: beast-nfts
description: Read, decode and display Loot Survivor Beast NFTs on Starknet (traits, token IDs, ownership, images). Use whenever code touches Beast token IDs, Beast traits (Type, Tier, Level, Health, Prefix, Suffix, Shiny, Animated, Power), the Beasts contract, or Beast art.
---

# Beast NFTs

Beasts are fully on-chain ERC-721s on Starknet from Provable Games (Loot Survivor).
Source of truth: github.com/Provable-Games/beasts (`src/pack.cairo`, `src/interfaces.cairo`,
`src/beast_definitions.cairo`, `src/metadata_generator.cairo`).

## The traits (exact names used in tokenURI metadata)

| trait_type | Values | Notes |
|---|---|---|
| `Beast` | species name, e.g. Warlock | 75 genesis species (ids 1–75); community species are 76+ |
| `Type` | `Magic` / `Hunter` / `Brute` | code 0 / 1 / 2 |
| `Tier` | 1–5 | 1 = Legendary, 5 = Very Common; fixed per species |
| `Prefix` | 69 names, e.g. Agony | 0 = none (Genesis token only) |
| `Suffix` | 18 names, e.g. Bane | 0 = none (Genesis token only) |
| `Level` | u16 | |
| `Health` | u16 | |
| `Power` | `Level × (6 − Tier)` | derived |
| `Rank` | rank within species by power | live, changes as more mint |
| `Shiny`, `Animated` | 0/1 | visual variants |
| `Adventurers Killed`, `Last Killed By` | counters | live stats |

Display name convention: `"<Prefix> <Suffix>" <Beast>` → `"Agony Bane" Warlock`.

Type triangle (Loot Survivor combat, ±50% damage): **Brute beats Hunter, Hunter beats Magic,
Magic beats Brute.** In code with Magic=0, Hunter=1, Brute=2: `a beats b ⇔ (b − a + 3) % 3 === 2`.

Full tables: `references/beasts-data.json` (75 species with id/name/tier/type, 69 prefixes,
18 suffixes; index `prefixes[p-1]`, `suffixes[s-1]`). Combat rules: `references/combat-rules.md`.

## Reading a Beast — pick the cheapest path that works

1. **Decode the token ID (no RPC).** In the current contract a token ID *is* the packed beast
   (116 bits, low → high: id 64, prefix 7, suffix 5, level 16, health 16, shiny 1, animated 1,
   tier 3, type 3). Use `scripts/decodeBeast.mjs` (`decodeTokenId`, `encodeTokenId`, `enrich`).
   It throws on legacy-format IDs (they decode with tier 0) → fall back to 2.
2. **`get_beast(token_id: u256)`** on the Beasts contract. Returns `PackableBeast`
   `{id, prefix, suffix, level, health, shiny, animated, tier, beast_type}`. Older deployments
   return only the first 7 fields: take tier and type from `beasts-data.json` by `id`.
   ```js
   const [lo, hi] = [id & ((1n << 128n) - 1n), id >> 128n];
   const r = await provider.callContract({ contractAddress: BEASTS, entrypoint: 'get_beast', calldata: [lo, hi] });
   const [sid, prefix, suffix, level, health, shiny, animated, tier, type] = r.map(BigInt);
   ```
   Raw `callContract` avoids ABI-version mismatches between deployments.
3. **`token_uri(token_id)`** returns `data:application/json;base64,…` with the attributes
   above and an SVG image (`data:image/svg+xml;base64,…`). Use this for the card image;
   parse `attributes[]` by `trait_type` only if 1 and 2 are not available.

Ownership: `owner_of(token_id)` (u256 calldata as `[low, high]`). To list a wallet's beasts:
`balance_of(owner)` then `token_of_owner_by_index(owner, i)` (current contract). If that
entrypoint is missing on the deployment you target, let the player paste a token ID and
verify with `owner_of` — do not build an indexer in a 2-hour scope.

## Addresses — never hard-code, read from env

- `BEASTS_ADDRESS` — set from the event organizers' Sepolia collection (the beastathon tool
  mints community beasts there). Mainnet references, for information only:
  docs.provable.games lists `0xf739e402e52830a736335a0f47d58ec78ba067443c9c6930da182eab2ff8b0`;
  the repo README links `0x046da8955829adf2bda310099a0063451923f02e648cf25a1203aac6335cf0e4`.
  Confirm on Voyager/Starkscan before using either.
- `STARKNET_RPC_URL` — e.g. the event RPC `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe (Cartridge Sepolia is discontinued, HTTP 410)`.

## Rules when writing code

- Token IDs exceed 2^53: always `BigInt` in JS, strings in JSON, `[low, high]` felts in calldata.
- Community species (id > 75) are not in `beasts-data.json`; tier/type come from the token
  ID or `get_beast`. Treat their tier as self-declared (the Beasts design doc warns games to
  allowlist species), so cap rewards or allowlist ids for anything with real value.
- Art is CC0 only where the creator confirmed it; reuse the on-chain `token_uri` image rather
  than copying art into the repo.
- Run `node scripts/decodeBeast.mjs` after editing the decoder; it self-tests.
