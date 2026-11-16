# Sound and tracks

The NFT stores no sound. Each species routes to a Sound Manager, which owns tracks and modes, and
the renderer only routes. **Resolve the manager with the registry's `get_sound_manager(species_id)`
every time.** Don't pin an address: managers can be replaced, and mainnet has already superseded
two. Zero means the species has sound disabled.

## Tracks

| Track | Reference | Default behaviour |
| --- | --- | --- |
| Sound Check | `Shared(0)` | Selected by default. Original mode, token sound effects |
| Species Song | `Shared(1)` | Original mode, shared preset 0 |
| Named Song, ordinary Beasts only | `Named` | Original mode, token sound effects |
| Purchased Songs and Editions | `Individual(id)` | Additional tracks. Editions default to Live |

This Shared numbering is how the 75 original species are set up. On a community species, Shared IDs
follow add order: the first track you add is `Shared(0)`, whatever kind it is.

## Track counts

`get_track_counts(token_id: felt252)` returns `TrackCounts { shared, named, individual }`, as three
felts in that order. The total is the sum of all three.

| Token | Fresh counts | Total |
| --- | --- | --- |
| Ordinary Beast | `{2, 1, 0}` | 3 |
| Genesis | `{2, 0, 0}` | 2 |

Purchases raise `individual`. Older code that reads two fields, or adds only shared and individual,
misses Named Songs.

## Enums on the wire

| Type | Variant | Calldata |
| --- | --- | --- |
| `TrackRef` | `Shared(id)` | `[0, id]` |
| | `Individual(id)` | `[1, id]` |
| | `Named` | `[2]`, a unit variant with **no** id felt |
| `SoundMode` | `Live` | `[0]` |
| | `Original` | `[1]` |
| | `AtBlock(n)` | `[2, n]` |

`TrackRef::Named` has no track ID and no purchase edition, so UI code must not assume every track
has a numeric ID. Named has discriminant 2 even though it is listed last.

## Reading

```sh
node scripts/beasts-read.mjs tracks <tokenId>
node scripts/beasts-read.mjs call soundManager get_track_sound <tokenId> 2      # Named
node scripts/beasts-read.mjs call soundManager get_track_sound <tokenId> 0 1    # Species Song
```

| Manager view | Purpose |
| --- | --- |
| `get_track_counts(token)` | Counts, as above |
| `get_sound_state(token)` | Species default, token override, effective track and mode |
| `get_beast_sound(token)` | What plays now: `Option<TinySynthSound>` |
| `preview_inputs(inputs, sound_effects, context)` | Composes any inputs, free. See "Compose your own song" |
| `get_track_sound(token, reference)` | One track's sound |
| `get_track_status(token, reference)`, `get_track_inputs(token, reference)` | Track details |
| `get_shared_tracks`, `get_individual_tracks` | Paged catalogue |
| `get_named_song_birth()` | The block Named Songs treat as their origin, cached per manager |
| `get_nft_address()`, `get_registry_address()`, `get_skull_address()` | Wiring |

Call `get_beast_sound` and `get_track_sound` with a capable RPC. Composition is expensive, and these
results run to hundreds of felts. For most apps the simplest route to playable sound is the
`animation_url` player in `token_uri`. To save one track as a MIDI file:

```sh
node scripts/beasts-read.mjs track <tokenId> named --out named.mid
node scripts/beasts-read.mjs track <tokenId> shared:1 --out song.mid    # also active, individual:<id>
```

## What sound modes do

Measured with `preview_inputs` on 2026-11-04:

| Mode | Song | Sound Check |
| --- | --- | --- |
| `Original` | Fixed. Same MIDI at any block, birth block or name variant | Fixed |
| `Live` | Follows the chain. Matched `AtBlock` of recent blocks, stayed the same across 20,000 blocks and differed at 100,000. Changes with the name variant, not the birth block | Same as `Original` |
| `AtBlock(n)` | The song as of block `n`. A block within about the last 5 reverts `'Sound: staff pending'`, and one before the track's birth reverts `'Sound: staff before birth'` | Same as `Original` |

## Holder actions

These need a transaction from the token's owner: `set_default_track`, `clear_default_track`,
`set_sound_mode`, `clear_sound_mode`, `set_track_sound_mode` and `clear_track_sound_mode`.
`purchase_track(token_id)` burns exactly `10^18` SKULL base units from its caller. Sepolia SKULL has
no public claim path documented here, so ask the organisers if your project needs purchases.

## Community species

The Originals Manager works for any registered species, including community IDs from 10,001. Route
your species to it when you register, by passing its address as `soundManager`, or later with
`set_sound_manager(species_id, manager)` as the species owner. Registering with a zero manager renders
fine, with no player.

**Route it before relying on it.** `add_shared_track` also succeeds for a species whose route is zero,
and then nothing plays until you set the manager.

A new species starts with no shared tracks and so no default track. An ordinary token then shows
`Track Count` 1, `Active Track` None and no `animation_url`.

### Choosing a sound

| Route | Who | What you get |
| --- | --- | --- |
| Custom Song, `add_shared_track` with your own inputs | Species owner | Music unique to your species, on every token |
| Named Song, `set_default_track(token_id, TrackRef::Named)`, sent as `[token_id, 2]` | Token owner | A song derived from the token's name, so it differs between tokens. Genesis has none |
| Copy `1:1`, Warlock's Species Song | Species owner | Real music, but **byte-identical to Warlock's**, not yours |
| Copy `1:0`, Warlock's Sound Check | Species owner | A one-octave, 48-note scale of about 20 seconds. Good for testing that sound works, but it isn't a song |

A custom Song or the Named Song is what makes a species sound like itself.

The first shared track you add becomes the default for every token.
`set_species_defaults(species_id, shared_id, mode)` changes it, as `[species_id, shared_id, ...mode]`.
It accepts `Original` on a Song and `Live` on a Sound Check, and rejects `Live` on a Song with
`'Sound: shared song mode'`.

### How `sound_effects` applies

| Track kind | Does the token's `sound_effects` change it? |
| --- | --- |
| Sound Check | Yes. Presets 0 and 3 gave different instruments and tempo |
| Named Song | Yes |
| Shared Song | **No.** All tokens share one preset, starting at 0 |

So a species whose default is a Song sounds the same at every effects preset. Holders can't change a
shared Song's mode: `set_sound_mode` and `set_track_sound_mode` revert with `'Sound: shared song mode'`.
The species' rank-1 Beast controls it through `set_shared_song_preset(leader_token_id, shared_id, preset)`
and `set_shared_song_mode`, and needs `update_rankings` to be current or it reverts `'Sound: stale rankings'`.
In simulation, preset 3 changed the song for every token. `Live` on a track added in the same block
reverted `'Sound: staff pending'`. Presets 1-3 add parts, and other values sounded like 0 in `preview_inputs`.

## Compose your own song

`ComposerInputs` is an enum: `SoundCheck` `[0, ...]`, `Song` `[1, ...]` and `Edition` `[2, ...]`, which
shared tracks reject. Audition any inputs for free with the `preview_inputs` view:

```
preview_inputs: [...ComposerInputs, sound_effects, birth_block, name_variant_id, ...SoundMode]
```

Save this as `song.json`. It is a tested Song. Change the seeds to get your own melody:

```json
{
  "song": {
    "theme": { "motif_seed": "0x4c616e7465726e204d6f7468", "tier": 3, "register_band": 1 },
    "score": {
      "mode_id": 8, "tonic_keynum": 57, "tier": 3, "weakness": 2, "voice_count": 4, "section_count": 3,
      "stretto_lag": 4, "use_inversion": true, "use_countersubject": true, "ornament_density": 1,
      "articulation_profile": 0, "velocity_ceiling": 112, "tempo_us": 428571
    },
    "treatment": {
      "rhythm_seed": "0x4c616e7465726e204d6f7468", "flip_side": false, "development": 0, "direction": 0,
      "spacing": 1, "trill": true, "prominence": 2, "section_rhythm": false
    },
    "arrangement": {
      "family": 0, "identity": { "name_variant_id": 0 }, "channel_count": 4,
      "channel_policy": "genesis", "special": "none", "top_lead": true, "balanced": true, "weak_ties": true
    }
  }
}
```

The groups and field names are the ABI's `SongInputs`. Every field is required. The exception is
`identity.source_species_id`, which defaults to your species and changes the instruments. Pass raw
felts as a JSON array instead if you prefer. `{ "sound_check": { "identity": { "name_variant_id": 0 },
"mode_id": 8, "tonic_keynum": 57, "family": 0, "tempo_us": 428571, "velocity_ceiling": 100,
"articulation_profile": 0 } }` makes a Sound Check.

```sh
# Free, and needs no species. Open the .mid in any MIDI player.
node scripts/species-calls.mjs audition --inputs song.json --out song.mid

# See and hear it on your card, in a browser. Sends nothing.
node scripts/species-calls.mjs preview --account 0xYOUR_DEPLOYED_ACCOUNT --name "Moss Golem" \
  --art-png regular.png --art-shiny shiny.png --art-gif regular.gif --art-gif-shiny shiny.gif \
  --effects 2 --sound-manager originals --inputs song.json --out ./preview
```

`audition` also takes `--effects`, `--mode original|live|<block>`, `--birth-block` and `--name-variant`.
Use it with an RPC that serves heavy calls: PublicNode reverts it with `Out of gas`. `preview` runs as a
simulation and worked on both Zan and PublicNode.

### Tested ranges

Found on 2026-11-04 by changing one field of the template above at a time. **Combinations are not
covered, and other fields' values can change what is accepted.** "Exact" means the values on both sides
of the edge were tried. "Sampled" means only the listed values were, so the real limit could be
anywhere between them.

| Field | Accepted | Rejected, with revert | Edges |
| --- | --- | --- | --- |
| `score.mode_id` | 4-8 | 0, 3, 9, 20, 255: `unsupported musical mode` | Exact at 3 and 9. 1, 2 and 10-13 also rejected. Not every high value tried |
| `score.tonic_keynum` | 24, 26, 28, 30-37, 57, 83-88, 90, 95, 96 | 21, 97-100: `invalid song tonic` | Top exact at 96. Bottom sampled: 22 and 23 untried |
| `theme.tier` | 1-5 | 0, 6: `invalid theme tier` | Exact |
| `score.tier` | 1, 3, 5 | 0, 6: `invalid musical tier` | Exact at 0 and 6. 2 and 4 untried |
| `score.weakness` | 0-2 | 3, 4: `invalid rhythm family` | Exact |
| `score.voice_count` | 2-4 | 0, 5: `invalid voice count`. 1: `invalid channel count` | Exact |
| `score.section_count` | 1-5 | 0, 6: `invalid section count` | Exact |
| `score.stretto_lag` | 1-4 | 0, 5, 6, 8, 16: `invalid entry lag` | Exact |
| `score.ornament_density` | 0-4 | 8, 255: `invalid ornament density` | Top sampled: 5-7 untried |
| `score.articulation_profile` | 0-3 | 4, 8, 255: `invalid articulation` | Exact |
| `score.velocity_ceiling` | 1, 64, 112, 127 | 0, 128, 255: `invalid musical velocity` | Exact at 0 and 128. Between sampled |
| `score.tempo_us` | 1 up to 1,000,001, sampled | 1,050,000 and above: `invalid musical tempo` | Top sampled. Very low values are accepted but may not be playable |
| `theme.register_band` | 0-2 | 3, 4: `invalid theme register` | Exact |
| `treatment.development` | 0-2 | 3, 4, 255: `invalid development` | Exact |
| `treatment.direction` | 0-2 | 3, 255: `invalid episode direction` | Exact |
| `treatment.spacing` | 0-2 | 3, 255: `invalid voice spacing` | Exact |
| `treatment.prominence` | 0-3 | 255: `invalid prominence` | Top sampled: 4-254 untried |
| `treatment.section_rhythm` | `false` | `true`: `section rhythm unsupported` | Both tried |
| `arrangement.family` | 0-2 | 3: `invalid program family` | Exact |
| `arrangement.channel_count` | 1-6 | 0, 7: `invalid channel count` | Exact |
| `arrangement.weak_ties` | `true` | `false`: `untied voices unsupported` | Both tried |

Other notes from the same probing:

- **`mode_id` is the scale**, read from Sound Check output: 4 Dorian, 5 Phrygian, 6 Locrian, 7 natural
  minor and 8 harmonic minor.
- **`section_count`** sets the length. At 120 bpm, 1 section ran 16 seconds and 4 ran 64.
- **`channel_count` and `voice_count`** set how many parts play. **`family`** sets the instruments.
- **`use_inversion`, `use_countersubject`, `flip_side`, `balanced`, `development`, `direction`,
  `spacing` and `prominence`** all changed the MIDI, as did `channel_policy: { "seeded": "0x..." }` and
  `special: { "yeti": 1 }`.
- **`register_band`, `ornament_density`, `top_lead`, and `theme.tier` from 3 to 5** made no difference
  to this template. They may matter with other values.
- A Sound Check accepted `tonic_keynum` at every value tried from 47 to 100. It rejected `tempo_us` of
  1,500,000, and its mode, family, velocity and articulation limits matched the Song's where tried.

What each musical field means beyond this hasn't been established, so listen and compare.

## Full flow: register, add sound, mint

Copy this skill's `scripts/` into your project, install starknet.js (`npm install starknet@9`), and put
your art and `song.json` beside this file. Run `preview` first, then
`ACCOUNT=0x... PRIVATE_KEY=0x... node launch.mjs`. Its calls were checked by simulation, and the
species ID read against a real registration receipt, but this exact script has not sent a transaction.

```js
// launch.mjs
import { readFileSync } from 'node:fs';
import { Account, RpcProvider } from 'starknet';
import { ADDRESSES, call } from './scripts/beasts-read.mjs';
import {
  addSharedTrackCall, artDataUri, composerInputsCalldata, mintCall, registerWithArtCall, speciesIdFromReceipt,
} from './scripts/species-calls.mjs';

const url = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe'; // See references/networks.md.
const { nft, registry, soundManager: manager } = ADDRESSES.sepolia;
const provider = new RpcProvider({ nodeUrl: url });
const account = new Account({ provider, address: process.env.ACCOUNT, signer: process.env.PRIVATE_KEY });

async function send(calls) {
  const { transaction_hash } = await account.execute(calls);
  return provider.waitForTransaction(transaction_hash);
}

// 1. Register alone, and take your species ID from the receipt.
const receipt = await send([
  registerWithArtCall({
    registry, name: 'Moss Golem', beastType: 1, tier: 3,
    minter: account.address, speciesOwner: account.address, soundManager: manager,
    art: {
      pngRegular: artDataUri('regular.png'), pngShiny: artDataUri('shiny.png'),
      gifRegular: artDataUri('regular.gif'), gifShiny: artDataUri('shiny.gif'),
    },
  }),
]);
const speciesId = speciesIdFromReceipt(receipt, registry);

// 2. Add your song as the species' default, and mint.
const inputs = composerInputsCalldata(JSON.parse(readFileSync('song.json', 'utf8')), speciesId);
await send([
  addSharedTrackCall({ manager, speciesId, inputs }),
  mintCall({ nft, to: account.address, speciesId, prefix: 63n, suffix: 4n, level: 5, health: 100, effects: 2 }),
]);

// 3. The mint's return value isn't exposed, so read the token ID.
const [tokenId] = await call(url, nft, 'get_token_id_by_affixes', [speciesId, 63, 4]);
console.log({ speciesId, tokenId });
```

To use another route, change step 2. `readSharedTrackInputs(url, manager, 1, 1)` returns a copy's inputs.
For a Named Song, skip `addSharedTrackCall` and, after step 3, send
`selectNamedSongCall({ manager, tokenId })` as the token's owner. All of these are in
`scripts/species-calls.mjs`.

Check it with `node scripts/beasts-read.mjs tracks <tokenId>`, then listen with
`node scripts/beasts-read.mjs uri <tokenId> --out ./beast` and open `beast/player.html` in a browser.

## Your own manager

You can also deploy your own manager that implements `get_beast_sound` and reports SRC5 interface
`0x2dd57f0df610990f2e95e8a59834b510e1ada1606ada790402cbe20ace8b45e` (`beasts_sound_manager_v2`).
