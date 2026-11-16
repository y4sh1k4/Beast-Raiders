# Beast Raiders

Mines-style dungeon game on Starknet Sepolia where a Beast NFT's on-chain traits set its
abilities. React (Vite + TS) client, Node (Express 5, ESM) server, Cairo reward contract.
Time box: 2 hours. Favour a working end-to-end loop over extra features.

## Skills to load

- `beast-raiders`: rules, build plan, tested engine and contract. Read its SKILL.md first.
- `beasts-hackathon`: the **authoritative** source for the live Sepolia Beasts contracts:
  addresses, 251-bit token IDs, RPCs, reads. When it disagrees with `beast-nfts`, it wins.
- `beast-nfts`: Loot Survivor flavour (type triangle, combat rules). **Its token-ID layout
  (116-bit) and `decodeBeast.mjs` are outdated for Sepolia. Do not use them.**

## Corrections to the kit (verified against Sepolia on 2026-11-16)

- Token IDs are 251-bit (`beasts-v3-species-first-251-v2`). Decode with `shared/token-id.mjs`;
  `shared/beast.mjs` → `beastFromTokenId()` maps them to the engine's beast shape.
  `speciesId` replaces `id`; Shiny = `visualEffects & 1`. There is no `animated` field.
- `owner_of` / `token_uri` / `balance_of` take u256 `[low, high]`; Beasts-defined views
  (`get_beast`, `get_card_grade`, …) take one felt252.
- NFT (Sepolia): `0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1`.
- RPC: Cartridge Sepolia is dead (410). Use the event RPC (in `.env.example`); PublicNode for
  txs and plain reads; Zan for `token_uri` (PublicNode runs out of gas on it). Cache `token_uri`.
- Real Beasts have levels and health far from Loot Survivor ranges (e.g. L166 / H69). Retune the
  `beastKit` thresholds in `shared/engine.mjs` after sampling 10–20 beasts with
  `node .claude/skills/beasts-hackathon/scripts/beasts-read.mjs tokens <species>`.
- Community species (id ≥ 10001) self-declare tier/type: cap or allowlist rewards (`isGenesisSpecies`).

## Layout

```
contracts/  Scarb 2.18 + snforge 0.60 + OpenZeppelin v3   → snforge test
shared/     engine.mjs, token-id.mjs, beast.mjs (+ tests)  → cd shared && npm test
server/     Express API (see beast-raiders/references/api.md) → npm run dev
web/        Vite React TS                                   → npm run dev
```

## Commands

- Contracts: `cd contracts && scarb build && snforge test`. Versions are pinned in
  `contracts/.tool-versions` (asdf). Needs `~/.asdf/shims` and `~/.local/bin` (sierra compiler) on PATH.
- Shared: `cd shared && npm test` (Node 22 `--test` needs a glob, not a directory)
- Server: `cd server && npm run dev`
- Web: `cd web && npm run dev`
- Chain sanity: `node .claude/skills/beasts-hackathon/scripts/beasts-read.mjs stack`

## Rules

- Work through `beast-raiders/references/build-plan.md` in order; run the checkpoint at the end
  of each block before starting the next.
- Copy the tested reference files instead of rewriting them. If you change the claim hash,
  signing, or board generation, update both sides and rerun both test suites.
- Never expose `serverSeed` or trap positions from the server while a run is active.
- Never commit `.env` files, `accounts.json` or `SIGNER_PRIVATE_KEY`.
- Token IDs and amounts are BigInt in code and strings in JSON.
- Runs are staked (testnet GEM only): the player `transfer`s 1-1000 GEM to the house (`HOUSE_ADDRESS`,
  default the GEM contract) before a run; the server verifies the tx and pays `stake × multiplier` via `claim`.
- Contract addresses come from env vars, never hard-coded in app code.
