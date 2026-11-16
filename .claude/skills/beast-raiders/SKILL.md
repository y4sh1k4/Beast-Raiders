---
name: beast-raiders
description: Build Beast Raiders, a 2-hour Mines-style dungeon game where a player's Beast NFT traits set its abilities, with a React client, Node server and a Cairo GEM reward contract on Starknet Sepolia. Use for any work in this repo on game rules, the server API, the React UI, the reward contract, or claim signing.
---

# Beast Raiders

Read first: `references/game-rules.md` (what to build), `references/build-plan.md`
(order of work, with a checkpoint every ~20 minutes). Also load the `beast-nfts` skill for
anything that reads Beast data.

## Ready-made, tested pieces — copy them, don't rewrite them

| File | What it is | Status |
|---|---|---|
| `references/engine.mjs` | Pure game engine: kit from traits, provably fair board, reveal/peek/special/cash-out, client verify | `node --test references/engine.test.mjs` passes (7 tests) |
| `references/contracts/gem_rewards.cairo` | GEM ERC-20 with server-signed `claim` + daily `faucet` (OpenZeppelin v3) | Compiles with Scarb 2.18; signature check verified against a starknet.js signature |
| `references/contracts/test_gem_rewards.cairo` | snforge tests: claim, replay, wrong caller, inflated amount, faucet | Uses the fixture below |
| `fixtures/claim-signature.json` | Test-only key + signature made by starknet.js | Proves JS ↔ Cairo hashing matches |
| `references/api.md` | HTTP API between React and Node, plus the claim-signing code | |
| `../beast-nfts/scripts/decodeBeast.mjs` | Token ID → traits | Self-tests |

## Repo layout to create

```
contracts/   Scarb project (copy Scarb.toml, src/lib.cairo ← gem_rewards.cairo, tests/)
server/      Node 20+, Express, ESM. Imports ../shared/engine.mjs
shared/      engine.mjs, decodeBeast.mjs, beasts-data.json
web/         Vite + React + TypeScript. Imports ../shared/engine.mjs for verify + kit display
```

## Non-negotiables

- The server is the only holder of `serverSeed` and the trap layout until a run ends. Never
  send `run.traps` or `serverSeed` from `publicView()` while `status === 'active'`.
- The client sends a `clientSeed`; the server returns `commit = sha256(serverSeed)` *before*
  the first reveal. After the run, the client calls `verifyRun()` and shows ✅/❌.
- Claim message is exactly `poseidon_hash_span([contract, player, amount.low, amount.high, nonce])`
  (starknet.js `hash.computePoseidonHashOnElements`), signed with `ec.starkCurve.sign`.
  Change both sides together or the fixture test catches it.
- Rewards go to the beast **owner** (`owner_of`), and the contract mints to the **caller**,
  so a spoofed address can only ever pay the real owner. Still check `owner_of` before
  starting a run.
- Free-to-play: runs cost Stamina (off-chain), never a token stake. Do not add wagering of
  GEM on outcomes.
- Secrets: `SIGNER_PRIVATE_KEY` lives only in `server/.env`. Never in `web/`, never committed.
- BigInt for token IDs and amounts everywhere; serialize as decimal strings in JSON.

## Toolchain (match the Beasts repo)

Scarb 2.18.0, Starknet Foundry (snforge/sncast) 0.60.0, OpenZeppelin cairo-contracts v3.0.0,
starknet.js v10 (`RpcProvider`, `Account`, `Contract`, `hash`, `ec`, `CallData`, `cairo.uint256`).
Check installed versions with `scarb --version`, `snforge --version`, `npm ls starknet` before
writing version-specific code; if a newer major is installed, read its changelog for renamed APIs.

## Done means

1. `snforge test` green in `contracts/`.
2. `node --test` green in `shared/`.
3. Demo path works end-to-end on Sepolia: connect wallet → pick beast (or demo beast) →
   play → cash out → claim GEM tx → balance updates → "Verify fairness" shows ✅.
