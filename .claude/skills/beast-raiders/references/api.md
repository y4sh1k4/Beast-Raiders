# Server API (Node + Express, ESM)

All bodies are JSON. Token IDs, amounts and nonces are **decimal or 0x strings**, never JS numbers.
Errors: `{ "error": "message" }` with 400 (bad input), 403 (not owner / no stamina), 404 (no run).

## Env (`server/.env`)

```
PORT=8787
STARKNET_RPC_URL=https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/alch_mAm2Rh8vg2fbpMYO7LoJe   # Cartridge Sepolia is discontinued (HTTP 410)
BEASTS_ADDRESS=0x...          # Sepolia Beasts collection from the organizers
GEM_ADDRESS=0x...             # your deployed GemRewards
SIGNER_PRIVATE_KEY=0x...      # stark key; its public key was passed to the GemRewards constructor
ALLOW_DEMO=true
```

`web/.env`: `VITE_API_URL`, `VITE_GEM_ADDRESS`, `VITE_BEASTS_ADDRESS`, `VITE_CHAIN=sepolia`.

## Endpoints

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /api/beasts?owner=0x..` | | `[{ tokenId, ...enrich(beast), kit, staminaLeft }]` |
| `GET /api/beasts/:tokenId` | | one beast (for pasted IDs) |
| `POST /api/runs` | `{ owner, tokenId, clientSeed, difficulty }` or `{ demo: true, clientSeed, difficulty }` | `{ runId, ...publicView(run) }` — includes `commit` |
| `POST /api/runs/:id/reveal` | `{ tile }` | `{ result, view }` |
| `POST /api/runs/:id/peek` | `{ tile }` | `{ result, view }` |
| `POST /api/runs/:id/special` | `{ arg }` (row for scry, tile for track, none for smash) | `{ result, view }` |
| `POST /api/runs/:id/cashout` | | `{ multiplier, reward, claim, view }` — `claim` is `null` for demo runs |
| `GET /api/runs/:id` | | `{ view }` (seed + traps only once ended) |
| `GET /api/leaderboard` | | top 10 today |

`claim` = `{ amount, nonce, r, s }` with `amount` in wei (18 decimals) as a decimal string.

## Run start checks (in this order)

1. `difficulty ∈ {easy, normal, hard}`; `clientSeed` 1–64 chars.
2. Not demo → `owner_of(tokenId) == owner` (normalize both with `num.toHex(BigInt(x))`).
3. Stamina left for `tokenId` today.
4. Beast traits: `decodeTokenId` → fall back to `get_beast` (see beast-nfts skill).
5. `createRun({ beast, clientSeed, difficulty })`, store in `Map<runId, {run, owner, tokenId, demo}>`.
   Use `crypto.randomUUID()` for `runId`. Expire runs after 30 min.

## Claim signing (tested against the Cairo contract)

```js
import { ec, hash, num } from 'starknet';
import { randomBytes } from 'node:crypto';

const SIGNER = process.env.SIGNER_PRIVATE_KEY;
export const signerPublicKey = ec.starkCurve.getStarkKey(SIGNER); // pass to GemRewards constructor

export function signClaim({ contract, player, rewardGem }) {
  const amount = BigInt(rewardGem) * 10n ** 18n;
  const low = amount & ((1n << 128n) - 1n), high = amount >> 128n;
  const nonce = '0x' + randomBytes(31).toString('hex');          // < 2^251, fits a felt
  const msg = hash.computePoseidonHashOnElements([contract, player, low, high, nonce]);
  const sig = ec.starkCurve.sign(msg, SIGNER);
  return { amount: amount.toString(), nonce, r: num.toHex(sig.r), s: num.toHex(sig.s) };
}
```

`player` must be the address that will send the claim tx (the beast owner). Sign once per run;
store the claim on the run so a page refresh can fetch it again via `GET /api/runs/:id`.

Generate a signer key: `node -e "import('starknet').then(({ec})=>{const k=ec.starkCurve.utils.randomPrivateKey();console.log('0x'+Buffer.from(k).toString('hex'))})"`
(if that util is renamed in your starknet.js version, any random 31-byte hex works).

## Reading the chain (server)

```js
import { RpcProvider, num } from 'starknet';
const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
const u256 = (x) => { const v = BigInt(x); return [num.toHex(v & ((1n << 128n) - 1n)), num.toHex(v >> 128n)]; };

export async function ownerOf(tokenId) {
  const [o] = await provider.callContract({ contractAddress: process.env.BEASTS_ADDRESS, entrypoint: 'owner_of', calldata: u256(tokenId) });
  return num.toHex(BigInt(o));
}
export async function beastsOf(owner) {
  const B = process.env.BEASTS_ADDRESS;
  const [lo, hi] = await provider.callContract({ contractAddress: B, entrypoint: 'balance_of', calldata: [owner] });
  const n = Number(BigInt(lo) + (BigInt(hi) << 128n));
  const ids = [];
  for (let i = 0; i < Math.min(n, 50); i++) {
    const [a, b] = await provider.callContract({ contractAddress: B, entrypoint: 'token_of_owner_by_index', calldata: [owner, ...u256(i)] });
    ids.push((BigInt(a) + (BigInt(b) << 128n)).toString());
  }
  return ids;
}
```

## Client (React) essentials

- Wallet: `@starknet-react/core` with injected connectors (Argent X, Braavos) on Sepolia.
  Check the package's current README for the provider setup; APIs change between majors.
- Claim tx: `account.execute({ contractAddress: GEM, entrypoint: 'claim', calldata: CallData.compile({ amount: cairo.uint256(claim.amount), nonce: claim.nonce, sig_r: claim.r, sig_s: claim.s }) })`.
- Faucet tx: `entrypoint: 'faucet', calldata: []`.
- GEM balance: `balance_of(address)` → u256 → divide by 1e18 for display.
- Beast image: call `token_uri` once per beast, `atob` the base64 JSON, use its `image` field
  in an `<img>`; cache in memory.
- Board: 5×5 CSS grid of buttons. Tile states: hidden, safe (gem), trap-countered, trap-hit,
  peeked-safe (outline), peeked-trap (red outline). Show shields, peeks, special button,
  multiplier, Cash out button, `commit` (shortened).
- After the run: "Verify fairness" button → `verifyRun(view)` from `shared/engine.mjs`.
