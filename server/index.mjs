import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import {
  createRun, publicView, reveal, peek, useSpecial, cashOut, DIFFICULTY, BASE_REWARD,
} from '../shared/engine.mjs';
import { beastFromTokenId, DEMO_BEAST } from '../shared/beast.mjs';
import {
  ownerOf, beastsOf, gemBalance, tokenMetadata, signClaim, claimsEnabled, normAddr, speciesTokenIds,
  verifyStakeTx, houseAddress,
} from './chain.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const ALLOW_DEMO = process.env.ALLOW_DEMO !== 'false';
const STAMINA_PER_DAY = 3;
const RUN_TTL_MS = 30 * 60 * 1000;
// Players stake whole GEM on a run: cash out stake × multiplier, lose it on death.
const MIN_STAKE = 1;
const MAX_STAKE = 1000;
const DEFAULT_STAKE = BASE_REWARD; // practice runs / claims disabled: virtual stake

const app = express();
app.use(cors());
app.use(express.json({ limit: '16kb' }));

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);

// ---------- stamina + leaderboard (in memory) ----------

const today = () => new Date().toISOString().slice(0, 10);
const stamina = new Map(); // tokenId -> { day, used }
const staminaLeft = (tokenId) => {
  const s = stamina.get(tokenId);
  return !s || s.day !== today() ? STAMINA_PER_DAY : Math.max(0, STAMINA_PER_DAY - s.used);
};
const spendStamina = (tokenId) => {
  const s = stamina.get(tokenId);
  if (!s || s.day !== today()) stamina.set(tokenId, { day: today(), used: 1 });
  else s.used++;
};

const board = new Map(); // key -> entry (today only)
function recordScore(entry) {
  const key = entry.demo ? `demo:${entry.tokenId ?? 'warlock'}` : entry.tokenId;
  const prev = board.get(key);
  if (!prev || prev.day !== today() || entry.reward > prev.reward) board.set(key, { ...entry, day: today() });
}

// ---------- beasts ----------

function beastJson(tokenId) {
  const b = beastFromTokenId(tokenId);
  return { tokenId: BigInt(tokenId).toString(), ...b, staminaLeft: staminaLeft(BigInt(tokenId).toString()) };
}

const parseTokenId = (raw) => {
  try { const id = BigInt(raw); if (id <= 0n) throw 0; return id.toString(); } catch { throw bad('bad tokenId'); }
};
const parseAddr = (raw) => {
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(raw)) throw bad('bad address');
  return normAddr(raw);
};

app.get('/api/config', (_req, res) => {
  res.json({ claims: claimsEnabled(), demo: ALLOW_DEMO, gemAddress: process.env.GEM_ADDRESS || null, houseAddress: claimsEnabled() ? houseAddress() : null, minStake: MIN_STAKE, maxStake: MAX_STAKE, difficulties: DIFFICULTY, staminaPerDay: STAMINA_PER_DAY });
});

app.get('/api/beasts', async (req, res) => {
  const owner = parseAddr(req.query.owner);
  let ids;
  try { ids = await beastsOf(owner); } catch (e) { throw new HttpError(502, `chain read failed: ${e.message}`); }
  const out = [];
  for (const id of ids) { try { out.push(beastJson(id)); } catch { /* skip undecodable */ } }
  res.json(out);
});

app.get('/api/beasts/demo', (_req, res) => {
  if (!ALLOW_DEMO) throw new HttpError(403, 'demo disabled');
  res.json({ tokenId: null, demo: true, ...DEMO_BEAST, staminaLeft: 99 });
});

// ---------- showcase: real Sepolia beasts anyone can practice with (no rewards) ----------

// Genesis species spread across Type (1-25 Magic, 26-50 Hunter, 51-75 Brute) and Tier (5 per tier).
const SHOWCASE_SPECIES = [1, 7, 12, 22, 30, 36, 41, 46, 51, 55, 61, 70];
const SHOWCASE_TTL_MS = 10 * 60 * 1000;
let showcase = { at: 0, beasts: [], ids: new Set(), pending: null };

async function loadShowcase() {
  const perSpecies = await Promise.all(SHOWCASE_SPECIES.map((s) => speciesTokenIds(s).catch(() => [])));
  const picked = [];
  for (const ids of perSpecies) {
    const seen = new Set();
    const beasts = ids.map((id) => { try { return beastJson(id); } catch { return null; } }).filter(Boolean);
    // Prefer beasts with unusual stats over the stock L100/H100 renditions, one per trait combo.
    beasts.sort((a, b) => Number(b.level !== 100 || b.health !== 100) - Number(a.level !== 100 || a.health !== 100) || b.shiny - a.shiny);
    for (const b of beasts) {
      const key = `${b.level}/${b.health}/${b.shiny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stock = b.level === 100 && b.health === 100;
      if (seen.size > 1 && stock) continue; // a second pick only if its stats stand out
      picked.push({ ...b, demo: true, staminaLeft: 99 });
      if (seen.size >= 2) break;
    }
  }
  if (!picked.length) throw new Error('no showcase beasts readable');
  showcase = { at: Date.now(), beasts: picked, ids: new Set(picked.map((b) => b.tokenId)), pending: null };
  return showcase;
}

async function getShowcase() {
  if (showcase.beasts.length && Date.now() - showcase.at < SHOWCASE_TTL_MS) return showcase;
  showcase.pending ??= loadShowcase().catch((e) => { showcase.pending = null; if (showcase.beasts.length) return showcase; throw e; });
  return showcase.pending;
}

app.get('/api/beasts/showcase', async (_req, res) => {
  if (!ALLOW_DEMO) throw new HttpError(403, 'demo disabled');
  try { res.json((await getShowcase()).beasts); } catch (e) { throw new HttpError(502, `showcase read failed: ${e.message}`); }
});

app.get('/api/beasts/:tokenId', (req, res) => {
  try { res.json(beastJson(parseTokenId(req.params.tokenId))); } catch (e) { throw e instanceof HttpError ? e : bad(e.message); }
});

app.get('/api/beasts/:tokenId/image', async (req, res) => {
  const id = parseTokenId(req.params.tokenId);
  let meta;
  try { meta = await tokenMetadata(id); } catch (e) { throw new HttpError(502, `token_uri failed: ${e.message}`); }
  const img = String(meta.image ?? '');
  const m = img.match(/^data:image\/svg\+xml;base64,(.*)$/s);
  const svg = m ? Buffer.from(m[1], 'base64') : img.startsWith('data:image/svg+xml') ? Buffer.from(decodeURIComponent(img.split(',')[1])) : null;
  if (!svg) throw new HttpError(404, 'no image');
  res.set('content-type', 'image/svg+xml').set('cache-control', 'public, max-age=86400').send(svg);
});

app.get('/api/gem/:address', async (req, res) => {
  const addr = parseAddr(req.params.address);
  try { res.json({ balance: await gemBalance(addr) }); } catch (e) { throw new HttpError(502, e.message); }
});

// ---------- runs ----------

const runs = new Map(); // runId -> { run, owner, tokenId, demo, beast, stake, staked, claim, createdAt }
const usedStakeTx = new Set(); // stake tx hashes already turned into a run (in memory)
const pendingStakeTx = new Set();

setInterval(() => {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, r] of runs) if (r.createdAt < cutoff) runs.delete(id);
}, 60_000).unref();

const getRun = (id) => {
  const r = runs.get(id);
  if (!r) throw new HttpError(404, 'no run');
  return r;
};

function viewOf(entry) {
  const v = publicView(entry.run);
  return {
    runId: entry.id, demo: entry.demo, beast: entry.beast, stake: entry.stake, staked: entry.staked, fled: Boolean(entry.fled), ...v,
    ...(entry.run.status !== 'active' ? { claim: entry.claim ?? null, reward: entry.reward ?? 0 } : {}),
  };
}

app.post('/api/runs', async (req, res) => {
  const { owner, tokenId, clientSeed, difficulty, demo, stake: rawStake, stakeTx } = req.body ?? {};
  const stake = rawStake === undefined || rawStake === null ? DEFAULT_STAKE : Number(rawStake);
  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) throw bad(`stake must be a whole number of GEM, ${MIN_STAKE}-${MAX_STAKE}`);
  if (!(difficulty in DIFFICULTY)) throw bad('difficulty must be easy, normal or hard');
  if (typeof clientSeed !== 'string' || clientSeed.length < 1 || clientSeed.length > 64) throw bad('clientSeed must be 1-64 chars');

  let beast, ownerAddr = null, id = null;
  if (demo) {
    if (!ALLOW_DEMO) throw new HttpError(403, 'demo disabled');
    if (tokenId !== undefined && tokenId !== null) {
      // Only real beasts from the showcase: stops crafted token IDs with fake max stats.
      id = parseTokenId(tokenId);
      const sc = await getShowcase().catch(() => null);
      if (!sc?.ids.has(id)) throw bad('not a showcase beast');
      beast = beastFromTokenId(id);
    } else {
      beast = DEMO_BEAST;
    }
  } else {
    ownerAddr = parseAddr(owner);
    id = parseTokenId(tokenId);
    let actual;
    try { actual = await ownerOf(id); } catch (e) { throw new HttpError(502, `owner_of failed: ${e.message}`); }
    if (actual !== ownerAddr) throw new HttpError(403, 'you do not own this beast');
    if (staminaLeft(id) <= 0) throw new HttpError(403, 'no stamina left today');
    try { beast = beastFromTokenId(id); } catch (e) { throw bad(e.message); }
  }

  // Real GEM is on the line only for owned beasts when the reward contract is live.
  const staked = !demo && claimsEnabled();
  let txKey = null;
  if (staked) {
    if (typeof stakeTx !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(stakeTx)) throw bad('stakeTx required: transfer your stake to the house first');
    txKey = normAddr(stakeTx);
    if (usedStakeTx.has(txKey) || pendingStakeTx.has(txKey)) throw new HttpError(409, 'this stake tx was already used');
    pendingStakeTx.add(txKey);
    try {
      await verifyStakeTx({ txHash: txKey, player: ownerAddr, amountWei: BigInt(stake) * 10n ** 18n });
    } catch (e) { pendingStakeTx.delete(txKey); throw bad(e.message); }
  }

  let run;
  try { run = await createRun({ beast, clientSeed, difficulty }); } finally { if (txKey) pendingStakeTx.delete(txKey); }
  if (txKey) usedStakeTx.add(txKey); // only burn the tx once the run exists, so a failed start can be retried
  if (!demo) spendStamina(id);
  const entry = { id: randomUUID(), run, owner: ownerAddr, tokenId: id, demo: Boolean(demo), beast: { ...beast, tokenId: id }, stake, staked, createdAt: Date.now() };
  runs.set(entry.id, entry);
  res.json(viewOf(entry));
});

const intArg = (v) => (v === undefined || v === null ? v : Number(v));

function act(fn) {
  return (req, res) => {
    const entry = getRun(req.params.id);
    let result;
    try { result = fn(entry.run, intArg(req.body?.tile ?? req.body?.arg)); } catch (e) { throw bad(e.message); }
    if (entry.run.status === 'cashed' && entry.reward === undefined) settle(entry); // cleared the board
    res.json({ result, view: viewOf(entry) });
  };
}

function settle(entry) {
  const { multiplier } = publicView(entry.run);
  const raw = Math.floor(entry.stake * multiplier);
  // Community species self-declare traits: they can win their stake back, never profit.
  const reward = entry.beast.community ? Math.min(raw, entry.stake) : raw;
  entry.reward = reward;
  entry.multiplier = multiplier;
  if (!entry.demo && claimsEnabled() && reward > 0) entry.claim = signClaim({ player: entry.owner, rewardGem: reward });
  recordScore({ tokenId: entry.tokenId, name: entry.beast.fullName, typeName: entry.beast.typeName, owner: entry.owner, demo: entry.demo, stake: entry.stake, multiplier, reward });
}

app.post('/api/runs/:id/reveal', act((run, tile) => reveal(run, tile)));
app.post('/api/runs/:id/peek', act((run, tile) => peek(run, tile)));
app.post('/api/runs/:id/special', act((run, arg) => useSpecial(run, arg)));

app.post('/api/runs/:id/cashout', (req, res) => {
  const entry = getRun(req.params.id);
  if (entry.reward === undefined) {
    try { cashOut(entry.run); } catch (e) { throw bad(e.message); }
    settle(entry);
  }
  res.json({ multiplier: entry.multiplier, reward: entry.reward, claim: entry.claim ?? null, view: viewOf(entry) });
});

// Leave mid-run: counts as a loss, the stake is forfeited (otherwise fleeing would be a free reroll).
app.post('/api/runs/:id/flee', (req, res) => {
  const entry = getRun(req.params.id);
  if (entry.run.status === 'active') { entry.run.status = 'lost'; entry.fled = true; }
  res.json({ result: { fled: true }, view: viewOf(entry) });
});

app.get('/api/runs/:id', (req, res) => res.json({ view: viewOf(getRun(req.params.id)) }));

app.get('/api/leaderboard', (_req, res) => {
  const d = today();
  res.json([...board.values()].filter((e) => e.day === d).sort((a, b) => b.reward - a.reward || b.multiplier - a.multiplier).slice(0, 10));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'server error' });
});

app.listen(PORT, () => console.log(`Beast Raiders API on :${PORT} · claims ${claimsEnabled() ? 'ON' : 'OFF (set GEM_ADDRESS + SIGNER_PRIVATE_KEY)'} · demo ${ALLOW_DEMO}`));

