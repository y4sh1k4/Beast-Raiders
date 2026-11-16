# 2-hour build plan

Each block ends with a checkpoint you can demo. If a block runs over by 10 minutes, cut the
lowest item in it and move on — a working loop beats a complete feature list.

## 0:00–0:15 · Scaffold

- Create `contracts/`, `server/`, `shared/`, `web/` (see SKILL.md layout).
- Copy into `shared/`: `engine.mjs`, `engine.test.mjs`, `decodeBeast.mjs`, `beasts-data.json`
  (fix the JSON import path in `decodeBeast.mjs`).
- `web/`: `npm create vite@latest web -- --template react-ts`.
- `server/`: `npm init -y`, add `"type": "module"`, install `express cors dotenv starknet`.
- ✅ `node --test shared/` green.

## 0:15–0:35 · Contract

- `contracts/`: copy `Scarb.toml`, `gem_rewards.cairo` → `src/lib.cairo`,
  `test_gem_rewards.cairo` → `tests/`. `snforge test`.
- Generate the signer key, compute its public key.
- Declare + deploy to Sepolia with `sncast` (constructor: `owner`, `signer_pubkey`). Save the
  address to both `.env` files.
- ✅ Tests green; contract on Voyager; `faucet` works from sncast.

## 0:35–1:00 · Server

- Express app with the endpoints in `api.md`; in-memory runs, stamina, leaderboard.
- Ownership + beast listing via RPC; demo beast path.
- `signClaim` on cash-out.
- ✅ Play a whole demo run with `curl`.

## 1:00–1:40 · React

- Wallet connect, GEM balance, faucet button.
- Beast picker (cards with image, name, Type/Tier/Level/Health, kit icons, stamina).
- Board screen: grid, shields/peeks/special, multiplier, cash out, trap-type toast
  ("Countered!", "-2 shields").
- Result screen: reward, Claim button (tx), Verify fairness.
- ✅ Real Sepolia run → claim → balance goes up.

## 1:40–2:00 · Polish and demo

- Leaderboard panel. Pixel-font theme, tier-colored card borders, rainbow border for Shiny.
- README with how to run + 60-second demo script.
- ✅ Record the demo path once end-to-end.

## Demo script (60 s)

1. "Every Beast plays differently because the game reads its on-chain traits."
2. Show two Beasts' kits side by side (a T1 Magic vs a T5 Hunter).
3. Play: peek, reveal, hit a countered trap ("Magic beats Brute"), cash out.
4. Claim GEM on Sepolia; balance updates.
5. Verify fairness ✅.
