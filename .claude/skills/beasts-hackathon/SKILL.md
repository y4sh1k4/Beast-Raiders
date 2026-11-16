---
name: beasts-hackathon
description: Build on Beasts (Musical Onchain Beasts, MOB), the onchain art and music NFTs on Starknet, using only the live contracts and this bundled tooling. Use for anything involving Beasts contracts, token IDs, token_uri, Sound Manager tracks, Named Songs, registering a species, minting, or the Beasts hackathon, even if the user only mentions a Beast, MOB, Sepolia practice or a Starknet NFT project at the event.
---

# Beasts hackathon

Help builders ship on Beasts. Beasts are 251-bit self-describing NFTs on Starknet whose art, metadata
and music player are all served onchain. **The Beasts source code is not available to participants.**
Everything you need is in this skill or on the chain, so don't look for a repository, SDK package or
docs site, and don't tell the user to clone one.

**Build on Sepolia.** It runs the same contract classes and sound configuration as mainnet, so it
behaves the same for integration purposes. It has different addresses, tokens and inventory.

## Start here

Check the stack and see a real Beast before writing code. These scripts need Node 18 or later, have no
dependencies, and never sign or send anything. Run them from the user's project, using the path to this
skill's `scripts/` folder, so that output lands in the project and not in the skill. Commands in the
references write this path as `scripts/`:

```sh
S=.claude/skills/beasts-hackathon/scripts   # wherever this skill is installed
node $S/beasts-read.mjs stack
node $S/beasts-read.mjs species 1
node $S/beasts-read.mjs tokens 1
node $S/beasts-read.mjs uri <tokenId> --out ./beast
```

Open `beast/image.svg` and `beast/player.html` in a browser to see and hear it. SVG rasterizers leave
the art panel empty, and audio needs a browser.

Sepolia: NFT `0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1`, registry
`0x7f6883b4f901ce25aff2b10c876db8dfff68e61ba93102354816519e7fe1f`.

Copy the `scripts/` directory into the user's project when their code needs it. For interfaces, see
`references/code-access.md`.

## Rules that prevent most bugs

- **Read IDs from the chain and never hardcode them.** An ID encodes its mint block and minute, so it
  differs between networks. Use `(species, prefix, suffix)` as a stable key.
- **Two token ID types.** ERC-721, ERC-2981 and ERC-4906 entry points such as `owner_of` and `token_uri`
  take a u256 as `[low, high]`. Everything Beasts defines takes one felt252.
- **Keep IDs as `bigint` or strings in JavaScript,** because `number` silently corrupts them.
- **Resolve the sound manager** with the registry's `get_sound_manager(species_id)` instead of pinning it.
- **Count three track kinds.** `get_track_counts` returns `{shared, named, individual}`: fresh ordinary
  Beasts have `{2, 1, 0}` and Genesis `{2, 0, 0}`. `TrackRef::Named` is the unit variant `[2]`, with no ID.
- **Use the event RPC.** The scripts default to a shared Sepolia endpoint for this event, and it served every call
  we tested. The room shares its quota, so cache `token_uri` results. If it fails with quota errors, see
  the public fallbacks in `references/networks.md`.
- **Don't guess at the faucet.** Its URL and interface will be announced. Use the placeholder in
  `references/building.md` until then.
- **Don't assert who owns a contract.** Admin rights can change, and builders don't need them. Read
  `owner()` live if it ever matters.

## Getting Beasts

Mainnet Beasts aren't on Sepolia. Read the 75 Genesis and 300 test renditions already there, claim
from the faucet once it is announced, or register your own species. Community registration is open
on Sepolia, closed on mainnet, and makes you the species' owner and minter. You can't mint species 1-75.

A new species is silent until you give it a track on the Originals Sound Manager. Compose your own with
`species-calls.mjs audition` and hear it on an unminted card with `preview`: see `references/sound.md`. To send transactions you need an account: see `references/building.md`.

## Read the reference you need

| Task | Read |
| --- | --- |
| Addresses, class hashes, differences from mainnet, RPC choice | `references/networks.md` |
| Token ID layout, names, decoding, u256 and felt252 | `references/token-ids.md` |
| Read commands, ABIs, starknet.js, metadata | `references/reading.md` |
| Tracks, modes, composing a song, the full register, sound and mint script | `references/sound.md` |
| Accounts, fees, registering, minting, transfers, Cairo interfaces, ideas, troubleshooting | `references/building.md` |
| Using this code in a project, ABIs from the chain, what to do without source | `references/code-access.md` |

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/beasts-read.mjs` | Read-only CLI including `track` for MIDI, and helpers for `call`, `decodeByteArray`, `ADDRESSES` |
| `scripts/token-id.mjs` | Offline codec and name tables |
| `scripts/species-calls.mjs` | Builds register, mint and track calls. `simulate`, `preview` and `audition` dry-run them with no key |
| `scripts/token-id.test.mjs` | Runs the codec against `assets/token-id-vectors.json` |

## Working style

Verify against the live chain with the read scripts instead of trusting memory: if anything here and
the chain disagree, the chain wins. When behaviour is unclear, read the deployed ABI and try the call,
or simulate it, rather than inventing an interface. Dry-run writes with `species-calls.mjs simulate`
before spending gas. Keep private keys in environment variables, out of code and chat. Treat Sepolia
as the place for transactions, and confirm with the user before sending anything to mainnet.
