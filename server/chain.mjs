// Starknet reads over raw JSON-RPC with endpoint fallback, plus claim signing.
import { ec, hash, num, selector } from 'starknet';
import { randomBytes } from 'node:crypto';

const PUBLICNODE = 'https://starknet-sepolia-rpc.publicnode.com';
const ZAN = 'https://api.zan.top/public/starknet-sepolia/rpc/v0_10';

const READ_RPCS = [process.env.STARKNET_RPC_URL, PUBLICNODE].filter(Boolean);
const URI_RPCS = [ZAN, process.env.STARKNET_RPC_URL].filter(Boolean); // PublicNode runs out of gas on token_uri

const U128 = (1n << 128n) - 1n;
export const u256 = (x) => { const v = BigInt(x); return [num.toHex(v & U128), num.toHex(v >> 128n)]; };
export const normAddr = (a) => num.toHex(BigInt(a));

async function rpcCall(url, contractAddress, entrypoint, calldata) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'starknet_call',
      params: { request: { contract_address: contractAddress, entry_point_selector: selector.getSelectorFromName(entrypoint), calldata: calldata.map((c) => num.toHex(BigInt(c))) }, block_id: 'latest' },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC error: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.result;
}

async function call(urls, contract, entrypoint, calldata = []) {
  let lastErr;
  for (const url of urls) {
    try { return await rpcCall(url, contract, entrypoint, calldata); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const BEASTS = () => process.env.BEASTS_ADDRESS;

export async function ownerOf(tokenId) {
  const [o] = await call(READ_RPCS, BEASTS(), 'owner_of', u256(tokenId));
  return normAddr(o);
}

export async function beastsOf(owner, limit = 30) {
  const r = await call(READ_RPCS, BEASTS(), 'balance_of', [owner]);
  const n = Number(BigInt(r[0]) + (BigInt(r[1] ?? 0) << 128n));
  const ids = await Promise.all(Array.from({ length: Math.min(n, limit) }, async (_, i) => {
    // Beasts returns the 251-bit ID as one felt
    const [id] = await call(READ_RPCS, BEASTS(), 'token_of_owner_by_index', [owner, ...u256(i)]);
    return BigInt(id).toString();
  }));
  return ids;
}

/** Live token IDs of one species (Beasts view: felt species ID -> Array<felt> of IDs). */
export async function speciesTokenIds(speciesId) {
  const felts = await call(READ_RPCS, BEASTS(), 'get_species_token_ids', [speciesId]);
  return felts.slice(1).map((f) => BigInt(f).toString());
}

export async function isNonceUsed(nonce) {
  const [r] = await call(READ_RPCS, process.env.GEM_ADDRESS, 'is_nonce_used', [nonce]);
  return BigInt(r) !== 0n;
}

export async function gemBalance(address) {
  if (!process.env.GEM_ADDRESS) return null;
  const [lo, hi] = await call(READ_RPCS, process.env.GEM_ADDRESS, 'balance_of', [address]);
  return (BigInt(lo) + (BigInt(hi) << 128n)).toString();
}

function decodeByteArray(felts) {
  const n = Number(BigInt(felts[0]));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(Buffer.from(BigInt(felts[1 + i]).toString(16).padStart(62, '0'), 'hex'));
  const pending = BigInt(felts[1 + n]), plen = Number(BigInt(felts[2 + n]));
  if (plen) parts.push(Buffer.from(pending.toString(16).padStart(plen * 2, '0'), 'hex'));
  return Buffer.concat(parts).toString('utf8');
}

// token_uri is expensive and shared-quota: cache forever (traits in the ID are immutable).
const metaCache = new Map();
export async function tokenMetadata(tokenId) {
  const key = BigInt(tokenId).toString();
  if (metaCache.has(key)) return metaCache.get(key);
  const p = (async () => {
    const uri = decodeByteArray(await call(URI_RPCS, BEASTS(), 'token_uri', u256(tokenId)));
    const m = uri.match(/^data:application\/json;base64,(.*)$/s);
    const json = JSON.parse(m ? Buffer.from(m[1], 'base64').toString('utf8') : decodeURIComponent(uri.split(',')[1]));
    return json;
  })();
  metaCache.set(key, p);
  p.catch(() => metaCache.delete(key));
  return p;
}

// ---------- stake verification: player sent `amount` GEM to the house in tx `txHash` ----------

const TRANSFER_SEL = BigInt(selector.getSelectorFromName('Transfer'));
export const houseAddress = () => process.env.HOUSE_ADDRESS || process.env.GEM_ADDRESS || null;

async function getReceipt(txHash) {
  for (const url of READ_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'starknet_getTransactionReceipt', params: { transaction_hash: txHash } }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json();
      if (body.result) return body.result;
    } catch { /* try next RPC */ }
  }
  return null; // not found (yet)
}

/** Waits up to `timeoutMs` for the tx, then checks it holds a GEM Transfer player -> house of exactly amountWei. */
export async function verifyStakeTx({ txHash, player, amountWei, timeoutMs = 90_000 }) {
  const gem = BigInt(process.env.GEM_ADDRESS), house = BigInt(houseAddress()), from = BigInt(player);
  const deadline = Date.now() + timeoutMs;
  let receipt = null;
  while (!(receipt = await getReceipt(txHash))) {
    if (Date.now() > deadline) throw new Error('stake tx not found on chain yet, try again in a moment');
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (receipt.execution_status !== 'SUCCEEDED') throw new Error(`stake tx ${receipt.execution_status ?? 'failed'}`);
  const ok = (receipt.events ?? []).some((ev) => {
    if (BigInt(ev.from_address) !== gem || BigInt(ev.keys?.[0] ?? 0) !== TRANSFER_SEL) return false;
    // OZ v3 ERC20: keys [sel, from, to], data [low, high]. Older layout: all in data.
    const [f, t, lo, hi] = ev.keys.length >= 3 ? [ev.keys[1], ev.keys[2], ev.data[0], ev.data[1]] : ev.data;
    return BigInt(f) === from && BigInt(t) === house && BigInt(lo) + (BigInt(hi) << 128n) === amountWei;
  });
  if (!ok) throw new Error('stake tx does not transfer the stake from you to the house');
}

// ---------- claim signing (tested against the Cairo contract; keep in sync) ----------

export const claimsEnabled = () => Boolean(process.env.GEM_ADDRESS && process.env.SIGNER_PRIVATE_KEY);

export function signClaim({ player, rewardGem }) {
  const SIGNER = process.env.SIGNER_PRIVATE_KEY;
  const contract = process.env.GEM_ADDRESS;
  const amount = BigInt(rewardGem) * 10n ** 18n;
  const low = amount & U128, high = amount >> 128n;
  const nonce = '0x' + randomBytes(31).toString('hex'); // < 2^251, fits a felt
  const msg = hash.computePoseidonHashOnElements([contract, player, low, high, nonce]);
  const sig = ec.starkCurve.sign(msg, SIGNER);
  return { amount: amount.toString(), nonce, r: num.toHex(sig.r), s: num.toHex(sig.s) };
}
