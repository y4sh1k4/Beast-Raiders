# Getting Beasts and building on them

## Three ways to get Beasts on Sepolia

1. **Read what is already there.** 75 Genesis and 300 renditions are live, with no wallet needed.
2. **Claim from the faucet.** It mints new Beasts with its own randomness for species, level,
   health, print condition and effects.
3. **Register your own species.** Registration is open on Sepolia. You become its owner and minter,
   so you can mint freely. This is the fastest route if you need a specific Beast.

<!-- ORGANISERS: replace this block when the faucet is live. -->
> **FAUCET: TO BE ANNOUNCED.** The URL and interface will be announced at the event.
> Until then there is nothing to call, so don't guess an address or an ABI. Use options 1 and 3.

You can't mint species 1-75 yourself, because `mint` is restricted to each species' registered
minter.

## Get a Sepolia account

Reading needs no account. To send transactions you need a deployed Starknet Sepolia account holding
some Sepolia STRK. See "Costs" below for how much.

- **Browser wallet:** switch Ready or Braavos to Sepolia, deploy the account, and export its address
  and private key for scripts.
- **Command line, with Starknet Foundry's `sncast`:**

  ```sh
  sncast --accounts-file ./accounts.json account create --name hackathon \
    --url https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe
  # Send Sepolia STRK to the address it prints, then:
  sncast --accounts-file ./accounts.json account deploy --name hackathon \
    --url https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe
  ```

Send transactions through PublicNode, as above. Zan rate-limited a single tester's `sncast` send with
`cu limit exceeded`, and the same send then worked through PublicNode. If you get limited anyway, back
off and retry or use your own endpoint. See `references/networks.md`.

For Sepolia STRK, use the Starknet Foundation's faucet at https://faucet.starknet.io or
https://starknet-faucet.vercel.app, whose page offers 100 STRK per 24 hours. These give gas tokens, not
Beasts. Never commit `accounts.json` or a private key, and never reuse a Sepolia key on
mainnet.

## Register a species and mint

`scripts/species-calls.mjs` builds the calls and dry-runs them without a key. Give it all four art files
so that shiny and animated presets work. `--art` alone puts one file in every slot, and it warns you:

```sh
node scripts/species-calls.mjs simulate --account 0xYOUR_DEPLOYED_ACCOUNT \
  --name "Moss Golem" --tier 3 --type 1 \
  --art-png regular.png --art-shiny shiny.png --art-gif regular.gif --art-gif-shiny shiny.gif
```

`simulate` reports the species ID, token ID and fee. Swap it for `preview` and add `--out ./preview` to
render the token you would mint, then open `preview/image.svg` and `preview/player.html` in a browser.
Both commands also take `--prefix`, `--suffix`, `--level`, `--health` and `--effects`. For sound, add
`--sound-manager originals` with `--inputs song.json` or `--copy-track-from 1:1`, as described in
`references/sound.md`. `preview` also takes `--named`.

To send it, use the complete script in `references/sound.md`, "Full flow". Leave out
`addSharedTrackCall` for a silent species.

### Costs

Simulated fees on Sepolia, 2026-11-04. Gas prices move, so treat these as a guide and simulate your own.
Art is the main cost. Each row puts the given URI size in all four slots unless it says otherwise.

| Transaction | Fee (STRK) |
| --- | --- |
| Register + mint, 114-byte URI (1×1 PNG) | 0.55 |
| Register + mint, 466-byte URI (32×32 PNG) | 1.04 |
| Register + mint, 1,410-byte URI (animated 32×32 GIF) | 2.28 |
| Register + mint + custom track, two 466-byte PNGs and two 1,410-byte GIFs | 2.0 |
| Register only, 2,958-byte URI | 4.27 |
| Register only, 10,000-byte URI | 13.5 |
| Register only, 30,000-byte URI | 39.8 |
| Register only, 100,000-byte URI | Rejected: `Calldata limit (10000) exceeded` |

A real registration with almost no art (44 calldata felts) cost 0.49 STRK. Adding a track adds about 0.1
to 0.3. Each byte of a data URI takes about 1/31 of a felt, so 10,000 felts is a hard ceiling of about
310,000 bytes per transaction across all four slots and the other arguments. Fees get large well before that.

### Your species ID and token ID

Registering in a crowded event is a race: another builder took the next community ID within minutes
during testing, and a multicall built from the old ID reverted with `'Not authorized to mint'`. So send
registration alone and read the ID from what actually happened:

- **Species ID:** the registry's `BeastRegistered` event, where `keys` is `[selector, species_id,
  species_owner]`. `speciesIdFromReceipt(receipt, registry)` does this. Confirmed on a real registration
  receipt, through starknet.js `waitForTransaction` on both PublicNode and Zan. Don't derive it from
  `get_species_id_cursors` after sending, because that cursor is already the next ID and may have moved again.
- **Token ID:** `account.execute` doesn't give you `mint`'s return value, so read
  `get_token_id_by_affixes(species, prefix, suffix)` after the mint.

### Registration rules

- **Name:** a 1-31 byte short string using letters, digits, spaces, `'` and `-`, with no leading or trailing space.
- **Community IDs** start at 10001. `reserved` must be false, since IDs up to 10000 are restricted.
- **Tier:** 1-5. **Type:** 0 Magic, 1 Hunter, 2 Brute.
- **`species_owner`** must be nonzero. **Royalty:** at most 2000 bps.
- **`genesis_recipient`:** zero means the caller. Genesis is a collectible and grants no rights.
- **`description`** is stored once and can't be changed. Empty keeps the collection text.
- **`renderer`:** zero uses the NFT's default.
- **Art:** four data URIs, chosen by visual preset: 0 PNG regular, 1 PNG shiny, 2 GIF regular,
  3 GIF shiny, anything else PNG regular. Each is ideally at most 2,958 bytes including its prefix.
  Larger is allowed up to the calldata limit, and costs more to register and render. See "Costs".
  Genesis defaults to preset 3 here.
- **Registering is permanent** for the stack: there is no unregister. The species owner can change
  art, minter, renderer, sound manager, stats source and royalty later. `lock_art`, `lock_minter`,
  `lock_renderer` and `lock_sound_manager` freeze a route forever, so skip them during a hackathon.

### Mint rules

- `mint` arguments in order: `to, species_id, prefix, suffix, level, health, visual_effects,
  sound_effects, transfer_damage_chance, transfer_lock_hours, minter_data, condition`.
- The contract stamps the block and minute, and resolves tier and type. Its return value is the token ID.
- `condition` is 12 flat felts: `centering_x_bps, centering_x_direction, centering_y_bps,
  centering_y_direction, hickey_count, hickeys_in_art, void_level, voids_in_art, roller_level,
  rollers_in_art, edge_chip_level, corner_chip_level`. Perfect is `10000, 0, 10000, 0, 0, ...`.
- Check `is_minted(species, prefix, suffix)` first, or handle `'Beast already minted'`.
- `transfer_lock_hours` is 0, 1-16382, or `2^64 - 1` for forever. 16383 is rejected.
- Your game contract can be the minter: `set_minter(species_id, contract)`, from the species owner.
  `lock_minter` is permanent.
- New Beasts rank 0 until someone runs the permissionless `update_rankings(species, ranked_ids)`
  with the full live set, ordered by power, then health (both descending), then mint block, then token ID.

## Transfers

Check before moving a Beast: `transfer_locked_until` can block it with `'Beast: transfer locked'`, and
`transfer_damage_chance` can queue a damage roll for each eligible transfer, visible in
`get_transfer_damage_count` and the card's metadata. Genesis Beasts can't be burned. Any other Beast
can be burned by its owner or an approved operator, which frees its slot.

## From a Cairo contract

Declare only what you call. Note the two token ID types:

```cairo
use starknet::ContractAddress;

#[starknet::interface]
trait IBeastsRead<T> {
    fn owner_of(self: @T, token_id: u256) -> ContractAddress;
    fn get_card_grade(self: @T, token_id: felt252) -> u8;
    fn get_beast_rank(self: @T, token_id: felt252) -> u16;
    fn is_minted(self: @T, species_id: u32, prefix: u8, suffix: u8) -> bool;
    fn get_token_id_by_affixes(self: @T, species_id: u32, prefix: u8, suffix: u8) -> felt252;
}
```

## Project ideas that suit the contracts

- Gallery or collection viewer with the onchain player, using only `token_uri`.
- A game whose contract is the minter of your own species.
- A card grading or condition explorer built from the decoded token ID, with no RPC needed.
- A music tool built on `get_track_sound`, track selection and sound modes.
- Your own art provider, renderer or sound manager for a community species.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Out of gas` on `token_uri` | RPC gas limit. See `references/networks.md` |
| HTTP 410 | The discontinued Cartridge Sepolia endpoint |
| `cu limit exceeded`, HTTP 429 | Rate limit, common on Zan. Use PublicNode unless you need `token_uri`, back off, or use your own endpoint |
| Revert on `owner_of` or `token_uri` | Token ID passed as one felt instead of u256 `[low, high]` |
| `ERC721: invalid token ID` | Burned, wrong network, or an ID from another network |
| Wrong decoded fields | The ID went through a JavaScript `number`, or was decoded with an older codec |
| `'Registry: registration closed'` | You are on mainnet, or using an older Sepolia stack's address |
| Track list missing a song | Not summing `named`, or not handling `TrackRef::Named` |
| No `animation_url` | The species has no manager, or the manager returned no sound |
| Mint rejected | The caller is not the species' `get_minter`, or the slot is taken |
