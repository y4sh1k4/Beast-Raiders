# Token IDs

Schema `beasts-v3-species-first-251-v2`. A token ID is the complete packed Beast: every immutable
field lives in its 251 bits, so you can decode most of a Beast without an RPC call. IDs are not
sequential. Use `scripts/token-id.mjs`, which passes the canonical vectors in
`assets/token-id-vectors.json` (`node --test scripts/token-id.test.mjs`).

## Don't hardcode or derive live IDs

An ID includes the block and minute of its mint, and for Genesis the registrant's choices. So the
same identity has a different ID on Sepolia and mainnet, and a burned identity minted again gets a
new ID. Read IDs from the chain:

| You have | Read |
| --- | --- |
| Species | `get_genesis_token_id(species)`, `get_species_token_ids(species)` |
| Species, prefix and suffix | `get_token_id_by_affixes(species, prefix, suffix)`, where 0 means free |
| Owner | `balance_of(owner)`, then `token_of_owner_by_index(owner, index)` |

Key anything that must survive across networks or a re-mint by `(species, prefix, suffix)`.

## felt252 or u256

| Entry points | Token ID calldata |
| --- | --- |
| ERC-721, ERC-2981, ERC-4906: `owner_of`, `token_uri`, `transfer_from`, `royalty_info`, ... | **u256**, two felts: `[low, high]` |
| Everything Beasts defines: `get_beast`, `get_card_grade`, `get_beast_rank`, `get_track_counts`, `get_sound_state`, ... | **felt252**, one felt |

Passing one felt to `owner_of` or `token_uri` is the most common cause of a confusing revert.
Use `tokenIdToU256` and `tokenIdToFelt`. In JavaScript always keep IDs as `bigint` or strings,
because a `number` silently loses the low bits, and those hold the condition, presets and mint block.

## Layout

Ranges are inclusive. The high limb is bits 128-250, the low limb bits 0-127. Bits 251-255 are zero.

| Bits | Field | Width | Values |
| --- | --- | ---: | --- |
| 219-250 | `species_id` | 32 | 1 and up. `id >> 219` recovers it, so a species spans `[s << 219, (s + 1) << 219)` |
| 216-218 | `tier` | 3 | 1-5, where 1 is strongest |
| 213-215 | `beast_type` | 3 | 0 Magic, 1 Hunter, 2 Brute |
| 197-212 | `level` | 16 | |
| 181-196 | `health` | 16 | |
| 174-180 | `prefix` | 7 | 0-69 |
| 169-173 | `suffix` | 5 | 0-18. Both zero is Genesis, otherwise both are nonzero |
| 155-168 | `transfer_lock_hours` | 14 | 0 free, 1-16382 hours after mint. Field value 16383 decodes to forever |
| 128-154 | `minted_at_minute` | 27 | Unix minute |
| 96-127 | `minted_at_block_number` | 32 | |
| 64-95 | `minter_data` | 32 | Minter-defined. Beasts gives it no meaning |
| 53-63 | `transfer_damage_chance` | 11 | 0-2047, probability `X / 2047` per eligible transfer |
| 48-52 | `visual_effects` | 5 | 0-31. The species' art provider and renderer define the meaning |
| 43-47 | `sound_effects` | 5 | 0-31. The species' sound manager defines the meaning |
| 41-42 | `corner_chip_level` | 2 | 0-3 |
| 39-40 | `edge_chip_level` | 2 | 0-3 |
| 38 | `rollers_in_art` | 1 | Zero when `roller_level` is zero |
| 36-37 | `roller_level` | 2 | |
| 35 | `voids_in_art` | 1 | Zero when `void_level` is zero |
| 33-34 | `void_level` | 2 | |
| 32 | `hickeys_in_art` | 1 | Zero when `hickey_count` is zero |
| 30-31 | `hickey_count` | 2 | |
| 29 | `centering_y_direction` | 1 | Zero when y centering is perfect |
| 15-28 | `centering_y_error_bps` | 14 | `10000 - centering_y_bps` |
| 14 | `centering_x_direction` | 1 | Zero when x centering is perfect |
| 0-13 | `centering_x_error_bps` | 14 | `10000 - centering_x_bps` |

## Names

Prefixes number 1-69 and suffixes 1-18, and 0 means absent. Tables are in `scripts/token-id.mjs`.
Prefix 63 and suffix 4 is "Victory Song". On a species that's the display name `"Victory Song" Warlock`.

Each species holds at most 1,243 live Beasts: 1,242 affix slots plus Genesis. A live identity is
unique, so minting it again reverts with `'Beast already minted'`. `(species, 0, 0)` is reserved
for Genesis, so ordinary mints reject it with `'Invalid prefix'`.

## Facts derived from the ID

- **Power:** `level * (6 - tier)`, capped at 65535.
- **Transfer lock end:** `minted_at_minute * 60 + transfer_lock_hours * 3600`.
- **Card grade (1-10):** derived from condition. Read `get_card_grade` instead of reimplementing it.

Live values that are not in the ID: owner, rank, kills, transfer damage count, autographs and sound.

## Effects

Species 1-75 have a meaning for presets 0-3 only: bit 0 selects the Shiny GIF, 1 and 3 add rainbow
chrome, and 2 and 3 add a notes background. Other values render like 0. Convention: every mint
tooling makes has `visual_effects == sound_effects`. The contracts accept any pair, so enforce it yourself.
