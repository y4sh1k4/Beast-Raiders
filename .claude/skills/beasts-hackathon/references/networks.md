# Networks, addresses and RPCs

Practise on Sepolia. It runs the same contract classes and sound configuration as mainnet, so
code that works there should work on mainnet once you change the addresses. Run
`node scripts/beasts-read.mjs stack` to confirm the RPC and the wiring before debugging anything else.

## Addresses

| Contract | Sepolia | Mainnet |
| --- | --- | --- |
| NFT (`MOB`) | `0x2e2f3e29a04f92c2b4e8b91fa846d521aea2a682e490bdf46f18da6d0a8bbe1` | `0xf739e402e52830a736335a0f47d58ec78ba067443c9c6930da182eab2ff8b0` |
| Registry | `0x7f6883b4f901ce25aff2b10c876db8dfff68e61ba93102354816519e7fe1f` | `0x140e8868c7c9277b8b864d78efb5172a42d41e0b501329b043db7d2cb3bc8b3` |
| Originals Sound Manager | `0x49203ee761fab21814b387938064bc3535c35b10ab62a4877aeb8bbc059e305` | `0x1bbece5870dabbbec40efb73457848fd5425320600a42684aa23271c43abe8b` |
| SKULL | `0xeb4a778751c2fc690c8a872e10bbd89c9aa1a72ce4155af717259908d6812d` | `0x2798a8dc91bf1ef502cf8710751d26128fdf8e9d0823522fc08632ecc9172e8` |
| Default renderer | `0x711ce0a203434e8ce79ae90366e32d1289f5c07ae02de9a9226f3948f2761a4` | `0x1a75c643d98a987cfd962bc05768ddc1bed96857668217ff8367e1006c25a0c` |
| Classic renderer (species 1-75) | `0x62c1fa7709c3270fe8043b38dc3c360b689929ce176ba8288d910cf0d4dbecd` | `0x1cda1fa6d9d97f484603e32a7958cc0693dc971582319b9577b136d23019bd5` |
| Original art provider | `0x2a2f693c348375bd8bc71e9ab0a22a354b053270f769f35359a4d5e454d9d07` | `0x7a1b0c5b8d7d37ed52bc2c0866acea4100aa18f66eae82dc565546ce56c2b7b` |
| Artist credential | `0x4472df7966be9fce5274a3ac96f106ce45ade7e36cc4812660182f36e2a6439` | `0x4b518b55a93fcd540388fc564867a5a826456c15ebbb53b94a7687e42ee7ef1` |

Chain IDs: Sepolia `0x534e5f5345504f4c4941` (`SN_SEPOLIA`), mainnet `0x534e5f4d41494e` (`SN_MAIN`).

Treat the NFT and registry addresses as the roots. Resolve per-species contracts from the
registry at runtime (`get_sound_manager`, `get_renderer`, `get_art_provider`), because a species
owner can repoint them and a pinned manager can be superseded.

## Live class hashes

Sepolia and mainnet run the same class for every contract above.

| Contract | Class hash |
| --- | --- |
| NFT | `0x1eeda90a209aa3b70da6b30dd9cf4bc70d7c12a886ffc6f924514ab431a0eb` |
| Registry | `0x715bf2373fd8482c0c26219374244fb2efce2cc49ab286ee53ad2b8a540ec2c` |
| Renderers | `0x1485edfb89d2997c76938828d76bcb8625aaa0307b605a5dd5a3a73d9b37b28` |
| Sound Manager | `0x538ed7f5af4bf4b55bceb2efdac8ec2df4e8b1cfd2663d943631aa667236692` |
| Art provider | `0x8ca6a968e6b63b3720504584b2421f910751f125d1883f52440bf89bb308cc` |
| Credential | `0x4c2fe0677e107f4368697849c2201d145572f13dd619c8503c886824d55b23` |
| SKULL | `0x6577876f6a4349a735b45a3b0ecc95cefdd3380c34b98c5864591a67ed87861` |

## What differs from mainnet

| Topic | Sepolia | Mainnet |
| --- | --- | --- |
| Inventory | Supply starts at 375: 75 Genesis and 300 test renditions, plus whatever has been minted since. Mainnet's Beasts are not copied, by design | 86,000+ Beasts, 75 of them Genesis |
| New Beasts | From the hackathon faucet, or your own species | Beast Mode gameplay is the minter of species 1-75 |
| Community registration | **Open**: anyone can register a species | Closed |
| Token IDs | Different. The same identity has a different ID on each network | Different |
| Rankings | Mostly unranked, so `get_beast_rank` is often 0 | Ranked at launch, with newer Beasts at 0 until `update_rankings` |
| Beast Mode and kill verifier | Absent | Species 1-75 use Beast Mode for both |
| SKULL | Separate test token, with no mainnet value | Live token |
| Owners, DAO, salts, block entropy | Differ | Differ |

Never assume who holds admin rights on either network. Participants don't need owner authority
for reads, or for registering and running their own species. If an owner value matters to your
code, read it from the chain at runtime.

## Event RPC

This shared Sepolia endpoint is provided for this event only and will be retired afterwards:

`https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe`

It served `token_uri`, sound, simulations and a real send. Everyone shares its quota, so cache results
and don't use it for bulk crawling. Bring your own key for anything long-running. Change it with `--rpc <url>`
or `BEASTS_RPC_URL`. If it's exhausted, use the public endpoints below.

## RPC guidance

Public endpoints differ by call, not only by uptime. `token_uri` renders a whole card and player
page, so an endpoint with a low call gas limit reverts it with `Out of gas`
(`0x4f7574206f6620676173`) while still serving ordinary reads. **Test the exact calls your app makes.**

**Use PublicNode for transactions and ordinary reads, and Zan only for what PublicNode can't serve.**
A single tester's `sncast` send was rate-limited on Zan with `cu limit exceeded`, and the same send then
worked through PublicNode. If you are limited anyway, back off and retry or use your own endpoint.

The bundled scripts default to the event RPC above. Pass `--rpc <url>` or set `BEASTS_RPC_URL` to change it.

Sepolia, tested 2026-11-04:

| Call | PublicNode | Zan |
| --- | --- | --- |
| Transactions | **Yes**, sent with `sncast` | Rate-limited |
| Ordinary reads, receipts, `tracks` | **Yes** | Yes, rate-limited |
| Simulations, including `species-calls.mjs preview` | **Yes** | Yes, rate-limited |
| `token_uri` | **No**, `Out of gas` | **Yes**. Retry with backoff |
| `preview_inputs` (`audition`) with a Song | **No**, `Out of gas` | **Yes** |
| `get_track_sound`, `get_beast_sound` (`track`) | Sound Check only. Songs give `Out of gas` | **Yes** |

Other endpoints:

| Endpoint | Status |
| --- | --- |
| `https://starknet-sepolia-rpc.publicnode.com` | PublicNode, as above |
| `https://api.zan.top/public/starknet-sepolia/rpc/v0_10` | Zan, as above |
| `https://starknet-sepolia.drpc.org` | Ordinary reads work. `token_uri` has both reverted with `Out of gas` and returned, so don't depend on it |
| `https://api.cartridge.gg/x/starknet/sepolia` | Discontinued: HTTP 410. Older Beasts code defaults to this URL, so override it |

Mainnet, tested 2026-11-04: `https://api.zan.top/public/starknet-mainnet/rpc/v0_10` and
`https://rpc.provable.games/rpc` both return `token_uri`.

Calling patterns that keep you out of trouble:

- Cache `token_uri` results. A response is 180-200 KB and about 6,000 felts.
- Run calls one at a time with backoff on public endpoints, rather than fanning out across a collection.
- Use the attributes you can decode offline from the token ID before fetching metadata.
- In a browser, make your RPC URL configurable. A team event can exhaust a shared rate limit.
- Bring your own provider key if you have one, and keep it out of committed code.
