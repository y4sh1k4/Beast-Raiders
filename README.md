# 🐉 Beast Raiders

**A provably fair, Mines-style dungeon game on Starknet in which your Beast NFT's on-chain traits decide how it plays.**

Send one of your Beasts into a 5×5 dungeon. Each safe tile you reveal raises your multiplier. Cash out before a trap gets you, then claim your **GEM** reward on-chain.

> Live on **Starknet Sepolia**. GEM contract: [`0x0654…77fb`](https://sepolia.voyager.online/contract/0x0654329ce90f8f2a986a10be40faa1982ce6837d8fa70030a7617eabe30e77fb)

---

## ✨ How it plays

1. **Connect your wallet** (Argent X / Braavos). The game reads the Beasts you own straight from the Beasts NFT contract.
2. **Pick a Beast.** Its real traits become its kit:

   | Trait | Ability |
   |---|---|
   | **Health** | 🛡️ Shields: traps you can survive (0–2) |
   | **Level** | 👁️ Peeks: check a tile without revealing it |
   | **Tier** | 📈 Multiplier bonus (T1 ×1.20 … T5 ×1.00) |
   | **Type** | Trap matchups and one special move per run |
   | **Shiny** | +1 peek and a rainbow card border |

3. **Stake GEM and pick a difficulty**: Easy (3 traps), Normal (5) or Hard (8).
4. **Raid.** Traps are typed (Magic / Hunter / Brute) and follow a triangle: *Brute > Hunter > Magic > Brute*. If your type beats the trap, the hit is countered for free.
   - 🔮 **Magic, Scry:** learn how many traps are in a row
   - 🏹 **Hunter, Track:** reveal a tile and disarm it if it's a trap
   - 🪓 **Brute, Smash:** the next trap you hit costs no shields
5. **Cash out.** You get `stake × multiplier`. The server signs the reward and you claim it on-chain.
6. **Verify fairness ✅.** Your browser rebuilds the board from the revealed seed and checks it.

Each Beast gets 3 runs (Stamina) per day. There is also a daily leaderboard and a +100 GEM faucet. If your wallet holds no Beasts, the **Practice Arena** lends you real Sepolia Beasts with no stamina limit. With a wallet connected you stake and win real testnet GEM there too. Without one, practice raids are free play.

## 🔐 Provably fair

- At the start of a run the server commits to `sha256(serverSeed)`. The player supplies a `clientSeed`.
- Tile `i` gets the hash `sha256("serverSeed:clientSeed:i")`. The tiles with the lowest hashes are the traps, and the last byte of each hash sets the trap's type.
- The server never sends `serverSeed` or trap positions while a run is active. It reveals the seed when the run ends, and the client re-derives the whole board to check it.

## 💎 On-chain rewards

`GemRewards` is an OpenZeppelin v3 ERC-20 with two extra functions:

- `claim(amount, nonce, r, s)` checks a server signature over
  `poseidon(contract, player, amount.low, amount.high, nonce)` and mints the amount **to the caller**. Each nonce works only once.
- `faucet()` gives 100 GEM per address every 24 hours.

Rewards are paid to the Beast's `owner_of`, so a spoofed address can never collect them. Everything runs on **testnet** with testnet GEM only.

## 🏗️ Architecture

```
web/        React + Vite + TypeScript: wallet, Beast cards, dungeon board, fairness check
server/     Node + Express (ESM): runs, stamina, stake checks, claim signing, Beast reads
shared/     Pure game engine + 251-bit Beast token-ID decoder (used by server AND client)
contracts/  Cairo GemRewards contract (Scarb 2.18, snforge 0.60, OpenZeppelin v3)
```

```
 Wallet ──stake tx / claim tx──▶ Starknet Sepolia (Beasts NFT, GemRewards)
   │                                      ▲
   ▼                                      │ owner_of, token_uri, tx checks
 React ──HTTP──▶ Express server ──────────┘
   └── shared/engine.mjs ◀── same engine on both sides → client-side verification
```

## 🚀 Run it locally

**Prerequisites:** Node 22+, [Scarb 2.18.0 and Starknet Foundry 0.60.0](https://foundry-rs.github.io/starknet-foundry/) (versions pinned in `contracts/.tool-versions`), and a Starknet Sepolia wallet.

```bash
# 1. Engine tests
cd shared && npm install && npm test

# 2. Contract tests
cd ../contracts && scarb build && snforge test

# 3. Server
cd ../server && npm install
cp .env.example .env          # fill in GEM_ADDRESS and SIGNER_PRIVATE_KEY
npm run dev                   # http://localhost:8787

# 4. Web
cd ../web && npm install
cp .env.example .env          # set VITE_GEM_ADDRESS
npm run dev
```

### Environment variables

| File | Variable | Purpose |
|---|---|---|
| `server/.env` | `STARKNET_RPC_URL` | Sepolia RPC |
| | `BEASTS_ADDRESS` | Beasts NFT contract |
| | `GEM_ADDRESS` | Deployed `GemRewards` |
| | `HOUSE_ADDRESS` | Where stakes go (defaults to the GEM contract) |
| | `SIGNER_PRIVATE_KEY` | Signs claims. **Keep it secret; it is never committed.** |
| | `ALLOW_DEMO` | Turns on the demo Beast |
| `web/.env` | `VITE_API_URL`, `VITE_GEM_ADDRESS`, `VITE_BEASTS_ADDRESS`, `VITE_CHAIN` | Client config |

### Deploying your own GEM contract

```bash
cd contracts
sncast account create --network sepolia --name deployer   # then fund it with Sepolia STRK
sncast account deploy --network sepolia --name deployer
sncast --account deployer declare --network sepolia --contract-name GemRewards
sncast --account deployer deploy  --network sepolia --class-hash <CLASS_HASH> \
  --arguments '<owner_address>, <signer_public_key>'
```

The signer public key is `ec.starkCurve.getStarkKey(SIGNER_PRIVATE_KEY)` from starknet.js. If you rotate the server key, call `set_signer` from the owner account. Declaring the contract costs about 15 STRK on Sepolia.

## 🌐 API

| Method | Path | |
|---|---|---|
| GET | `/api/config` | Claim and demo flags, stake limits, difficulties |
| GET | `/api/beasts?owner=` | A wallet's Beasts with their kits |
| GET | `/api/beasts/demo` · `/api/beasts/showcase` | Demo and showcase Beasts |
| GET | `/api/beasts/:tokenId` · `/image` | One Beast, its art |
| GET | `/api/gem/:address` | GEM balance |
| POST | `/api/runs` | Start a run (verifies the stake tx) and return the commit |
| POST | `/api/runs/:id/reveal` · `peek` · `special` | Play |
| POST | `/api/runs/:id/cashout` · `flee` | End the run, reveal the seed, sign the claim |
| GET | `/api/runs/:id` · `/api/leaderboard` | Run state, today's top runs |

## 🧰 Tech

Cairo · OpenZeppelin Cairo v3 · Scarb · Starknet Foundry · starknet.js v10 · React 19 · Vite · Express 5

---

Built for the Beasts hackathon. Testnet only, with no real-money value.
