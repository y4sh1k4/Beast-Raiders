// API client, injected Starknet wallet, and tiny synth sound effects.

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

export type Kit = { shields: number; peeks: number; tierBonus: number; special: 'scry' | 'track' | 'smash'; typeName: string };
export type Beast = {
  tokenId: string | null; demo?: boolean; speciesId: string; tier: number; beastType: number;
  level: number; health: number; shiny: number; typeName: string; baseName: string; fullName: string;
  power: number; kit: Kit; staminaLeft: number; community: boolean;
};
export type Revealed = { safe: boolean; trapType?: number; damage?: number; disarmed?: boolean };
export type Claim = { amount: string; nonce: string; r: string; s: string };
export type View = {
  runId: string; demo: boolean; beast: Beast; stake: number; staked: boolean; fled?: boolean; status: 'active' | 'lost' | 'cashed'; difficulty: string;
  trapCount: number; commit: string; clientSeed: string; shields: number; peeks: number; kit: Kit;
  specialUsed: boolean; safeCount: number; multiplier: number; revealed: Record<string, Revealed>;
  serverSeed?: string; traps?: Record<string, number>; claim?: Claim | null; reward?: number;
};
export type Config = {
  claims: boolean; demo: boolean; gemAddress: string | null; staminaPerDay: number
  houseAddress: string | null; minStake: number; maxStake: number
};
export type Score = { tokenId: string | null; name: string; typeName: string; owner: string | null; demo: boolean; stake?: number; multiplier: number; reward: number };

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export const beastImage = (tokenId: string) => `${API}/api/beasts/${tokenId}/image`;

export const formatGem = (wei: string | null | undefined) => {
  if (!wei) return '0';
  const v = BigInt(wei);
  const whole = v / 10n ** 18n;
  return whole.toLocaleString();
};

export const randomClientSeed = () => {
  const words = ['ember', 'rune', 'fang', 'moss', 'skull', 'storm', 'gold', 'ash', 'bone', 'void', 'thorn', 'echo'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 9000 + 1000)}`;
};

// ---------- wallet (Starknet injected wallet API, no extra deps) ----------

type RpcReq = { type: string; params?: unknown };
export type Wallet = { id?: string; name?: string; icon?: string | { dark: string }; request: (r: RpcReq) => Promise<any> };

const SN_SEPOLIA = '0x534e5f5345504f4c4941';

// Wallets that announce themselves via the wallet-standard events (newer Ready / Braavos builds).
const standardWallets: Wallet[] = [];
type StdWallet = { name?: string; icon?: string; features?: Record<string, { request?: Wallet['request'] }> };
const registerApi = {
  register: (...ws: StdWallet[]) => {
    for (const sw of ws) {
      const api = sw.features?.['starknet:walletApi'];
      if (api && typeof api.request === 'function' && !standardWallets.some((x) => x.name === sw.name)) {
        standardWallets.push({ id: sw.name, name: sw.name, icon: sw.icon, request: api.request.bind(api) });
      }
    }
    return () => {};
  },
};
if (typeof window !== 'undefined') {
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    const cb = (e as CustomEvent).detail;
    if (typeof cb === 'function') cb(registerApi);
  });
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: registerApi }));
}

const KNOWN_KEYS = ['starknet', 'starknet_ready', 'starknet_argentX', 'starknet_braavos', 'starknet_okxwallet', 'starknet_keplr'];

export function findWallets(): Wallet[] {
  const w = window as unknown as Record<string, unknown>;
  const out: Wallet[] = [];
  // getOwnPropertyNames also sees the non-enumerable props that extensions inject.
  const keys = new Set([...KNOWN_KEYS, ...Object.getOwnPropertyNames(window).filter((k) => k.startsWith('starknet'))]);
  for (const k of keys) {
    const c = w[k] as Wallet | undefined;
    if (c && typeof c.request === 'function' && !out.includes(c)) out.push(c);
  }
  for (const s of standardWallets) if (!out.some((x) => x.name === s.name)) out.push(s);
  return out;
}

export async function connectWallet(wallet: Wallet): Promise<string> {
  const accounts: string[] = await wallet.request({ type: 'wallet_requestAccounts' });
  if (!accounts?.length) throw new Error('No account returned');
  try {
    const chain: string = await wallet.request({ type: 'wallet_requestChainId' });
    if (BigInt(chain) !== BigInt(SN_SEPOLIA)) {
      await wallet.request({ type: 'wallet_switchStarknetChain', params: { chainId: SN_SEPOLIA } });
    }
  } catch { /* some wallets lack these methods; the tx will fail loudly if on the wrong chain */ }
  return '0x' + BigInt(accounts[0]).toString(16);
}

export async function invoke(wallet: Wallet, contract: string, entrypoint: string, calldata: string[]): Promise<string> {
  const res = await wallet.request({
    type: 'wallet_addInvokeTransaction',
    params: { calls: [{ contract_address: contract, entry_point: entrypoint, calldata }] },
  });
  return res.transaction_hash;
}

export function claimCalldata(c: Claim): string[] {
  const a = BigInt(c.amount);
  const U128 = (1n << 128n) - 1n;
  return ['0x' + (a & U128).toString(16), '0x' + (a >> 128n).toString(16), c.nonce, c.r, c.s];
}

/** ERC20 transfer(recipient, u256) calldata for a whole-GEM amount (18 decimals). */
export function transferCalldata(to: string, gemWhole: number): string[] {
  const a = BigInt(gemWhole) * 10n ** 18n;
  const U128 = (1n << 128n) - 1n;
  return [to, '0x' + (a & U128).toString(16), '0x' + (a >> 128n).toString(16)];
}

export const wholeGem = (wei: string | null | undefined) => (wei ? Number(BigInt(wei) / 10n ** 18n) : 0);

export const short = (s: string, n = 6) => (s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s);

// ---------- sound ----------

let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('br-muted') === '1'; } catch { return false; } })();
export const isMuted = () => muted;
export const setMuted = (m: boolean) => { muted = m; try { localStorage.setItem('br-muted', m ? '1' : '0'); } catch { /* ignore */ } };

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, when = 0, slideTo?: number) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* audio unavailable */ }
}

export const sfx = {
  click: () => tone(320, 0.05, 'square', 0.03),
  gem: (streak: number) => { tone(420 + streak * 55, 0.1, 'triangle', 0.08); tone(840 + streak * 110, 0.14, 'sine', 0.05, 0.06); },
  counter: () => { tone(1400, 0.06, 'square', 0.05); tone(1900, 0.12, 'square', 0.04, 0.05); },
  hit: () => { tone(140, 0.35, 'sawtooth', 0.12, 0, 40); tone(70, 0.4, 'square', 0.08, 0.02, 30); },
  peek: () => tone(500, 0.25, 'sine', 0.06, 0, 1100),
  special: () => { [600, 900, 1200].forEach((f, i) => tone(f, 0.15, 'triangle', 0.06, i * 0.06)); },
  cash: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'square', 0.05, i * 0.08)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, i * 0.16)); },
  start: () => { tone(220, 0.15, 'square', 0.05); tone(330, 0.25, 'square', 0.05, 0.12); },
};
