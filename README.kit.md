# Beast Raiders — starter kit for Claude Code

**Pitch:** Send one of your Beast NFTs into a 5×5 dungeon. Reveal tiles to grow your
multiplier, cash out before the traps get you, and claim $GEM on Starknet. Your Beast's real
on-chain traits decide how it plays: Health gives shields, Level gives peeks, Tier boosts the
multiplier, and Type decides which traps it shrugs off (Brute > Hunter > Magic > Brute) plus
one special move.

## What's in here

```
CLAUDE.md                                  project instructions Claude Code reads automatically
.claude/skills/beast-nfts/                 how to read Beast NFTs
  SKILL.md                                 traits, token-ID layout, get_beast / owner_of / token_uri
  scripts/decodeBeast.mjs                  token ID ⇄ traits (self-testing)
  references/beasts-data.json              75 species (id, name, tier, type), 69 prefixes, 18 suffixes
  references/combat-rules.md               Loot Survivor type triangle and formulas
.claude/skills/beast-raiders/              how to build the game
  SKILL.md                                 entry point, non-negotiables, definition of done
  references/game-rules.md                 trait → ability mapping, typed traps, specials, fairness
  references/build-plan.md                 2-hour timeline with checkpoints + demo script
  references/api.md                        Node endpoints, claim signing, RPC reads, React notes
  references/engine.mjs (+ .test.mjs)      game engine, 7 passing tests
  references/contracts/                    GemRewards Cairo contract, Scarb.toml, snforge tests
  fixtures/claim-signature.json            starknet.js-made signature the Cairo tests verify
```

## Use it

1. Unzip into an empty folder, `git init`.
2. Install: Node 20+, Scarb 2.18.0, Starknet Foundry 0.60.0 (`starkup` installs both).
3. Get the Sepolia Beasts collection address from the event organizers and a Sepolia wallet
   (Argent X or Braavos) with some STRK from the faucet.
4. Open Claude Code in the folder and say:
   *"Build Beast Raiders following the beast-raiders skill's build plan."*

## Verified

- Engine: `node --test .claude/skills/beast-raiders/references/engine.test.mjs` → 7/7 pass.
- Decoder: `node .claude/skills/beast-nfts/scripts/decodeBeast.mjs` → self-test ok.
- Contract compiles with Scarb 2.18 + OpenZeppelin v3.0.0, and a claim signed in starknet.js
  v10 verifies on-chain-equivalent in Cairo (replay, wrong caller and faucet cooldown also
  checked). The snforge test file mirrors those checks.

Trait data comes from github.com/Provable-Games/beasts (current `main`). Beast art is not
included; the game shows each Beast's on-chain `token_uri` image.
