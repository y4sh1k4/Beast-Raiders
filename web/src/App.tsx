import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { verifyRun, multiplier as calcMultiplier, beats, BASE_REWARD } from '../../shared/engine.mjs'
import {
  api, beastImage, claimCalldata, connectWallet, findWallets, formatGem, invoke, invokeMany, isMuted, randomClientSeed,
  setMuted, sfx, short, transferCalldata, wholeGem,
  type Beast, type Config, type PendingClaim, type Revealed, type Score, type View, type Wallet,
} from './lib'

const GEM_ADDRESS = (import.meta.env.VITE_GEM_ADDRESS as string | undefined) || null
const TYPE_ICON = ['🔮', '🏹', '🪓']
const TRAP_ICON = ['🌀', '🗡️', '🪨']
const TRAP_NAME = ['Hex Rune', 'Spike Volley', 'Rockfall']
const TIER_NAME = ['', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON']
const SPECIAL = {
  scry: { name: 'SCRY', icon: '🔮', desc: 'Pick a row: learn how many traps hide in it.' },
  track: { name: 'TRACK', icon: '🐾', desc: 'Pick a tile: reveal it safely. Traps get disarmed.' },
  smash: { name: 'SMASH', icon: '💥', desc: 'Your next trap hit costs no shields.' },
} as const
const DUNGEONS = [
  { key: 'easy', name: 'Mossy Crypt', traps: 3, icon: '🕯️', flavour: 'Damp, quiet, mostly safe.' },
  { key: 'normal', name: 'Bone Halls', traps: 5, icon: '💀', flavour: 'Something rattles in the dark.' },
  { key: 'hard', name: 'The Abyss', traps: 8, icon: '🔥', flavour: 'Fortune favours the reckless.' },
] as const
type DungeonKey = (typeof DUNGEONS)[number]['key']

const RUN_KEY = 'br-run'
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v) } catch { /* ignore */ } },
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apiDown, setApiDown] = useState(false)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [gem, setGem] = useState<string | null>(null)
  const [beasts, setBeasts] = useState<Beast[] | null>(null)
  const [demoBeast, setDemoBeast] = useState<Beast | null>(null)
  const [showcase, setShowcase] = useState<Beast[] | null>(null)
  const [loadingBeasts, setLoadingBeasts] = useState(false)
  const [selected, setSelected] = useState<Beast | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'err' } | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const [scores, setScores] = useState<Score[]>([])
  const [pending, setPending] = useState<PendingClaim[]>([])
  const [claimingAll, setClaimingAll] = useState(false)

  const gemAddress = GEM_ADDRESS ?? config?.gemAddress ?? null

  const say = useCallback((text: string, kind: 'info' | 'err' = 'info') => {
    setToast({ text, kind })
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 4000)
  }, [])

  useEffect(() => {
    api<Config>('/api/config').then(setConfig).catch(() => setApiDown(true))
    api<Beast>('/api/beasts/demo').then((b) => setDemoBeast({ ...b, demo: true })).catch(() => {})
    api<Beast[]>('/api/beasts/showcase').then(setShowcase).catch(() => setShowcase([]))
    const runId = store.get(RUN_KEY)
    if (runId) api<{ view: View }>(`/api/runs/${runId}`).then((r) => setView(r.view)).catch(() => store.set(RUN_KEY, null))
  }, [])

  const refreshScores = useCallback(() => { api<Score[]>('/api/leaderboard').then(setScores).catch(() => {}) }, [])
  useEffect(() => { refreshScores() }, [refreshScores, view?.status])

  const refreshGem = useCallback(async (addr = address) => {
    if (!addr || !gemAddress) return null
    try { const r = await api<{ balance: string | null }>(`/api/gem/${addr}`); setGem(r.balance); return r.balance } catch { return null }
  }, [address, gemAddress])

  const refreshClaims = useCallback(async (addr = address) => {
    if (!addr || !gemAddress) return
    try { setPending(await api<PendingClaim[]>(`/api/claims/${addr}`)) } catch { /* keep last list */ }
  }, [address, gemAddress])
  useEffect(() => { refreshClaims() }, [refreshClaims, view?.status])

  /** Poll the GEM balance until it moves away from `before` (the chain needs a few seconds). */
  const waitForGem = useCallback(async (before: string | null, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const now = await refreshGem()
      if (now !== null && now !== before) return now
    }
    return null
  }, [refreshGem])

  const loadBeasts = useCallback(async (addr: string) => {
    setLoadingBeasts(true)
    try { setBeasts(await api<Beast[]>(`/api/beasts?owner=${addr}`)) } catch (e) { say(`Could not read your beasts: ${(e as Error).message}`, 'err'); setBeasts([]) }
    setLoadingBeasts(false)
  }, [say])

  const connect = async () => {
    sfx.click()
    const ws = findWallets()
    if (!ws.length) { say('No Starknet wallet found. Install Ready (Argent) or Braavos, or play the demo beast.', 'err'); return }
    try {
      const w = ws[0]
      const addr = await connectWallet(w)
      setWallet(w); setAddress(addr)
      loadBeasts(addr); refreshGem(addr); refreshClaims(addr)
    } catch (e) { say((e as Error).message, 'err') }
  }

  const sendTx = async (entry: string, calldata: string[]) => {
    if (!wallet || !gemAddress) throw new Error('Wallet or GEM contract missing')
    const before = gem
    const hash = await invoke(wallet, gemAddress, entry, calldata)
    say(`Tx sent ${short(hash)}: waiting for the chain…`)
    await waitForGem(before)
    return hash
  }

  const claimAll = async () => {
    if (!wallet || !gemAddress || !pending.length || claimingAll) return
    setClaimingAll(true)
    try {
      const total = pending.reduce((s, c) => s + c.reward, 0)
      const before = gem
      const hash = await invokeMany(wallet, gemAddress, 'claim', pending.map((c) => claimCalldata(c.claim)))
      say(`Claiming 💎${total} (${short(hash)}): waiting for the chain…`)
      await waitForGem(before)
      sfx.cash(); say(`+💎${total} GEM landed in your wallet!`)
      await refreshClaims()
    } catch (e) { say((e as Error).message, 'err') }
    setClaimingAll(false)
  }

  const faucet = async () => {
    try { await sendTx('faucet', []); sfx.cash(); say('+100 GEM from the faucet!') } catch (e) { say((e as Error).message, 'err') }
  }

  const stakesLive = Boolean(config?.claims && config.houseAddress && gemAddress)

  const startRun = async (beast: Beast, difficulty: DungeonKey, clientSeed: string, stake: number) => {
    try {
      let stakeTx: string | undefined
      if (stakesLive && (!beast.demo || wallet)) {
        if (!wallet || !gemAddress || !config?.houseAddress) throw new Error('Connect your wallet to stake GEM')
        if (stake > wholeGem(gem)) throw new Error(`You only have ${formatGem(gem)} GEM. Use the +100 faucet.`)
        stakeTx = await invoke(wallet, gemAddress, 'transfer', transferCalldata(config.houseAddress, stake))
        say(`Stake of 💎${stake} sent (${short(stakeTx)}). Waiting for the chain to confirm…`)
      }
      const body = beast.demo
        ? { demo: true, tokenId: beast.tokenId, clientSeed, difficulty, stake, ...(stakeTx ? { owner: address, stakeTx } : {}) }
        : { owner: address, tokenId: beast.tokenId, clientSeed, difficulty, stake, stakeTx }
      const before = gem
      const v = await api<View>('/api/runs', body)
      if (stakeTx) void waitForGem(before, 10) // stake left the wallet: show it as soon as the RPC catches up
      store.set(RUN_KEY, v.runId)
      sfx.start()
      setView(v)
    } catch (e) { say((e as Error).message, 'err') }
  }

  const leaveRun = () => {
    store.set(RUN_KEY, null)
    setView(null)
    setSelected(null)
    if (address) loadBeasts(address)
  }

  const toggleMute = () => { setMuted(!muted); setMutedState(!muted) }

  return (
    <div className="world">
      <div className="torch torch-l" aria-hidden />
      <div className="torch torch-r" aria-hidden />
      <header className="hud">
        <button className="logo" onClick={() => view?.status !== 'active' && leaveRun()} title="Back to camp">
          <span className="logo-gem">◆</span> BEAST<span className="logo-accent">RAIDERS</span>
        </button>
        <div className="hud-right">
          {address && gemAddress && (
            <div className="purse" title="Your GEM on Sepolia">
              <span className="purse-gem">💎</span>
              <span className="purse-amt">{formatGem(gem)}</span>
              <button className="btn-mini" onClick={faucet} title="Daily faucet: 100 GEM">+100</button>
            </div>
          )}
          {address && pending.length > 0 && (
            <button className="btn btn-gold btn-sm claim-pill" onClick={claimAll} disabled={claimingAll}
              title={pending.map((c) => `💎${c.reward} · ${c.name}`).join('\n')}>
              {claimingAll ? 'Claiming…' : `🎁 Claim 💎${pending.reduce((s, c) => s + c.reward, 0)}`}
            </button>
          )}
          {address
            ? <div className="wallet-chip"><span className="dot" />{short(address)}</div>
            : <button className="btn btn-gold btn-sm" onClick={connect}>Connect wallet</button>}
          <button className="btn-icon" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
        </div>
      </header>

      {apiDown && <div className="banner-err">The dungeon master is asleep: start the server (<code>cd server && npm run dev</code>).</div>}

      <main>
        {view ? (
          <Dungeon
            key={view.runId}
            initial={view}
            address={address}
            canClaim={Boolean(config?.claims && wallet && gemAddress)}
            onClaim={async (v) => { if (!v.claim) return; await sendTx('claim', claimCalldata(v.claim)); sfx.cash(); refreshClaims() }}
            onLeave={leaveRun}
            onAgain={(v) => {
              const pool = v.demo ? showcase : beasts
              const b = v.beast.tokenId ? pool?.find((x) => x.tokenId === v.beast.tokenId) : demoBeast
              leaveRun(); if (b) setSelected(b)
            }}
            say={say}
          />
        ) : selected ? (
          <Gate beast={selected} onBack={() => setSelected(null)} onEnter={startRun}
            live={stakesLive && (!selected.demo || Boolean(wallet))} balance={wholeGem(gem)}
            minStake={config?.minStake ?? 1} maxStake={config?.maxStake ?? 1000} />
        ) : (
          <Camp
            address={address}
            beasts={beasts}
            loading={loadingBeasts}
            demoBeast={config?.demo ? demoBeast : null}
            showcase={config?.demo ? showcase : []}
            onConnect={connect}
            onPick={(b) => { sfx.click(); setSelected(b) }}
            scores={scores}
          />
        )}
      </main>

      {toast && <div className={`toast toast-${toast.kind}`} onClick={() => setToast(null)}>{toast.text}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- camp (beast select)

function Camp({ address, beasts, loading, demoBeast, showcase, onConnect, onPick, scores }: {
  address: string | null; beasts: Beast[] | null; loading: boolean; demoBeast: Beast | null; showcase: Beast[] | null
  onConnect: () => void; onPick: (b: Beast) => void; scores: Score[]
}) {
  return (
    <div className="camp">
      <section className="hero">
        <h1 className="title">
          <span className="title-top">Choose your</span>
          <span className="title-big">CHAMPION</span>
        </h1>
        <p className="lore">Every Beast fights differently. <b>Health</b> forges shields, <b>Level</b> grants sight,
          <b> Tier</b> multiplies loot, and <b>Type</b> decides which traps it shrugs off.</p>
      </section>

      <div className="camp-grid">
        <div>
          {!address && (
            <div className="scroll-card">
              <div className="scroll-icon">🗝️</div>
              <div>
                <h3>Summon your Beasts</h3>
                <p>Connect a Starknet wallet on Sepolia to raid with Beasts you own and earn GEM.</p>
              </div>
              <button className="btn btn-gold" onClick={onConnect}>Connect</button>
            </div>
          )}
          <div className="roster">
            {loading && [0, 1, 2].map((i) => <div key={i} className="card card-skeleton"><div className="shimmer" /></div>)}
            {beasts?.map((b) => <BeastCard key={b.tokenId} beast={b} onPick={() => onPick(b)} />)}
          </div>
          {address && beasts && beasts.length === 0 && !loading && (
            <p className="hint">No Beasts in this wallet yet. Raid with a real Beast from the Practice Arena below and stake GEM for real.</p>
          )}
          <PracticeArena showcase={showcase} fallback={demoBeast} onPick={onPick} />
        </div>
        <HallOfLegends scores={scores} />
      </div>
    </div>
  )
}

const TYPE_FILTERS = [{ k: -1, label: 'ALL', icon: '⚔' }, { k: 0, label: 'MAGIC', icon: TYPE_ICON[0] }, { k: 1, label: 'HUNTER', icon: TYPE_ICON[1] }, { k: 2, label: 'BRUTE', icon: TYPE_ICON[2] }]

function PracticeArena({ showcase, fallback, onPick }: { showcase: Beast[] | null; fallback: Beast | null; onPick: (b: Beast) => void }) {
  const [type, setType] = useState(-1)
  const list = showcase?.length ? showcase : null
  const shown = list?.filter((b) => type < 0 || b.beastType === type) ?? []
  if (!list && !fallback && showcase !== null) return null
  return (
    <section className="arena-section">
      <div className="arena-head">
        <div>
          <h2 className="section-title">⚔ Practice Arena</h2>
          <p className="arena-sub">Real Beasts from the Sepolia collection with their true on-chain Level, Health, Tier and Type. No stamina limit. Connect a wallet to stake and win real GEM, or raid for free without one.</p>
        </div>
        {list && (
          <div className="chips">
            {TYPE_FILTERS.map((f) => (
              <button key={f.k} className={`chip ${type === f.k ? 'on' : ''}`} onClick={() => { sfx.click(); setType(f.k) }}>{f.icon} {f.label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="roster">
        {showcase === null && [0, 1, 2].map((i) => <div key={i} className="card card-skeleton"><div className="shimmer" /></div>)}
        {shown.map((b) => <BeastCard key={`demo-${b.tokenId}`} beast={b} onPick={() => onPick(b)} />)}
        {!list && fallback && showcase !== null && <BeastCard beast={fallback} onPick={() => onPick(fallback)} />}
      </div>
    </section>
  )
}

function Pips({ n, max, icon, emptyIcon, cls }: { n: number; max?: number; icon: string; emptyIcon?: string; cls?: string }) {
  const total = Math.max(max ?? n, n)
  return (
    <span className={`pips ${cls ?? ''}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < n ? 'pip on' : 'pip off'}>{i < n ? icon : (emptyIcon ?? icon)}</span>
      ))}
      {total === 0 && <span className="pip off">—</span>}
    </span>
  )
}

function BeastArt({ beast, size = 'md' }: { beast: Beast; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  if (!beast.tokenId || failed) {
    return <div className={`art art-${size} art-placeholder type-${beast.beastType}`}><span>{beast.demo && !beast.tokenId ? '🧙' : TYPE_ICON[beast.beastType]}</span></div>
  }
  return <div className={`art art-${size}`}><img src={beastImage(beast.tokenId)} alt={beast.fullName} loading="lazy" onError={() => setFailed(true)} /></div>
}

function BeastCard({ beast, onPick }: { beast: Beast; onPick: () => void }) {
  const out = !beast.demo && beast.staminaLeft <= 0
  const k = beast.kit
  return (
    <button className={`card tier-${beast.tier} ${beast.shiny ? 'shiny' : ''} ${out ? 'exhausted' : ''}`} onClick={onPick} disabled={out}>
      <div className="card-inner">
        <div className="card-top">
          <span className={`tier-badge tier-bg-${beast.tier}`}>T{beast.tier} {TIER_NAME[beast.tier]}</span>
          <span className={`type-badge type-${beast.beastType}`}>{TYPE_ICON[beast.beastType]} {beast.typeName}</span>
        </div>
        <BeastArt beast={beast} />
        <div className="card-name">{beast.fullName}</div>
        <div className="card-stats">
          <Stat label="LVL" value={beast.level} max={200} cls="bar-lvl" />
          <Stat label="HP" value={beast.health} max={800} cls="bar-hp" />
        </div>
        <div className="kit">
          <div className="kit-row" title="Shields: trap hits survived (from Health)"><span className="kit-label">SHIELD</span><Pips n={k.shields} icon="🛡️" /></div>
          <div className="kit-row" title="Peeks: check a tile without stepping on it (from Level, +1 Shiny)"><span className="kit-label">SIGHT</span><Pips n={k.peeks} icon="👁️" /></div>
          <div className="kit-row" title={SPECIAL[k.special].desc}><span className="kit-label">SKILL</span><span className="kit-val">{SPECIAL[k.special].icon} {SPECIAL[k.special].name}</span></div>
          <div className="kit-row" title="Loot multiplier bonus (from Tier)"><span className="kit-label">LOOT</span><span className="kit-val gold">×{k.tierBonus.toFixed(2)}</span></div>
        </div>
        <div className="card-foot">
          {beast.demo ? <span className="demo-tag">PRACTICE · ∞ raids</span> : (
            <span className="stamina" title="Raids left today">
              <Pips n={beast.staminaLeft} max={3} icon="⚡" cls="stam" />
            </span>
          )}
          <span className="power">PWR {beast.power}</span>
        </div>
        {beast.shiny ? <div className="shiny-tag">✦ SHINY</div> : null}
        {out && <div className="exhausted-tag">RESTING · back tomorrow</div>}
      </div>
    </button>
  )
}

function Stat({ label, value, max, cls }: { label: string; value: number; max: number; cls: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <div className="bar"><div className={`bar-fill ${cls}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>
      <span className="stat-val">{value}</span>
    </div>
  )
}

function HallOfLegends({ scores }: { scores: Score[] }) {
  return (
    <aside className="legends">
      <h3>🏆 Hall of Legends</h3>
      <div className="legends-sub">Today's richest hauls</div>
      {scores.length === 0 && <p className="legends-empty">No raids yet today. Be the first legend.</p>}
      <ol>
        {scores.map((s, i) => (
          <li key={(s.tokenId ?? 'demo') + i} className={`rank-${i + 1}`}>
            <span className="rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
            <span className="lname">{s.name}{s.demo && <em> demo</em>}</span>
            <span className="lscore">💎{s.reward} <small>×{s.multiplier.toFixed(2)}</small></span>
          </li>
        ))}
      </ol>
    </aside>
  )
}

// ---------------------------------------------------------------- gate (difficulty)

const STAKE_CHIPS = [10, 25, 50, 100, 250]

function Gate({ beast, onBack, onEnter, live, balance, minStake, maxStake }: {
  beast: Beast; onBack: () => void; onEnter: (b: Beast, d: DungeonKey, seed: string, stake: number) => Promise<void>
  live: boolean; balance: number; minStake: number; maxStake: number
}) {
  const [seed, setSeed] = useState(randomClientSeed)
  const [busy, setBusy] = useState<DungeonKey | null>(null)
  const cap = live ? Math.min(maxStake, balance) : maxStake
  const [stake, setStake] = useState(() => Math.max(minStake, Math.min(BASE_REWARD, cap || BASE_REWARD)))
  const stakeOk = Number.isInteger(stake) && stake >= minStake && stake <= maxStake && (!live || stake <= balance)
  const enter = async (d: DungeonKey) => {
    if (!stakeOk) return
    setBusy(d); await onEnter(beast, d, seed.trim() || randomClientSeed(), stake); setBusy(null)
  }
  return (
    <div className="gate">
      <button className="back" onClick={onBack}>◂ Back to camp</button>
      <div className="gate-head">
        <BeastArt beast={beast} />
        <div>
          <div className="gate-label">Raiding with</div>
          <h2 className="gate-name">{beast.fullName}</h2>
          <div className="gate-kit">
            <Pips n={beast.kit.shields} icon="🛡️" /> <Pips n={beast.kit.peeks} icon="👁️" />
            <span>{SPECIAL[beast.kit.special].icon} {SPECIAL[beast.kit.special].name}</span>
            <span className="gold">×{beast.kit.tierBonus.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className="stake">
        <div className="stake-head">
          <span className="stake-title">💎 Your stake</span>
          <span className="stake-note">{live ? `Balance ${balance.toLocaleString()} GEM · lose it if your beast falls` : 'Practice: no real GEM at risk'}</span>
        </div>
        <div className="stake-row">
          <input className="stake-input" type="number" min={minStake} max={live ? cap : maxStake} step={1} value={Number.isNaN(stake) ? '' : stake}
            onChange={(e) => setStake(Math.floor(Number(e.target.value)))} />
          {STAKE_CHIPS.filter((c) => c <= maxStake).map((c) => (
            <button key={c} className={`btn-mini ${stake === c ? 'on' : ''}`} disabled={live && c > balance} onClick={() => setStake(c)}>{c}</button>
          ))}
          {live && <button className="btn-mini" disabled={cap < minStake} onClick={() => setStake(cap)}>MAX</button>}
        </div>
        {!stakeOk && <div className="stake-err">{live && stake > balance ? 'Not enough GEM: use the +100 faucet.' : `Stake ${minStake}-${maxStake} whole GEM.`}</div>}
      </div>
      <h2 className="section-title">Choose a dungeon</h2>
      <div className="doors">
        {DUNGEONS.map((d) => {
          const best = calcMultiplier(25 - d.traps, d.traps, beast.kit.tierBonus)
          return (
            <button key={d.key} className={`door door-${d.key}`} onClick={() => enter(d.key)} disabled={busy !== null || !stakeOk}>
              <div className="door-arch"><span className="door-icon">{d.icon}</span></div>
              <div className="door-name">{d.name}</div>
              <div className="door-traps">{Array.from({ length: d.traps }, (_, i) => <span key={i}>☠</span>)}</div>
              <div className="door-flavour">{d.flavour}</div>
              <div className="door-stats">
                <span>1st tile ×{calcMultiplier(1, d.traps, beast.kit.tierBonus).toFixed(2)}</span>
                <span>clear ×{best >= 1000 ? Math.round(best).toLocaleString() : best.toFixed(2)}</span>
              </div>
              <div className="door-stats"><span>1st tile 💎{Math.floor(stake * calcMultiplier(1, d.traps, beast.kit.tierBonus)) || 0}</span></div>
              <div className="door-cta">{busy === d.key ? (live ? 'Confirm in wallet…' : 'Opening…') : `${live ? `STAKE 💎${stakeOk ? stake : '?'}` : 'ENTER'}${beast.demo ? '' : ' · ⚡1'}`}</div>
            </button>
          )
        })}
      </div>
      <details className="fair">
        <summary>⚖ Provably fair: your seed</summary>
        <p>The server commits to a hidden seed before you move. Your seed mixes in, so neither side can rig the board. After the raid you can verify every tile.</p>
        <label>Client seed <input value={seed} maxLength={64} onChange={(e) => setSeed(e.target.value)} /></label>
        <button className="btn-mini" onClick={() => setSeed(randomClientSeed())}>🎲 Reroll</button>
      </details>
    </div>
  )
}

// ---------------------------------------------------------------- dungeon (board)

type Floater = { id: number; tile: number; text: string; kind: 'gain' | 'hit' | 'counter' | 'info' }
type Mode = 'reveal' | 'peek' | 'scry' | 'track'

function Dungeon({ initial, address, canClaim, onClaim, onLeave, onAgain, say }: {
  initial: View; address: string | null; canClaim: boolean
  onClaim: (v: View) => Promise<void>; onLeave: () => void; onAgain: (v: View) => void
  say: (t: string, k?: 'info' | 'err') => void
}) {
  const [view, setView] = useState(initial)
  const [mode, setMode] = useState<Mode>('reveal')
  const [busy, setBusy] = useState(false)
  const [peeked, setPeeked] = useState<Record<number, boolean>>({})
  const [scry, setScry] = useState<Record<number, number>>({})
  const [smashArmed, setSmashArmed] = useState(false)
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [shake, setShake] = useState(false)
  const [flash, setFlash] = useState<'hit' | 'gold' | null>(null)
  const [banner, setBanner] = useState<{ text: string; kind: string } | null>(null)
  const [justRevealed, setJustRevealed] = useState<number | null>(null)
  const [showEnd, setShowEnd] = useState(initial.status !== 'active')
  const fid = useRef(0)

  const beast = { ...view.beast, demo: view.demo }
  const active = view.status === 'active'
  const stake = view.stake ?? BASE_REWARD
  const reward = Math.floor(stake * view.multiplier)

  const float = (tile: number, text: string, kind: Floater['kind']) => {
    const id = ++fid.current
    setFloaters((f) => [...f, { id, tile, text, kind }])
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1300)
  }
  const shout = (text: string, kind: string) => {
    setBanner({ text, kind })
    window.setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), 1500)
  }
  const doShake = () => { setShake(true); window.setTimeout(() => setShake(false), 450) }
  const doFlash = (k: 'hit' | 'gold') => { setFlash(k); window.setTimeout(() => setFlash(null), 350) }

  const finish = (v: View, delay = 900) => { if (v.status !== 'active') window.setTimeout(() => setShowEnd(true), delay) }

  type ActRes = { result: any; view: View }
  const post = async (path: string, body: object) => {
    setBusy(true)
    try { return await api<ActRes>(`/api/runs/${view.runId}/${path}`, body) } catch (e) {
      const msg = (e as Error).message
      // Runs live in server memory: a server restart (or the 30-min expiry) drops them.
      if (msg === 'no run') { say('This raid expired (the server restarted). Back to camp.', 'err'); onLeave() } else say(msg, 'err')
      return null
    } finally { setBusy(false) }
  }

  const onTile = async (i: number) => {
    if (!active || busy || view.revealed[i]) return
    if (mode === 'scry') return
    if (mode === 'peek') {
      const r = await post('peek', { tile: i }); if (!r) return
      sfx.peek()
      setPeeked((p) => ({ ...p, [i]: r.result.safe }))
      float(i, r.result.safe ? 'SAFE' : 'DANGER', r.result.safe ? 'info' : 'hit')
      setView(r.view); setMode('reveal'); return
    }
    if (mode === 'track') {
      const r = await post('special', { arg: i }); if (!r) return
      sfx.special(); setMode('reveal'); setView(r.view); setJustRevealed(i)
      if (r.result.safe) { float(i, `×${r.view.multiplier.toFixed(2)}`, 'gain') } else { float(i, 'DISARMED', 'counter'); shout('TRAP DISARMED!', 'counter') }
      finish(r.view); return
    }
    const r = await post('reveal', { tile: i }); if (!r) return
    setView(r.view); setJustRevealed(i)
    const res = r.result
    if (res.safe) {
      sfx.gem(r.view.safeCount)
      float(i, `×${r.view.multiplier.toFixed(2)}`, 'gain')
      if (r.view.status === 'cashed') { sfx.cash(); doFlash('gold'); shout('DUNGEON CLEARED!', 'gold') }
    } else if (res.damage === 0) {
      sfx.counter(); doFlash('gold')
      if (smashArmed && !beats(beast.beastType, res.trapType)) { setSmashArmed(false); shout('SMASHED THROUGH!', 'counter'); float(i, 'SMASH!', 'counter') }
      else { shout(`${beast.typeName} counters ${TRAP_NAME[res.trapType]}!`, 'counter'); float(i, 'COUNTERED!', 'counter') }
    } else if (res.survived) {
      sfx.hit(); doShake(); doFlash('hit')
      if (smashArmed) setSmashArmed(false)
      float(i, `-${res.damage} 🛡️`, 'hit')
      shout(res.damage === 2 ? `${TRAP_NAME[res.trapType]} is super effective!` : `${TRAP_NAME[res.trapType]}! Shield cracked`, 'hit')
    } else {
      sfx.hit(); window.setTimeout(sfx.lose, 250); doShake(); doFlash('hit')
      float(i, 'SLAIN', 'hit')
      shout('YOUR BEAST HAS FALLEN', 'hit')
    }
    finish(r.view, res.safe ? 600 : 1100)
  }

  const onRow = async (row: number) => {
    if (mode !== 'scry') return
    const r = await post('special', { arg: row }); if (!r) return
    sfx.special(); setScry((s) => ({ ...s, [row]: r.result.traps })); setView(r.view); setMode('reveal')
    shout(`The runes whisper: ${r.result.traps} trap${r.result.traps === 1 ? '' : 's'} in row ${row + 1}`, 'info')
  }

  const useSkill = async () => {
    if (!active || view.specialUsed || busy) return
    sfx.click()
    const s = view.kit.special
    if (s === 'smash') {
      const r = await post('special', {}); if (!r) return
      sfx.special(); setSmashArmed(true); setView(r.view); shout('SMASH READY: next trap is harmless', 'counter')
      return
    }
    setMode((m) => (m === s ? 'reveal' : s))
  }

  const cashOut = async () => {
    if (!active || busy || view.safeCount === 0) return
    const r = await post('cashout', {}); if (!r) return
    sfx.cash(); doFlash('gold')
    setView(r.view); finish(r.view, 300)
  }

  const flee = async () => {
    if (!active || busy) return
    const msg = view.safeCount > 0
      ? `Flee without cashing out? You'll lose your 💎${view.stake} stake. (Cash out instead to keep 💎${reward}.)`
      : `Flee the dungeon? Your 💎${view.stake} stake ${view.staked ? 'is lost' : 'is forfeited (practice)'}.`
    if (!window.confirm(msg)) return
    const r = await post('flee', {}); if (!r) return
    sfx.lose(); setView(r.view); finish(r.view, 100)
  }

  const ladder = useMemo(() => {
    const out: { k: number; m: number }[] = []
    for (let k = view.safeCount + 1; k <= Math.min(25 - view.trapCount, view.safeCount + 5); k++) out.push({ k, m: calcMultiplier(k, view.trapCount, view.kit.tierBonus) })
    return out
  }, [view.safeCount, view.trapCount, view.kit.tierBonus])

  const tiles = Array.from({ length: 25 }, (_, i) => i)
  const traps = view.traps ?? {}

  return (
    <div className={`dungeon ${shake ? 'shake' : ''}`}>
      {flash && <div className={`flash flash-${flash}`} />}

      <aside className="side side-left">
        <div className={`mini-card tier-${beast.tier} ${beast.shiny ? 'shiny' : ''}`}>
          <BeastArt beast={beast} />
          <div className="mini-name">{beast.fullName}</div>
          <div className={`type-badge type-${beast.beastType}`}>{TYPE_ICON[beast.beastType]} {beast.typeName}</div>
        </div>
        <div className="vitals">
          <div className="vital">
            <span className="vital-label">SHIELDS</span>
            <Pips n={view.shields} max={view.kit.shields} icon="🛡️" emptyIcon="▫️" cls="big" />
          </div>
          <div className="vital">
            <span className="vital-label">PEEKS</span>
            <Pips n={view.peeks} max={view.kit.peeks} icon="👁️" emptyIcon="▫️" cls="big" />
          </div>
        </div>
        <div className="actions">
          <button className={`btn-skill ${mode === 'peek' ? 'armed' : ''}`} disabled={!active || view.peeks <= 0 || busy}
            onClick={() => { sfx.click(); setMode((m) => (m === 'peek' ? 'reveal' : 'peek')) }}>
            <span className="skill-icon">👁️</span>
            <span><b>PEEK</b><small>{mode === 'peek' ? 'Pick a tile…' : 'Check a tile safely'}</small></span>
          </button>
          <button className={`btn-skill skill-${view.kit.special} ${mode === view.kit.special || smashArmed ? 'armed' : ''}`}
            disabled={!active || view.specialUsed && !smashArmed || busy} onClick={useSkill}>
            <span className="skill-icon">{SPECIAL[view.kit.special].icon}</span>
            <span><b>{SPECIAL[view.kit.special].name}</b><small>{
              smashArmed ? 'Armed!' : view.specialUsed ? 'Used' : mode === 'scry' ? 'Pick a row ▸' : mode === 'track' ? 'Pick a tile…' : SPECIAL[view.kit.special].desc
            }</small></span>
          </button>
        </div>
        <TypeChart beastType={beast.beastType} />
      </aside>

      <section className="arena">
        <div className="arena-top">
          <div className="dungeon-name">{DUNGEONS.find((d) => d.key === view.difficulty)?.name} · {view.trapCount} traps</div>
          <div className="mult-wrap">
            <div className="mult" key={view.multiplier}>×{view.multiplier.toFixed(2)}</div>
            <div className="mult-reward">💎 {reward} GEM{view.staked ? '' : ' (practice)'} <small>· stake {stake}</small></div>
          </div>
        </div>

        <div className={`board-wrap mode-${mode}`}>
          <div className="board">
            {tiles.map((i) => {
              const r: Revealed | undefined = view.revealed[i]
              const isTrap = traps[i] !== undefined
              const ghost = !active && !r && isTrap
              const ghostSafe = !active && !r && !isTrap
              const pk = peeked[i]
              let cls = 'tile'
              let face: string = ''
              if (r?.safe) { cls += ' safe'; face = '💎' }
              else if (r && r.disarmed) { cls += ' disarmed'; face = TRAP_ICON[r.trapType ?? 0] }
              else if (r && r.damage === 0) { cls += ' countered'; face = TRAP_ICON[r.trapType ?? 0] }
              else if (r) { cls += ' hit'; face = TRAP_ICON[r.trapType ?? 0] }
              else if (ghost) { cls += ' ghost-trap'; face = TRAP_ICON[traps[i]] }
              else if (ghostSafe) { cls += ' ghost-safe' }
              else if (pk !== undefined) { cls += pk ? ' peek-safe' : ' peek-trap'; face = pk ? '' : '⚠' }
              if (justRevealed === i) cls += ' pop'
              const clickable = active && !r && mode !== 'scry'
              return (
                <button key={i} className={cls} onClick={() => onTile(i)} disabled={!clickable || busy}
                  style={{ ['--d' as string]: `${(i % 5 + Math.floor(i / 5)) * 30}ms` }} aria-label={`tile ${i + 1}`}>
                  <span className="tile-face">{face}</span>
                  {floaters.filter((f) => f.tile === i).map((f) => <span key={f.id} className={`floater fl-${f.kind}`}>{f.text}</span>)}
                </button>
              )
            })}
          </div>
          <div className="rows">
            {[0, 1, 2, 3, 4].map((row) => (
              <button key={row} className={`row-btn ${mode === 'scry' ? 'live' : ''} ${scry[row] !== undefined ? 'known' : ''}`}
                onClick={() => onRow(row)} disabled={mode !== 'scry' || busy}>
                {scry[row] !== undefined ? <>☠{scry[row]}</> : mode === 'scry' ? '◂' : ''}
              </button>
            ))}
          </div>
          {banner && <div className={`banner banner-${banner.kind}`}>{banner.text}</div>}
        </div>

        <div className="arena-bottom">
          {active ? (
            <button className="btn-cash" onClick={cashOut} disabled={view.safeCount === 0 || busy}>
              <span className="cash-label">{view.safeCount === 0 ? 'FIND A GEM FIRST' : 'CASH OUT'}</span>
              <span className="cash-amt">💎 {reward}</span>
            </button>
          ) : (
            <button className="btn-cash" onClick={() => setShowEnd(true)}>
              <span className="cash-label">SHOW RESULTS</span>
            </button>
          )}
          <div className="bottom-row">
            {active
              ? <button className="btn btn-stone btn-sm" onClick={flee} disabled={busy}>🏃 Flee dungeon</button>
              : <button className="btn btn-stone btn-sm" onClick={onLeave}>⛺ Back to camp</button>}
          </div>
          <div className="commit" title={`sha256(serverSeed) = ${view.commit}`}>🔒 commit {short(view.commit, 8)}</div>
        </div>
      </section>

      <aside className="side side-right">
        <h4>Next steps</h4>
        <ol className="ladder">
          {ladder.map(({ k, m }, idx) => (
            <li key={k} className={idx === 0 ? 'next' : ''}><span>Tile {k}</span><b>×{m.toFixed(2)}</b></li>
          ))}
          {ladder.length === 0 && <li className="next"><span>Board cleared</span></li>}
        </ol>
        <div className="odds">
          {(() => {
            const left = 25 - Object.keys(view.revealed).length
            const trapsLeft = view.trapCount - Object.values(view.revealed).filter((r) => !r.safe).length
            return <>Trap chance next tile: <b>{left > 0 ? Math.round((trapsLeft / left) * 100) : 0}%</b></>
          })()}
        </div>
      </aside>

      {showEnd && <EndScreen view={view} address={address} canClaim={canClaim} onClaim={onClaim} onLeave={onLeave} onAgain={onAgain} onHide={() => setShowEnd(false)} />}
    </div>
  )
}

function TypeChart({ beastType }: { beastType: number }) {
  // trap type -> damage for this beast
  return (
    <div className="typechart">
      <div className="tc-title">TRAPS vs YOU</div>
      {[0, 1, 2].map((t) => {
        const dmg = beats(beastType, t) ? 0 : beats(t, beastType) ? 2 : 1
        return (
          <div key={t} className={`tc-row dmg-${dmg}`}>
            <span>{TRAP_ICON[t]} {TRAP_NAME[t]}</span>
            <b>{dmg === 0 ? 'IMMUNE' : `-${dmg} 🛡️`}</b>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- end screen

function EndScreen({ view, address, canClaim, onClaim, onLeave, onAgain, onHide }: {
  view: View; address: string | null; canClaim: boolean
  onClaim: (v: View) => Promise<void>; onLeave: () => void; onAgain: (v: View) => void; onHide: () => void
}) {
  const won = view.status === 'cashed'
  const [verify, setVerify] = useState<{ ok: boolean; reason?: string } | null>(null)
  const [claimState, setClaimState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')
  const [claimErr, setClaimErr] = useState('')
  const reward = view.reward ?? 0
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!won) return
    let n = 0
    const step = Math.max(1, Math.ceil(reward / 30))
    const t = window.setInterval(() => { n = Math.min(reward, n + step); setShown(n); if (n >= reward) window.clearInterval(t) }, 30)
    return () => window.clearInterval(t)
  }, [won, reward])

  const doVerify = async () => { sfx.click(); setVerify(await verifyRun(view)) }
  const doClaim = async () => {
    setClaimState('busy')
    try { await onClaim(view); setClaimState('done') } catch (e) { setClaimState('err'); setClaimErr((e as Error).message) }
  }

  const isOwner = Boolean(address) // server signed the claim for the wallet that staked (or the beast's owner)
  return (
    <div className="end-overlay">
      <div className={`end-panel ${won ? 'end-win' : 'end-lose'}`}>
        <div className="end-icon">{won ? '👑' : '💀'}</div>
        <h2 className="end-title">{won ? 'LOOT SECURED' : view.fled ? 'FLED' : 'DEFEATED'}</h2>
        <p className="end-sub">{won
          ? `${view.beast.fullName} escaped with ${view.safeCount} gems at ×${view.multiplier.toFixed(2)}`
          : view.fled ? `${view.beast.fullName} ran for the exit and left the treasure behind.` : `${view.beast.fullName} fell after ${view.safeCount} safe step${view.safeCount === 1 ? '' : 's'}. The treasure stays buried.`}</p>
        {won && <div className="end-reward">💎 {shown} <span>GEM</span></div>}
        {won && <p className="end-note">Staked 💎{view.stake} → won 💎{reward} ({reward >= view.stake ? '+' : ''}{reward - view.stake})</p>}
        {!won && <div className="end-reward end-lost">−💎 {view.stake} <span>GEM{view.staked ? ' lost' : ' (practice)'}</span></div>}

        {won && (
          !view.staked ? <p className="end-note">This was a free raid. Connect a wallet and stake GEM to win for real.</p>
            : view.claim && canClaim && isOwner ? (
              <button className="btn btn-gold btn-lg" onClick={doClaim} disabled={claimState === 'busy' || claimState === 'done'}>
                {claimState === 'busy' ? 'Signing & minting…' : claimState === 'done' ? '✔ GEM claimed!' : `Claim ${reward} GEM on Starknet`}
              </button>
            ) : <p className="end-note">{view.claim ? 'Connect the owner wallet to claim.' : 'GEM rewards are not enabled on this server yet.'}</p>
        )}
        {won && view.staked && view.claim && claimState !== 'done' && (
          <p className="end-note">Your winnings reach your wallet once you claim. Missed it? Use 🎁 Claim at the top right.</p>
        )}
        {claimState === 'err' && <p className="end-err">{claimErr}</p>}

        <div className="end-fair">
          <button className="btn btn-ghost" onClick={doVerify}>⚖ Verify fairness</button>
          {verify && <span className={verify.ok ? 'ok' : 'bad'}>{verify.ok ? '✅ Board matches the commit' : `❌ ${verify.reason}`}</span>}
          <div className="seed">seed {short(view.serverSeed ?? '', 10)} · client "{view.clientSeed}"</div>
        </div>

        <div className="end-actions">
          <button className="btn btn-stone" onClick={onLeave}>⛺ Camp</button>
          <button className="btn btn-stone" onClick={onHide}>🗺 See board</button>
          <button className="btn btn-gold" onClick={() => onAgain(view)}>⚔ Raid again</button>
        </div>
      </div>
    </div>
  )
}
