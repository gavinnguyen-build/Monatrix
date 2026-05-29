'use client'

import { useState, Fragment, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Pool, LPPool, LendingPool, BorrowingPool, StakingPool, LiquidStakingPool } from '@/types'
import { ILWarning } from './ILWarning'
import { CURVANCE_MARKETS, CURVANCE_BORROW_MARKETS } from '@/lib/contracts'

// ─── Protocol colours ───────────────────────────────────────────────────────
const PROTOCOL_COLORS: Record<string, string> = {
  Curvance:    'bg-purple-600',
  Morpho:      'bg-emerald-600',
  Neverland:   'bg-blue-600',
  Kuru:        'bg-amber-500',
  PancakeSwap: 'bg-pink-500',
  Clober:      'bg-red-500',
  Uniswap:     'bg-fuchsia-500',
  Fastlane:    'bg-violet-600',
  Kintsu:      'bg-teal-500',
  Magma:       'bg-orange-500',
}
void PROTOCOL_COLORS // used elsewhere

const PROTOCOL_LOGOS: Record<string, string> = {
  Apriori:     '/logos/protocols/apriori.jpg',
  Clober:      '/logos/protocols/clober.jpg',
  Curvance:    '/logos/protocols/curvance.jpg',
  Fastlane:    '/logos/protocols/fastlane.jpg',
  Kintsu:      '/logos/protocols/kintsu.jpg',
  Kuru:        '/logos/protocols/kuru.jpg',
  Magma:       '/logos/protocols/magma.jpg',
  Morpho:      '/logos/protocols/morpho.jpg',
  Neverland:   '/logos/protocols/neverland.jpg',
  PancakeSwap: '/logos/protocols/pancakeswap.jpg',
  Uniswap:     '/logos/protocols/uniswap.jpg',
}

// ─── Token logos ────────────────────────────────────────────────────────────
const TOKEN_LOGOS: Record<string, string> = {
  MON:      '/logos/tokens/MON.jpg',
  WMON:     '/logos/tokens/wmon.png',
  USDC:     '/logos/tokens/USDC.png',
  USDT0:    '/logos/tokens/USDT0.jpg',
  AUSD:     '/logos/tokens/AUSD.jpg',
  WETH:     '/logos/tokens/WETH.png',
  WBTC:     '/logos/tokens/WBTC.png',
  cbBTC:    '/logos/tokens/cbBTC.png',
  CBBTC:    '/logos/tokens/cbBTC.png',
  XAUt0:    '/logos/tokens/XAUT0.png',
  DUST:     '/logos/tokens/DUST.jpg',
  ALLOCA:   '/logos/tokens/ALLOCA.jpg',
  shMON:    '/logos/tokens/shMON.png',
  SHMON:    '/logos/tokens/shMON.png',
  gMON:     '/logos/tokens/gMON.png',
  GMON:     '/logos/tokens/gMON.png',
  sMON:     '/logos/tokens/sMON.webp',
  aprMON:   '/logos/tokens/aprMON.png',
  APR:      '/logos/tokens/APR.png',
  weETH:    '/logos/tokens/weETH.png',
  WEETH:    '/logos/tokens/weETH.png',
  wstETH:   '/logos/tokens/wsETH.jpg',
  WSTETH:   '/logos/tokens/wsETH.jpg',
  earnAUSD: '/logos/tokens/earnAUSD.png',
  EARNAUSD: '/logos/tokens/earnAUSD.png',
  loAZND:   '/logos/tokens/loAZND.webp',
  CAKE:     '/logos/tokens/CAKE.jpg',
  Cake:     '/logos/tokens/CAKE.jpg',
  LV:       '/logos/tokens/LV.png',
  LVMON:    '/logos/tokens/LVMON.png',
  USD1:     '/logos/tokens/USD1.png',
  ezETH:    '/logos/tokens/ezeth.svg',
  muBOND:   '/logos/tokens/mubond.svg',
  sAUSD:    '/logos/tokens/sausd.svg',
  syzUSD:   '/logos/tokens/syzusd.svg',
  vUSD:     '/logos/tokens/vusd.svg',
  wsrUSD:   '/logos/tokens/wsrusd.svg',
  YZM:      '/logos/tokens/yzm.svg',
  eBTC:     '/logos/tokens/ebtc.svg',
  EBTC:     '/logos/tokens/ebtc.svg',
  savUSD:   '/logos/tokens/savusd.svg',
  ANAGO:    '/logos/tokens/Anago.png',
  Anago:    '/logos/tokens/Anago.png',
  APE:      '/logos/tokens/APE.png',
  BOB:      '/logos/tokens/BOB.jpg',
  CHOG:     '/logos/tokens/CHOG.png',
  DAK:      '/logos/tokens/DAK.png',
  EARN:     '/logos/tokens/EARN.png',
  EURW:     '/logos/tokens/EURW.png',
  GMONAD:   '/logos/tokens/GMONAD.avif',
  gMONAD:   '/logos/tokens/GMONAD.avif',
  IGN:      '/logos/tokens/IGN.jpg',
  MONIKA:   '/logos/tokens/MONIKA.png',
  NAD:      '/logos/tokens/NAD.jpg',
  NADS:     '/logos/tokens/NAD.jpg',
  wnSHMON:  '/logos/tokens/wnSHMON.png',
  wnUSDC:   '/logos/tokens/wnUSDC.png',
  wnWMON:   '/logos/tokens/wnWMON.png',
}

// Receipt token for each LST protocol (shown instead of deposited MON)
const LST_RECEIPT: Record<string, string> = {
  Magma: 'gMON', Fastlane: 'shMON', Kintsu: 'sMON', Apriori: 'aprMON',
}

function TokenLogo({ symbol, className }: { symbol: string; className?: string }) {
  const [err, setErr] = useState(false)
  const src = TOKEN_LOGOS[symbol] ?? TOKEN_LOGOS[symbol.toUpperCase()] ?? TOKEN_LOGOS[symbol.toLowerCase()]
  const cls = className ?? 'w-8 h-8'
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={symbol} className={`${cls} rounded-full object-cover shrink-0`} onError={() => setErr(true)} />
    )
  }
  return (
    <span className={`inline-flex items-center justify-center ${cls} rounded-full bg-slate-700 text-[10px] font-bold text-slate-300 shrink-0`}>
      {symbol.slice(0, 3).toUpperCase()}
    </span>
  )
}

// Overlapping dual-logo for LP pools; single logo for everything else
function TokenPairAvatar(props:
  | { mode: 'pair'; token0: string; token1: string }
  | { mode: 'single'; token: string }
) {
  if (props.mode === 'pair') {
    return (
      <div className="relative shrink-0" style={{ width: 44, height: 32 }}>
        <div className="absolute left-0 top-0 w-8 h-8 rounded-full overflow-hidden">
          <TokenLogo symbol={props.token0} className="w-full h-full" />
        </div>
        <div className="absolute left-5 top-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-[#0a0914]">
          <TokenLogo symbol={props.token1} className="w-full h-full" />
        </div>
      </div>
    )
  }
  return <TokenLogo symbol={props.token} className="w-8 h-8 shrink-0" />
}

// ─── Risk profile ───────────────────────────────────────────────────────────
const RISK_PROFILE: Record<number, { label: string; dot: string; text: string }> = {
  1: { label: 'Low',       dot: 'bg-emerald-400', text: 'text-emerald-400' },
  2: { label: 'Medium',    dot: 'bg-yellow-400',  text: 'text-yellow-400'  },
  3: { label: 'High',      dot: 'bg-orange-400',  text: 'text-orange-400'  },
  4: { label: 'Very High', dot: 'bg-red-500',     text: 'text-red-400'     },
}

function RiskProfile({ score }: { score: number }) {
  const p = RISK_PROFILE[score] ?? RISK_PROFILE[3]
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${p.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
      {p.label}
    </span>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getApr(pool: Pool): number {
  if (pool.type === 'lp') return (pool as LPPool).total_apr
  return (pool as LendingPool | BorrowingPool | StakingPool | LiquidStakingPool).apy
}

function fmtApr(v: number): string {
  return v > 0 ? `${v.toFixed(2)}%` : '—'
}

function fmtTvl(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`
  if (v > 0)          return `$${v.toFixed(0)}`
  return '—'
}

const MORPHO_LABELS: Record<string, string> = {
  'morpho-beef04b0': 'Steakhouse',
  'morpho-78999cc9': 'Hyperithm',
  'morpho-32841a85': 'Grove × Steakhouse',
  'morpho-e09a9378': 'Hyperithm',
  'morpho-80017bf0': 'August',
  'morpho-beeff300': 'Steakhouse',
  'morpho-beeff421': 'Steakhouse',
  'morpho-beeffb65': 'Steakhouse',
  'morpho-beeff443': 'Steakhouse',
  'morpho-beeffea7': 'Steakhouse',
  'morpho-0ed3615f': 'Unified Labs',
  'morpho-ecef08a3': 'UltraYield',
  'morpho-beeff96d': 'Steakhouse',
}

// ─── Dropdown filter ────────────────────────────────────────────────────────
function DropdownFilter<T extends string>({
  value,
  options,
  label,
  onChange,
  accentClass = 'bg-[#CC3BFF]/10 border-[#CC3BFF]/30 text-[#BFA2FF]',
}: {
  value: T
  options: { value: T; label: string; icon?: string }[]
  label: string
  onChange: (v: T) => void
  accentClass?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find(o => o.value === value)
  const isFiltered = value !== options[0].value

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all ${
          isFiltered
            ? accentClass
            : 'bg-transparent border-[var(--border)] text-slate-400 hover:border-[var(--border-hover)] hover:text-slate-300'
        }`}
      >
        {selected?.icon && isFiltered && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selected.icon} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
        )}
        <span>{label}: {selected?.label ?? value}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[180px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors ${
                  value === o.value
                    ? 'text-[#CC3BFF] bg-[#CC3BFF]/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[var(--border)]'
                }`}
              >
                {o.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.icon} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-5 h-5 shrink-0" />
                )}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Protocol logo cell ─────────────────────────────────────────────────────
function ProtocolLogo({ protocol }: { protocol: string }) {
  return PROTOCOL_LOGOS[protocol] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={PROTOCOL_LOGOS[protocol]} alt={protocol} title={protocol} className="w-7 h-7 rounded-full object-cover" />
  ) : (
    <span className="text-sm text-slate-400">{protocol}</span>
  )
}

// ─── Sort button ─────────────────────────────────────────────────────────────
type SortKey = 'apr' | 'tvl' | 'risk_score' | 'borrow_apy' | 'protocol'

function SortBtn({ k, label, sortKey, sortDir, onToggle }: {
  k: SortKey; label: string; sortKey: SortKey; sortDir: 'asc' | 'desc'
  onToggle: (k: SortKey) => void
}) {
  return (
    <button
      onClick={() => onToggle(k)}
      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-300 select-none transition-colors group"
    >
      {label}
      <span className="text-slate-600 group-hover:text-slate-400">
        {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </button>
  )
}

// ─── LP Table ────────────────────────────────────────────────────────────────
function LPTable({ pools, showBytes, sortKey, sortDir, onToggleSort }: {
  pools: Pool[]; showBytes: boolean
  sortKey: SortKey; sortDir: 'asc' | 'desc'
  onToggleSort: (k: SortKey) => void
}) {
  const router = useRouter()
  const [expandedIL, setExpandedIL] = useState<string | null>(null)

  const sorted = [...pools].sort((a, b) => {
    if (sortKey === 'protocol') {
      const cmp = a.protocol.localeCompare(b.protocol)
      return sortDir === 'desc' ? -cmp : cmp
    }
    let av = 0, bv = 0
    if (sortKey === 'apr')        { av = getApr(a); bv = getApr(b) }
    else if (sortKey === 'tvl')   { av = a.tvl;     bv = b.tvl     }
    else                          { av = a.risk_score; bv = b.risk_score }
    return sortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--card)] border-b border-[var(--border)]">
            <th className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Pool</span>
            </th>
            <th className="px-4 py-3 text-left">
              <SortBtn k="apr" label="APY/APR" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left">
              <SortBtn k="tvl" label="Deposits" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden md:table-cell">
              <SortBtn k="risk_score" label="Assessment" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden lg:table-cell">
              <SortBtn k="protocol" label="Protocol" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 w-[88px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-slate-600 text-sm">
                No pools match your filters.
              </td>
            </tr>
          )}
          {sorted.map(pool => {
            const lp = pool as LPPool
            const apr = getApr(pool)
            const isFull = pool.status === 'full'
            const subtitle = pool.protocol === 'Uniswap'
              ? pool.id.startsWith('uniswap-v4') ? 'V4' : pool.id.startsWith('uniswap-v3') ? 'V3' : 'V2'
              : null

            return (
              <Fragment key={pool.id}>
                <tr
                  className={`transition-colors cursor-pointer group ${isFull ? 'opacity-50' : 'hover:bg-[var(--card-hover)]'}`}
                  onClick={() => setExpandedIL(expandedIL === pool.id ? null : pool.id)}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <TokenPairAvatar mode="pair" token0={lp.token0} token1={lp.token1} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white truncate">{lp.token0}/{lp.token1}</p>
                          {isFull && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 border rounded bg-slate-500/10 text-slate-400 border-slate-500/20">FULL</span>
                          )}
                        </div>
                        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-sm font-semibold ${apr > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {fmtApr(apr)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-medium text-white">{fmtTvl(pool.tvl)}</span>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <RiskProfile score={pool.risk_score} />
                  </td>
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    <ProtocolLogo protocol={pool.protocol} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); router.push('/pools/' + pool.id) }}
                      className="px-3.5 py-1.5 text-xs font-semibold border border-[var(--border-hover)] text-slate-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[var(--border)] hover:border-slate-500 transition-all"
                    >
                      Deposit
                    </button>
                  </td>
                </tr>
                {expandedIL === pool.id && (
                  <tr key={`${pool.id}-il`} className="bg-[var(--card)]">
                    <td colSpan={6} className="px-4 py-3 space-y-2">
                      {pool.protocol === 'PancakeSwap' && (
                        <div className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          ⚡ <strong>Full-range APR (estimated):</strong> Calculated using total pool TVL and 24h volume.
                          Concentrated positions near the current price may earn significantly more, but earn $0 if price moves out of range.
                        </div>
                      )}
                      {lp.il_risk !== 'low' && <ILWarning ilRisk={lp.il_risk} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── LST Table ───────────────────────────────────────────────────────────────
function LSTTable({ pools, showBytes, sortKey, sortDir, onToggleSort }: {
  pools: Pool[]; showBytes: boolean
  sortKey: SortKey; sortDir: 'asc' | 'desc'
  onToggleSort: (k: SortKey) => void
}) {
  const router = useRouter()

  const sorted = [...pools].sort((a, b) => {
    if (sortKey === 'protocol') {
      const cmp = a.protocol.localeCompare(b.protocol)
      return sortDir === 'desc' ? -cmp : cmp
    }
    let av = 0, bv = 0
    if (sortKey === 'apr')        { av = getApr(a); bv = getApr(b) }
    else if (sortKey === 'tvl')   { av = a.tvl;     bv = b.tvl     }
    else                          { av = a.risk_score; bv = b.risk_score }
    return sortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--card)] border-b border-[var(--border)]">
            <th className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Asset</span>
            </th>
            <th className="px-4 py-3 text-left">
              <SortBtn k="apr" label="APY" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left">
              <SortBtn k="tvl" label="TVL" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden md:table-cell">
              <SortBtn k="risk_score" label="Assessment" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden lg:table-cell">
              <SortBtn k="protocol" label="Protocol" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 w-[88px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-slate-600 text-sm">No pools match your filters.</td>
            </tr>
          )}
          {sorted.map(pool => {
            const other = pool as LiquidStakingPool
            const receipt = LST_RECEIPT[pool.protocol] ?? other.asset
            const apr = getApr(pool)

            return (
              <tr
                key={pool.id}
                className="transition-colors cursor-pointer group hover:bg-[var(--card-hover)]"
                onClick={() => router.push('/pools/' + pool.id)}
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <TokenPairAvatar mode="single" token={receipt} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">MON → {receipt}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{pool.protocol}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-semibold ${apr > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {fmtApr(apr)}
                    </span>
                    {showBytes && pool.protocol === 'Magma' && (
                      <span className="text-[10px] font-semibold text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded px-1.5 py-0.5">
                        + Points
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-sm font-medium text-white">{fmtTvl(pool.tvl)}</span>
                </td>
                <td className="px-4 py-3.5 hidden md:table-cell">
                  <RiskProfile score={pool.risk_score} />
                </td>
                <td className="px-4 py-3.5 hidden lg:table-cell">
                  <ProtocolLogo protocol={pool.protocol} />
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={e => { e.stopPropagation(); router.push('/pools/' + pool.id) }}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-[var(--border-hover)] text-slate-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[var(--border)] hover:border-slate-500 transition-all"
                  >
                    Stake
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Lending & Borrowing Table ───────────────────────────────────────────────
type LBRow = {
  lendPool: Pool
  borrowPool?: Pool
  lendSym: string
  borrowSym?: string
  lendLabel?: string   // vault curator for Morpho
}

function LendingTable({ pools, showBytes, sortKey, sortDir, onToggleSort }: {
  pools: Pool[]; showBytes: boolean
  sortKey: SortKey; sortDir: 'asc' | 'desc'
  onToggleSort: (k: SortKey) => void
}) {
  const router = useRouter()

  // Build combined rows: lending + optional matching borrow for Curvance
  const lendingPools = pools.filter(p => p.type === 'lending')
  const borrowingPools = pools.filter(p => p.type === 'borrowing')

  const rows: LBRow[] = lendingPools.map(lend => {
    if (lend.protocol === 'Curvance') {
      const curvMarket = CURVANCE_MARKETS[lend.id]
      // Match borrow pool by colCToken (unique per deposit direction)
      const borrowEntry = Object.entries(CURVANCE_BORROW_MARKETS)
        .find(([_, b]) => b.colCToken.toLowerCase() === curvMarket?.colCToken.toLowerCase())
      const borrowPool = borrowEntry
        ? borrowingPools.find(p => p.id === borrowEntry[0])
        : undefined
      return {
        lendPool: lend,
        borrowPool,
        lendSym: curvMarket?.colSym ?? (lend as LendingPool).asset,
        borrowSym: borrowEntry?.[1].loanSym,
      }
    }
    // Neverland: match borrow pool by ID convention neverland-lending-{sym} → neverland-borrowing-{sym}
    if (lend.protocol === 'Neverland') {
      const sym = lend.id.replace('neverland-lending-', '')
      const borrowPool = borrowingPools.find(p => p.id === `neverland-borrowing-${sym}`)
      return {
        lendPool: lend,
        borrowPool,
        lendSym: (lend as LendingPool).asset,
        borrowSym: borrowPool ? (borrowPool as BorrowingPool).asset : undefined,
      }
    }
    // Morpho: lending only
    return {
      lendPool: lend,
      lendSym: (lend as LendingPool).asset,
      lendLabel: MORPHO_LABELS[lend.id],
    }
  })

  // Sort rows
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'protocol') {
      const cmp = a.lendPool.protocol.localeCompare(b.lendPool.protocol)
      return sortDir === 'desc' ? -cmp : cmp
    }
    if (sortKey === 'borrow_apy') {
      const av = a.borrowPool ? (a.borrowPool as BorrowingPool).apy ?? 0 : -1
      const bv = b.borrowPool ? (b.borrowPool as BorrowingPool).apy ?? 0 : -1
      return sortDir === 'desc' ? bv - av : av - bv
    }
    let av = 0, bv = 0
    if (sortKey === 'apr') {
      av = (a.lendPool as LendingPool).apy ?? 0
      bv = (b.lendPool as LendingPool).apy ?? 0
    } else if (sortKey === 'tvl') {
      av = a.lendPool.tvl; bv = b.lendPool.tvl
    } else {
      av = a.lendPool.risk_score; bv = b.lendPool.risk_score
    }
    return sortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--card)] border-b border-[var(--border)]">
            <th className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Lend</span>
            </th>
            <th className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Borrow</span>
            </th>
            <th className="px-4 py-3 text-left">
              <SortBtn k="apr" label="APY Lend" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden sm:table-cell">
              <SortBtn k="borrow_apy" label="APY Borrow" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left">
              <SortBtn k="tvl" label="Deposit" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden md:table-cell">
              <SortBtn k="risk_score" label="Assessment" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 text-left hidden lg:table-cell">
              <SortBtn k="protocol" label="Protocol" sortKey={sortKey} sortDir={sortDir} onToggle={onToggleSort} />
            </th>
            <th className="px-4 py-3 w-[120px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-slate-600 text-sm">
                No pools match your filters.
              </td>
            </tr>
          )}
          {sorted.map(({ lendPool, borrowPool, lendSym, borrowSym, lendLabel }) => {
            const lendApy  = (lendPool as LendingPool).apy ?? 0
            const borrowApy = borrowPool ? (borrowPool as BorrowingPool).apy ?? 0 : null
            const isFull = lendPool.status === 'full' && lendPool.protocol !== 'Curvance'

            return (
              <tr
                key={lendPool.id}
                className={`group transition-colors ${isFull ? 'opacity-50' : 'hover:bg-[var(--card-hover)]'}`}
              >
                {/* Lend column */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <TokenLogo symbol={lendSym} className="w-8 h-8" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{lendSym}</p>
                      {lendLabel && <p className="text-xs text-slate-500 mt-0.5 truncate">{lendLabel}</p>}
                    </div>
                  </div>
                </td>

                {/* Borrow column */}
                <td className="px-4 py-3.5">
                  {borrowSym ? (
                    <div className="flex items-center gap-2.5">
                      <TokenLogo symbol={borrowSym} className="w-8 h-8" />
                      <p className="text-sm font-semibold text-white">{borrowSym}</p>
                    </div>
                  ) : (
                    <span className="text-slate-600 text-sm">—</span>
                  )}
                </td>

                {/* APY Lend */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-semibold ${lendApy > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {fmtApr(lendApy)}
                    </span>
                    {showBytes && lendPool.protocol === 'Curvance' && (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
                        + Bytes
                      </span>
                    )}
                  </div>
                </td>

                {/* APY Borrow */}
                <td className="px-4 py-3.5 hidden sm:table-cell">
                  {borrowApy !== null ? (
                    <span className={`text-sm font-semibold ${borrowApy > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                      {fmtApr(borrowApy)}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm">—</span>
                  )}
                </td>

                {/* Deposit TVL */}
                <td className="px-4 py-3.5">
                  <span className="text-sm font-medium text-white">{fmtTvl(lendPool.tvl)}</span>
                </td>

                {/* Assessment */}
                <td className="px-4 py-3.5 hidden md:table-cell">
                  <RiskProfile score={lendPool.risk_score} />
                </td>

                {/* Protocol */}
                <td className="px-4 py-3.5 hidden lg:table-cell">
                  <ProtocolLogo protocol={lendPool.protocol} />
                </td>

                {/* Action buttons */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => router.push('/pools/' + lendPool.id)}
                      className="px-3 py-1.5 text-xs font-semibold border border-[var(--border-hover)] text-[#BFA2FF] rounded-lg hover:bg-[#CC3BFF]/10 hover:border-[#CC3BFF]/40 transition-all"
                    >
                      Lend
                    </button>
                    {borrowPool && (
                      <button
                        onClick={() => router.push('/pools/' + borrowPool.id)}
                        className="px-3 py-1.5 text-xs font-semibold border border-[var(--border-hover)] text-rose-400 rounded-lg hover:bg-rose-500/10 hover:border-rose-500/30 transition-all"
                      >
                        Borrow
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
type TabType = 'lp' | 'lst' | 'lending'

interface Props { pools: Pool[] }

export function PoolTable({ pools }: Props) {
  const sp = useSearchParams()
  const router = useRouter()
  const initTab = sp.get('tab')
  const [tab, setTab]                 = useState<TabType>(
    initTab === 'lending' || initTab === 'lst' ? initTab : 'lp'
  )
  const [sortKey, setSortKey]         = useState<SortKey>('apr')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [protocolFilter, setProtocol] = useState(sp.get('protocol') ?? 'all')
  const [search, setSearch]           = useState('')
  const [showBytes, setShowBytes]     = useState(true)

  // Sync tab + protocol to URL so back navigation restores state
  useEffect(() => {
    const params = new URLSearchParams()
    if (tab !== 'lp') params.set('tab', tab)
    if (protocolFilter !== 'all') params.set('protocol', protocolFilter)
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : '/', { scroll: false })
  }, [tab, protocolFilter])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  // Reset protocol filter when switching tabs
  function switchTab(t: TabType) {
    setTab(t)
    setProtocol('all')
    setSearch('')
  }

  // Filter pools by tab category
  const tabPools = pools.filter(p => {
    if (tab === 'lp')      return p.type === 'lp'
    if (tab === 'lst')     return p.type === 'liquid_staking'
    if (tab === 'lending') return p.type === 'lending' || p.type === 'borrowing'
    return false
  })

  // Protocol options relevant to current tab (lending tab: only show lending protocols, not borrow-only)
  const tabProtocols = ['all', ...Array.from(new Set(
    tabPools
      .filter(p => tab !== 'lending' || p.type === 'lending')
      .map(p => p.protocol)
  )).sort()]

  // Apply protocol + search filters
  const filtered = tabPools.filter(p => {
    if (protocolFilter !== 'all' && p.protocol !== protocolFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const asset = p.type === 'lp'
        ? `${(p as LPPool).token0}/${(p as LPPool).token1}`.toLowerCase()
        : (p as LendingPool).asset?.toLowerCase() ?? ''
      if (!asset.includes(q) && !p.protocol.toLowerCase().includes(q)) return false
    }
    return true
  })

  const visibleCount = tab === 'lending'
    ? filtered.filter(p => p.type === 'lending').length
    : filtered.length

  const totalCount = tab === 'lending'
    ? pools.filter(p => p.type === 'lending').length
    : pools.filter(p =>
        (tab === 'lp' && p.type === 'lp') ||
        (tab === 'lst' && p.type === 'liquid_staking')
      ).length

  return (
    <div>
      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <DropdownFilter
          value={tab}
          label="Category"
          options={[
            { value: 'lp'      as TabType, label: 'LP' },
            { value: 'lst'     as TabType, label: 'LST' },
            { value: 'lending' as TabType, label: 'Lending & Borrowing' },
          ]}
          onChange={switchTab}
        />
        <DropdownFilter
          value={protocolFilter}
          label="Protocol"
          options={tabProtocols.map(p => ({
            value: p,
            label: p === 'all' ? 'All Protocols' : p,
            icon: PROTOCOL_LOGOS[p],
          }))}
          onChange={setProtocol}
          accentClass="bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
        />

        {/* Search */}
        <div className="ml-auto relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assets or protocols…"
            className="pl-8 pr-3 py-1.5 text-xs bg-[var(--card)] border border-[var(--border)] rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[var(--border-hover)] w-52 transition-colors"
          />
        </div>
      </div>

      {/* ── Count + Bytes toggle ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs text-slate-500">
          Showing <span className="text-slate-300 font-medium">{visibleCount}</span> of{' '}
          <span className="text-slate-300 font-medium">{totalCount}</span> pools
        </p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-slate-500">Show incentive badges</span>
          <button
            onClick={() => setShowBytes(v => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors ${showBytes ? 'bg-[#CC3BFF]' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showBytes ? 'left-4' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      {/* ── Table (tab-specific) ───────────────────────────────────────── */}
      {tab === 'lp' && (
        <LPTable
          pools={filtered}
          showBytes={showBytes}
          sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort}
        />
      )}
      {tab === 'lst' && (
        <LSTTable
          pools={filtered}
          showBytes={showBytes}
          sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort}
        />
      )}
      {tab === 'lending' && (
        <LendingTable
          pools={filtered}
          showBytes={showBytes}
          sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort}
        />
      )}
    </div>
  )
}
