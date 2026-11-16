# Reading Beasts

`scripts/beasts-read.mjs` is read-only, has no dependencies and retries rate limits. Run it from
your project, so that `--out` paths land there; `scripts/` below means this skill's `scripts/` folder.
Add `--network mainnet` for mainnet and `--rpc <url>` to change endpoint. `BEASTS_RPC_URL` also sets
the endpoint. The default is Zan, for `token_uri`; for other reads, see `references/networks.md`.

```sh
node scripts/beasts-read.mjs stack                    # chain, wiring, supply, registration state
node scripts/beasts-read.mjs species 1                # name, traits, minter, routes, Genesis ID
node scripts/beasts-read.mjs tokens 1                 # live ordinary IDs of a species
node scripts/beasts-read.mjs slot 1 63 4              # the ID in an affix slot, or free
node scripts/beasts-read.mjs owned 0xADDRESS --limit 25
```

Take a `<tokenId>` from one of those, then:

```sh
node scripts/beasts-read.mjs beast <tokenId>          # decoded fields, owner, rank, grade, lock, damage
node scripts/beasts-read.mjs tracks <tokenId>         # manager, track counts, selected track and mode
node scripts/beasts-read.mjs uri <tokenId> --out ./beast   # saves metadata.json, image.svg, player.html
node scripts/beasts-read.mjs track <tokenId> named --out named.mid   # also active, shared:<id>, individual:<id>
node scripts/token-id.mjs decode <tokenId>            # offline
```

Any view by name, with raw felts as arguments:

```sh
node scripts/beasts-read.mjs call soundManager get_named_song_birth
node scripts/beasts-read.mjs call nft get_card_grade <tokenId>
```

Contract names for `call` and `abi` are `nft`, `registry`, `soundManager`, `skull`, `renderer`,
`classicRenderer`, `artProvider` and `credential`, or pass an address.

## ABIs

The chain is the authority on an interface. Fetch the ABI of what is deployed rather than copying one:

```sh
node scripts/beasts-read.mjs abi nft                  # list functions
node scripts/beasts-read.mjs abi nft --out nft.abi.json
```

Or call `starknet_getClassAt` yourself and read `abi` from the result, parsing it if it is a string.

## Calling from JavaScript

Import the helpers, or use starknet.js:

```js
import { RpcProvider } from 'starknet';

const provider = new RpcProvider({ nodeUrl: 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe' });
const NFT = '0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1';

// Beasts-defined view: felt arguments, and species ID 1 is one felt.
const [genesis] = await provider.callContract({ contractAddress: NFT, entrypoint: 'get_genesis_token_id', calldata: ['1'] });

// ERC-721 view: the token ID is a u256, so [low, high].
const id = BigInt(genesis);
const u256 = [(id & ((1n << 128n) - 1n)).toString(), (id >> 128n).toString()];
const [owner] = await provider.callContract({ contractAddress: NFT, entrypoint: 'owner_of', calldata: u256 });
```

## Useful views

**NFT:** `owner_of`, `token_uri`, `balance_of`, `token_of_owner_by_index(owner, index: u256)`, `total_supply`,
`get_beast`, `get_card_condition`, `get_card_grade`, `get_beast_rank`, `transfer_locked_until`,
`is_minted`, `get_token_id_by_affixes`, `get_species_token_ids`, `get_genesis_token_id`,
`get_species_count`, `get_ranking_info`, `get_default_renderer`, `get_transfer_damage_count`,
`get_beast_stats(entity_hash)`.

**Registry:** `is_registered`, `get_definition`, `get_species_name`, `get_species_traits`, `get_minter`,
`is_minter_locked`, `get_sound_manager`, `get_renderer`, `get_art_provider`, `get_description`,
`get_species_royalty`, `species_count`, `get_species_id_cursors`, `is_registration_open`, `get_dao`.

## Decoding results

- **u256** returns two felts, `[low, high]`.
- **ByteArray** returns `[n, ...n 31-byte words, pending_word, pending_len]`. In `beasts-read.mjs`, `decodeByteArray` handles text
  and `decodeByteArrayBytes` handles binary such as MIDI.
- **Species names** are felt252 short strings.
- **Arrays** start with a length felt.
- **Cairo `Option`:** Some is variant 0, None is variant 1.

## Metadata

`token_uri` returns `data:application/json;base64,...`. The JSON has `name`, `description`,
`image` (a base64 SVG data URI), `attributes` and, when the species' manager returns a sound,
`animation_url` (a base64 HTML player). Use the attributes rather than scraping the SVG. Trait
names include `Beast`, `Prefix`, `Suffix`, `Level`, `Health`, `Power`, `Rank`, `Card Grade`,
`Track Count`, `Shared Tracks`, `Named Tracks`, `Purchased Tracks`, `Active Track` and `Sound Mode`.

**You need a browser to see and hear these.** `image.svg` embeds its art in a `foreignObject`, so
SVG rasterizers such as resvg show an empty art panel. `player.html` plays through Web Audio.

The player page makes no network requests of its own. Display `animation_url` in a sandboxed iframe,
starting with `sandbox="allow-scripts"`, and start audio only after a user gesture because browsers
block autoplay. Test playback in your target browser.
