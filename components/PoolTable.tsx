'use client'

import { useState, Fragment, useRef, useEffect } from 'react'
import type { Pool, LPPool, LendingPool, BorrowingPool, StakingPool, LiquidStakingPool } from '@/types'
import { ILWarning } from './ILWarning'
import { DepositModal } from './DepositModal'
import { CURVANCE_MARKETS } from '@/lib/contracts'

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
  XAUt0:    '/logos/tokens/XAUT0.png',
  DUST:     '/logos/tokens/DUST.jpg',
  ALLOCA:   '/logos/tokens/ALLOCA.jpg',
  shMON:    '/logos/tokens/shMON.png',
  gMON:     '/logos/tokens/gMON.png',
  sMON:     '/logos/tokens/sMON.webp',
  aprMON:   '/logos/tokens/aprMON.png',
  APR:      '/logos/tokens/APR.png',
  weETH:    '/logos/tokens/weETH.png',
  wstETH:   '/logos/tokens/wsETH.jpg',
  earnAUSD: '/logos/tokens/earnAUSD.png',
  loAZND:   '/logos/tokens/loAZND.webp',
  CAKE:     '/logos/tokens/CAKE.jpg',
  Cake:     '/logos/tokens/CAKE.jpg',
  LV:       '/logos/tokens/LV.png',
  LVMON:    '/logos/tokens/LVMON.png',
  USD1:     '/logos/tokens/USD1.png',
}

// Receipt token for each LST protocol (shown instead of deposited MON)
const LST_RECEIPT: Record<string, string> = {
  Magma: 'gMON', Fastlane: 'shMON', Kintsu: 'sMON', Apriori: 'aprMON',
}

function TokenLogo({ symbol, className }: { symbol: string; className?: string }) {
  const [err, setErr] = useState(false)
  const src = TOKEN_LOGOS[symbol]
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
        {/* Explicit w-8 h-8 wrapper + overflow-hidden prevents inline-img gap distortion */}
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

// ─── Type badge ─────────────────────────────────────────────────────────────
const TYPE_STYLES: Record<string, string> = {
  lending:       'bg-[#CC3BFF]/10   text-[#CC3BFF]   border-[#CC3BFF]/20',
  borrowing:     'bg-rose-500/10    text-rose-400    border-rose-500/20',
  lp:            'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
  staking:       'bg-amber-500/10   text-amber-400   border-amber-500/20',
  liquid_staking:'bg-blue-500/10    text-blue-400    border-blue-500/20',
}
const TYPE_LABELS: Record<string, string> = {
  lending: 'LEND', borrowing: 'BORROW', lp: 'LP', staking: 'STAKE', liquid_staking: 'LST',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 border rounded ${TYPE_STYLES[type] ?? TYPE_STYLES.lending}`}>
      {TYPE_LABELS[type] ?? type.toUpperCase()}
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
  'morpho-c402b0ca': 'Hyperithm · Apex',
  'morpho-ba8424eb': 'Steakhouse · Prime',
  'morpho-a8665084': 'Hyperithm · Apex',
  'morpho-961a59fe': 'Steakhouse · High Yield',
  'morpho-8699bfe5': 'Steakhouse · High Yield',
  'morpho-802c91d8': 'Steakhouse · High Yield',
  'morpho-32841a85': 'Grove · High Yield',
  'morpho-21649703': 'August',
  'morpho-0f6f5a82': 'Steakhouse · High Yield',
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

// ─── Main ────────────────────────────────────────────────────────────────────
type SortKey = 'apr' | 'tvl' | 'risk_score'
type TypeFilter = 'all' | 'lp' | 'lending' | 'borrowing' | 'staking' | 'liquid_staking'

interface Props { pools: Pool[] }

export function PoolTable({ pools }: Props) {
  const [sortKey, setSortKey]           = useState<SortKey>('apr')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>('all')
  const [protocolFilter, setProtocol]   = useState('all')
  const [search, setSearch]             = useState('')
  const [showBytes, setShowBytes]       = useState(true)
  const [expandedIL, setExpandedIL]     = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)

  const protocols = ['all', ...Array.from(new Set(pools.map(p => p.protocol))).sort()]

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const filtered = pools.filter(p => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false
    if (protocolFilter !== 'all' && p.protocol !== protocolFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const name = p.type === 'lp'
        ? `${(p as LPPool).token0}/${(p as LPPool).token1}`.toLowerCase()
        : (p as LendingPool).asset.toLowerCase()
      if (!name.includes(q) && !p.protocol.toLowerCase().includes(q)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = 0, bv = 0
    if (sortKey === 'apr')        { av = getApr(a);      bv = getApr(b) }
    else if (sortKey === 'tvl')   { av = a.tvl;          bv = b.tvl }
    else if (sortKey === 'risk_score') { av = a.risk_score; bv = b.risk_score }
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500 hover:text-slate-300 select-none transition-colors group"
    >
      {label}
      <span className="text-slate-600 group-hover:text-slate-400">
        {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </button>
  )

  return (
    <div>
      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <DropdownFilter
          value={typeFilter}
          label="Category"
          options={[
            { value: 'all',           label: 'All Pools' },
            { value: 'lp',            label: 'LP' },
            { value: 'lending',       label: 'Lending' },
            { value: 'borrowing',     label: 'Borrowing' },
            { value: 'staking',       label: 'Staking' },
            { value: 'liquid_staking',label: 'LST' },
          ]}
          onChange={setTypeFilter}
          accentClass="bg-[#CC3BFF]/10 border-[#CC3BFF]/30 text-[#BFA2FF]"
        />

        <DropdownFilter
          value={protocolFilter}
          label="Protocol"
          options={protocols.map(p => ({
            value: p,
            label: p === 'all' ? 'All Protocols' : p,
            icon: PROTOCOL_LOGOS[p],
          }))}
          onChange={setProtocol}
          accentClass="bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
        />

        {/* Search — pushed right */}
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
          Showing <span className="text-slate-300 font-medium">{sorted.length}</span> of{' '}
          <span className="text-slate-300 font-medium">{pools.length}</span> pools
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

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--card)] border-b border-[var(--border)]">
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Pool</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortBtn k="apr" label="APY" />
              </th>
              <th className="px-4 py-3 text-left">
                <SortBtn k="tvl" label="Deposits" />
              </th>
              <th className="px-4 py-3 text-left hidden md:table-cell">
                <SortBtn k="risk_score" label="Assessment" />
              </th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Protocol</span>
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
              const isLP   = pool.type === 'lp'
              const lpPool = pool as LPPool
              const other  = pool as LendingPool

              const name = isLP
                ? `${lpPool.token0}/${lpPool.token1}`
                : pool.protocol === 'Curvance' && pool.type === 'lending'
                  ? (CURVANCE_MARKETS[pool.id]?.colSym ?? other.asset.split('/')[0])
                  : other.asset

              // Token avatar: pair for LP, single receipt/asset for others
              const avatarProps: Parameters<typeof TokenPairAvatar>[0] = isLP
                ? { mode: 'pair', token0: lpPool.token0, token1: lpPool.token1 }
                : { mode: 'single', token:
                    pool.type === 'liquid_staking' ? (LST_RECEIPT[pool.protocol] ?? other.asset)
                    : pool.protocol === 'Curvance' && pool.type === 'lending'
                      ? (CURVANCE_MARKETS[pool.id]?.colSym ?? other.asset)
                      : other.asset
                  }

              const subtitle = MORPHO_LABELS[pool.id]
                ?? (pool.protocol === 'Uniswap'
                  ? pool.id.startsWith('uniswap-v4') ? 'V4'
                  : pool.id.startsWith('uniswap-v3') ? 'V3'
                  : 'V2'
                  : null)

              const apr = getApr(pool)
              const isFull = pool.status === 'full'

              return (
                <Fragment key={pool.id}>
                  <tr
                    className={`transition-colors cursor-pointer group ${isFull ? 'opacity-50' : 'hover:bg-[var(--card-hover)]'}`}
                    onClick={() => isLP && setExpandedIL(expandedIL === pool.id ? null : pool.id)}
                  >
                    {/* Pool name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <TokenPairAvatar {...avatarProps} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white truncate">{name}</p>
                            <TypeBadge type={pool.type} />
                            {isFull && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 border rounded bg-slate-500/10 text-slate-400 border-slate-500/20">
                                FULL
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* APY */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-semibold ${apr > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {fmtApr(apr)}
                        </span>
                        {showBytes && pool.protocol === 'Curvance' && pool.type !== 'borrowing' && (
                          <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
                            + Bytes
                          </span>
                        )}
                        {showBytes && pool.protocol === 'Magma' && (
                          <span className="text-[10px] font-semibold text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded px-1.5 py-0.5">
                            + Points
                          </span>
                        )}
                      </div>
                    </td>

                    {/* TVL */}
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-medium text-white">{fmtTvl(pool.tvl)}</span>
                    </td>

                    {/* Risk profile */}
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <RiskProfile score={pool.risk_score} />
                    </td>

                    {/* Protocol */}
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {PROTOCOL_LOGOS[pool.protocol] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={PROTOCOL_LOGOS[pool.protocol]}
                          alt={pool.protocol}
                          title={pool.protocol}
                          className="w-7 h-7 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-sm text-slate-400">{pool.protocol}</span>
                      )}
                    </td>

                    {/* Action button */}
                    <td className="px-4 py-3.5 text-right">
                      {isFull ? (
                        <span className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 opacity-0 group-hover:opacity-100">
                          At capacity
                        </span>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedPool(pool) }}
                          className="px-3.5 py-1.5 text-xs font-semibold border border-[var(--border-hover)] text-slate-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[var(--border)] hover:border-slate-500 transition-all"
                        >
                          {pool.type === 'borrowing' ? 'Borrow' : 'Deposit'}
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Expanded IL warning for LP pools */}
                  {isLP && expandedIL === pool.id && (
                    <tr key={`${pool.id}-il`} className="bg-[var(--card)]">
                      <td colSpan={6} className="px-4 py-3 space-y-2">
                        {pool.protocol === 'PancakeSwap' && (
                          <div className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                            ⚡ <strong>Full-range APR (estimated):</strong> Calculated using total pool TVL and 24h volume.
                            Concentrated positions near the current price may earn significantly more, but earn $0 if price moves out of range.
                          </div>
                        )}
                        {lpPool.il_risk !== 'low' && <ILWarning ilRisk={lpPool.il_risk} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedPool && (
        <DepositModal pool={selectedPool} onClose={() => setSelectedPool(null)} />
      )}
    </div>
  )
}
