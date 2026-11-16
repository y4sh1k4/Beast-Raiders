# Beast Raiders — game rules (2-hour scope)

One line: send your Beast into a 5×5 dungeon, reveal tiles to grow a multiplier, cash out
before the traps get you. Your Beast's real on-chain traits decide how it plays.

## Core loop

1. Connect wallet → see owned Beasts as cards (image from `token_uri`, name, traits, kit).
2. Pick a Beast and difficulty (Easy 3 traps / Normal 5 / Hard 8). Costs 1 Stamina.
3. Server commits to a board (shows `commit` hash). Player reveals tiles.
4. Safe tile → multiplier goes up. Trap → shields absorb it or the run is lost.
5. Cash out any time after ≥1 safe tile → reward = `floor(10 GEM × multiplier)`.
6. Claim → wallet signs `claim(amount, nonce, r, s)` on `GemRewards` → GEM minted.
7. "Verify fairness" → client recomputes the board from the revealed seed.

## Trait → ability mapping (real Beast trait names)

| Trait | Ability | Formula (in `engine.mjs` → `beastKit`) |
|---|---|---|
| **Health** | Shields (trap hits survived) | ≥600 → 2, ≥250 → 1, else 0 |
| **Level** | Peeks (check a tile without revealing) | `min(3, floor(level / 10))` |
| **Tier** | Multiplier bonus | `1 + 0.05 × (5 − tier)` → T1 ×1.20 … T5 ×1.00 |
| **Type** | Trap matchups + one special move per run | see below |
| **Shiny** | +1 peek and a rainbow card border | |
| **Prefix + Suffix** | Display name `"Agony Bane" Warlock` | cosmetic |
| **Power** | Leaderboard tie-break and card stat | `level × (6 − tier)` |

Health/Level thresholds are first guesses. Before tuning, decode 10–20 real Beasts from the
Sepolia collection and look at the spread; aim for most Beasts to get 1 shield and 1–2 peeks.

### Typed traps (uses the Loot Survivor triangle)

Each trap has a type (Magic / Hunter / Brute), shown when hit.

| Beast vs trap | Shields lost |
|---|---|
| Beast's type beats trap type | 0 — "Countered!" |
| Same type | 1 |
| Trap's type beats beast | 2 |

Brute beats Hunter, Hunter beats Magic, Magic beats Brute. If shields would drop below 0 the
run is lost. A countered or absorbed trap does not raise the multiplier.

### Special move (once per run, by Type)

| Type | Move | Effect |
|---|---|---|
| Magic | **Scry** | Pick a row → learn how many traps are in it |
| Hunter | **Track** | Pick a tile → reveal it; if it's a trap it is disarmed, no damage |
| Brute | **Smash** | The next trap you hit costs 0 shields |

## Multiplier

`m(k) = floor(0.97 × Π_{i<k} (25 − i) / (25 − traps − i) × tierBonus, 2 dp)`, where `k` is
the number of safe tiles. Normal (5 traps), T3 beast (×1.10): 1 tile = 1.33×, 3 tiles = 2.15×,
5 tiles = 3.65×.

## Provably fair

- `serverSeed` = 32 random bytes (hex), `commit = sha256(serverSeed)` sent at run start.
- `clientSeed` chosen by the player (default random, editable).
- For each tile `i`: `h_i = sha256("serverSeed:clientSeed:i")`. Sort tiles by `h_i`; the
  first *T* are traps; trap type = last byte of `h_i` mod 3.
- On loss or cash-out the server reveals `serverSeed`; `verifyRun(view)` checks the commit
  and every revealed tile.

## Stamina, faucet, leaderboard (all simple)

- **Stamina:** 3 runs per Beast per UTC day, kept in server memory (`Map<tokenId, {day, used}>`).
- **Faucet:** `GemRewards.faucet()` gives 100 GEM once per 24 h per address (on-chain).
- **Leaderboard:** best cash-out per Beast today: `{tokenId, name, owner, multiplier, reward}`.
  Show the top 10. In memory, optionally flushed to `server/data.json`.

## Demo Beast

If the wallet owns no Beasts (or the RPC is down), offer a "Demo Warlock" built with
`encodeTokenId({id:1n, prefix:1, suffix:1, level:30, health:400, shiny:0, animated:0, tier:1, beastType:0})`.
Demo runs can play but cannot claim GEM.

## Out of scope for 2 hours (stretch list, in order)

1. Stamina refill by burning GEM (`burn` on GemRewards + server checks the tx).
2. XP/levels per Beast stored off-chain, giving +1 peek per 5 runs.
3. Shard NFT drops (ERC-1155) with drop chance scaled by Shiny/Animated.
4. Daily rare-item prize for the leaderboard winner.
5. Sounds per Beast (the beastathon tool is adding a sound system).
