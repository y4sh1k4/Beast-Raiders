# Building without the source

The Beasts source isn't available, and `@provable-games/beasts-sdk` is not on npm, so don't try to
install it. This skill's scripts replace the parts you need:

| You need | Use |
| --- | --- |
| Token ID encode and decode | `scripts/token-id.mjs`, checked against the canonical vectors |
| Name tables | `SPECIES_NAMES`, `PREFIX_NAMES`, `SUFFIX_NAMES` in `scripts/token-id.mjs` |
| Reads and metadata | `scripts/beasts-read.mjs` |
| Registering, minting, composing and previewing | `scripts/species-calls.mjs` |
| Exact interfaces | The deployed ABI, below |
| Sending transactions | starknet.js: `npm install starknet@9` |

Copy `scripts/` into your project and import from it. The scripts are ES modules with no dependencies
and need Node 18 or later. Node-only parts are the file helpers (`artDataUri`, `--out`) and `Buffer`,
so in a browser use `token-id.mjs` as is, and starknet.js for calls and ByteArray decoding.

## ABIs come from the chain

Every deployed class publishes its ABI, including all structs and enums:

```sh
node scripts/beasts-read.mjs abi nft --out nft.abi.json
node scripts/beasts-read.mjs abi registry --out registry.abi.json
node scripts/beasts-read.mjs abi soundManager --out sound-manager.abi.json
```

With no `--out`, the command lists function names. Sepolia and mainnet run the same classes, so one
ABI serves both networks. Directly over JSON-RPC:

```sh
curl -s https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"starknet_getClassAt",
  "params":["latest","0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1"]}'
```

The `abi` field of the result may be a JSON string. Parse it before use.

## Typed contracts with starknet.js

```js
import { readFileSync } from 'node:fs';
import { Contract, RpcProvider } from 'starknet';

const provider = new RpcProvider({ nodeUrl: 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe' });
const nft = new Contract({
  abi: JSON.parse(readFileSync('nft.abi.json', 'utf8')),
  address: '0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1',
  providerOrAccount: provider,
});

const genesis = await nft.get_genesis_token_id(1);
const grade = await nft.get_card_grade(genesis);   // felt252 argument
const owner = await nft.owner_of(genesis);         // starknet.js splits the u256 from the ABI
console.log(BigInt(genesis).toString(16), grade, BigInt(owner).toString(16));
```

## When something isn't documented

1. Read the deployed ABI for the name and types.
2. Try the view with `node scripts/beasts-read.mjs call <contract> <entrypoint> <felts...>`.
3. For a write, simulate it first. `simulate` in `scripts/species-calls.mjs` takes any list of calls and sends nothing.
4. Revert strings are short and specific, such as `'Registry: registration closed'`. They usually say what is wrong.
5. If that doesn't settle it, ask the organisers rather than assuming behaviour.

Rendering, composition and art are onchain, so `token_uri` and the manager views show real behaviour
without any source. Save a real Beast with `uri <tokenId> --out ./beast` and inspect `metadata.json`,
`image.svg` and `player.html`.
