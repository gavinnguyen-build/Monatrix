'use client'

import { useState, useEffect } from 'react'
import { saveV4TokenId } from '@/lib/v4positions'
import {
  useAccount, useConnect, useDisconnect, useBalance,
  useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient,
} from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseUnits, formatUnits, encodeFunctionData } from 'viem'
import type { Pool, LendingPool, BorrowingPool, LiquidStakingPool, LPPool } from '@/types'
import {
  ERC20_ABI,
  UNISWAP_V3_NPM, UNISWAP_V3_POOL_ABI, UNISWAP_V3_POOLS,
  UNISWAP_V4_POSITION_MANAGER, UNISWAP_V4_STATE_VIEW, UNISWAP_V4_POOLS, PERMIT2,
  PANCAKESWAP_V3_NPM, PANCAKESWAP_V3_POOL_ABI, PANCAKESWAP_V3_POOLS,
  CURVANCE_MARKETS, CURVANCE_BORROW_MARKETS,
} from '@/lib/contracts'
import {
  AmountInput, Steps, Btn,
  LSTFlow, LendingFlow, BorrowFlow, KuruVaultFlow, CloberFlow, UniswapV2Flow,
  priceToTick, snapTick, v3Amount1FromAmount0, v3Amount0FromAmount1, capitalMultiplier,
  V3_RANGE_PRESETS, computeV4Liquidity, encodeV4UnlockData, PROTOCOL_BG, LST_RECEIPT,
} from '@/components/DepositModal'
import type { V3Preset } from '@/components/DepositModal'

const NEXT_ID_ABI = [{ name: 'nextTokenId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTvl(n: number): string {
  if (!n || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtApr(n: number): string {
  if (!n || n === 0) return '—'
  return `${n.toFixed(2)}%`
}

function fmtPrice(p: number): string {
  if (!p || !isFinite(p) || p <= 0) return '—'
  if (p < 0.0001)  return p.toExponential(4)
  if (p < 1)       return p.toFixed(6)
  if (p < 1000)    return p.toFixed(4)
  return p.toFixed(2)
}

function tickToHumanPrice(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1)
}

function getRiskLabel(score: number): { label: string; color: string } {
  if (score <= 1) return { label: 'Very Low', color: 'text-emerald-400' }
  if (score <= 2) return { label: 'Low', color: 'text-green-400' }
  if (score <= 3) return { label: 'Medium', color: 'text-amber-400' }
  return { label: 'High', color: 'text-rose-400' }
}

// ── Protocol logos ────────────────────────────────────────────────────────────
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

const TOKEN_LOGOS: Record<string, string> = {
  MON:    '/logos/tokens/MON.jpg',
  WMON:   '/logos/tokens/wmon.png',
  USDC:   '/logos/tokens/USDC.png',
  USDT0:  '/logos/tokens/USDT0.jpg',
  AUSD:   '/logos/tokens/AUSD.jpg',
  WETH:   '/logos/tokens/WETH.png',
  WBTC:   '/logos/tokens/WBTC.png',
  shMON:  '/logos/tokens/shMON.png',
  gMON:   '/logos/tokens/gMON.png',
  sMON:   '/logos/tokens/sMON.webp',
  aprMON: '/logos/tokens/aprMON.png',
}

const TYPE_LABELS: Record<string, string> = {
  lending: 'Lending', borrowing: 'Borrowing',
  liquid_staking: 'Liquid Staking', staking: 'Staking', lp: 'LP',
}

const TYPE_COLORS: Record<string, string> = {
  lending: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  borrowing: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  liquid_staking: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  staking: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  lp: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20',
}

// ── WalletSection ─────────────────────────────────────────────────────────────
function WalletSection({ action = 'deposit' }: { action?: string }) {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-slate-400 font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>
        </div>
        <button
          type="button"
          onClick={() => disconnect()}
          className="text-slate-600 hover:text-slate-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 gap-3">
      <div>
        <p className="text-sm font-medium text-white">Connect wallet</p>
        <p className="text-xs text-slate-500 mt-0.5">Required to {action}</p>
      </div>
      <button
        type="button"
        onClick={() => connect({ connector: injected() })}
        className="shrink-0 px-4 py-1.5 text-xs font-semibold bg-[#CC3BFF] hover:opacity-90 text-white rounded-lg transition-colors"
      >
        Connect
      </button>
    </div>
  )
}

// ── PoolHeader ────────────────────────────────────────────────────────────────
function PoolHeader({ pool }: { pool: Pool }) {
  const isLP = pool.type === 'lp'
  const lp = pool as LPPool
  const lending = pool as LendingPool
  const curvBorrow = pool.protocol === 'Curvance' && pool.type === 'borrowing'
    ? CURVANCE_BORROW_MARKETS[pool.id] : null

  const name = isLP
    ? `${lp.token0}/${lp.token1}`
    : pool.protocol === 'Curvance' && pool.type === 'lending'
      ? (CURVANCE_MARKETS[pool.id]?.colSym ?? lending.asset)
      : curvBorrow
        ? `${curvBorrow.colSym}/${curvBorrow.loanSym}`
        : lending.asset ?? pool.id

  const bg = PROTOCOL_BG[pool.protocol] ?? 'bg-slate-600'
  const logo = PROTOCOL_LOGOS[pool.protocol]

  const feeTierLabel = isLP
    ? (pool.id.startsWith('uniswap-v3-') || pool.id.startsWith('uniswap-v4-') || pool.protocol === 'PancakeSwap')
      ? (lp.fee_tier > 0 ? `${(lp.fee_tier / 100).toFixed(lp.fee_tier < 100 ? 4 : lp.fee_tier < 1000 ? 3 : 2)}%` : null)
      : null
    : null

  return (
    <div className="flex items-center gap-4">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={pool.protocol} className="w-12 h-12 rounded-full object-cover shrink-0" />
      ) : (
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${bg}`}>
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-white">{name}</h1>
          {feeTierLabel && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1a2535] text-slate-300">
              {feeTierLabel}
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[pool.type] ?? 'bg-slate-500/10 text-slate-300 border-slate-500/20'}`}>
            {TYPE_LABELS[pool.type] ?? pool.type}
          </span>
          {pool.status === 'full' && pool.protocol !== 'Curvance' && (
            <span className="text-xs font-bold px-2 py-0.5 border rounded-full bg-slate-500/10 text-slate-400 border-slate-500/20">
              FULL
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-0.5">{pool.protocol}</p>
      </div>
    </div>
  )
}

// ── PoolStats ─────────────────────────────────────────────────────────────────
function PoolStats({ pool }: { pool: Pool }) {
  const lp = pool as LPPool
  const lending = pool as LendingPool

  type Stat = { label: string; value: string; color?: string }
  const stats: Stat[] = []

  stats.push({ label: 'TVL', value: fmtTvl(pool.tvl) })

  if (pool.volume_24h > 0) {
    stats.push({ label: 'Vol 24h', value: fmtTvl(pool.volume_24h) })
  }

  if (pool.type === 'lp') {
    stats.push({ label: 'Fee APR', value: fmtApr(lp.fee_apr), color: 'text-emerald-400' })
    if (lp.reward_apr > 0) {
      stats.push({ label: 'Reward APR', value: fmtApr(lp.reward_apr), color: 'text-amber-400' })
    }
    stats.push({ label: 'Total APR', value: fmtApr(lp.total_apr), color: 'text-emerald-400' })
  } else if (pool.type === 'lending' || pool.type === 'borrowing' || pool.type === 'liquid_staking' || pool.type === 'staking') {
    stats.push({
      label: pool.type === 'borrowing' ? 'Borrow APR' : 'APY/APR',
      value: fmtApr(lending.apy),
      color: 'text-emerald-400',
    })
    if ((pool.type === 'lending' || pool.type === 'borrowing') && lending.utilization > 0) {
      stats.push({ label: 'Utilization', value: `${lending.utilization.toFixed(1)}%` })
    }
  }

  const risk = getRiskLabel(pool.risk_score)
  stats.push({ label: 'Risk', value: risk.label, color: risk.color })

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.slice(0, 4).map(s => (
        <div key={s.label} className="bg-[#0d1520] border border-[#1a2535] rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">{s.label}</p>
          <p className={`text-base font-bold ${s.color ?? 'text-white'}`}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── PoolInfoPanel (left column for simple pools) ──────────────────────────────
function PoolInfoPanel({ pool }: { pool: Pool }) {
  const lp = pool as LPPool
  const lending = pool as LendingPool
  const risk = getRiskLabel(pool.risk_score)
  const curvBorrow = pool.protocol === 'Curvance' && pool.type === 'borrowing'
    ? CURVANCE_BORROW_MARKETS[pool.id] : null

  const updatedAgo = (() => {
    const d = Date.now() - new Date(pool.updated_at).getTime()
    const h = Math.floor(d / 3_600_000)
    if (h < 1) return 'Just updated'
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  })()

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-white">Pool Info</p>

      <div className="space-y-3">
        {/* Risk */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Risk assessment</span>
          <span className={`font-semibold ${risk.color}`}>{risk.label}</span>
        </div>

        {/* APY for lending/staking */}
        {(pool.type === 'lending' || pool.type === 'liquid_staking' || pool.type === 'staking') && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">APY/APR</span>
            <span className="text-emerald-400 font-semibold">{fmtApr(lending.apy)}</span>
          </div>
        )}
        {pool.type === 'borrowing' && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Borrow APR</span>
            <span className="text-rose-400 font-semibold">{fmtApr(lending.apy)}</span>
          </div>
        )}

        {/* LP stats */}
        {pool.type === 'lp' && (
          <>
            {lp.fee_apr > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Fee APR</span>
                <span className="text-emerald-400 font-semibold">{fmtApr(lp.fee_apr)}</span>
              </div>
            )}
            {lp.reward_apr > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Reward APR</span>
                <span className="text-amber-400 font-semibold">{fmtApr(lp.reward_apr)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">IL risk</span>
              <span className={`font-semibold ${lp.il_risk === 'low' ? 'text-emerald-400' : lp.il_risk === 'medium' ? 'text-amber-400' : 'text-rose-400'}`}>
                {lp.il_risk.charAt(0).toUpperCase() + lp.il_risk.slice(1)}
              </span>
            </div>
          </>
        )}

        {/* Curvance borrow collateral */}
        {curvBorrow && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Collateral</span>
            <span className="text-white font-semibold">{curvBorrow.colSym}</span>
          </div>
        )}

        {/* Utilization */}
        {(pool.type === 'lending' || pool.type === 'borrowing') && lending.utilization > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Utilization</span>
            <span className="text-white font-semibold">{lending.utilization.toFixed(1)}%</span>
          </div>
        )}

        {/* TVL */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Total deposits</span>
          <span className="text-white font-semibold">{fmtTvl(pool.tvl)}</span>
        </div>

        {/* Protocol */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Protocol</span>
          <span className="text-white font-semibold">{pool.protocol}</span>
        </div>

        {/* Updated */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Data updated</span>
          <span className="text-slate-400">{updatedAgo}</span>
        </div>
      </div>

      {/* LST receipt token info */}
      {pool.type === 'liquid_staking' && LST_RECEIPT[pool.protocol] && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-400/80 leading-relaxed">
            You receive <strong className="text-amber-300">{LST_RECEIPT[pool.protocol]}</strong> — a liquid receipt token
            redeemable 1:1 for MON plus accrued staking rewards. No lock period.
          </p>
        </div>
      )}

      {/* IL warning for LP */}
      {pool.type === 'lp' && (lp.il_risk === 'medium' || lp.il_risk === 'high') && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-400/80 leading-relaxed">
            <strong className="text-amber-300">Impermanent loss risk:</strong>{' '}
            {lp.il_risk === 'high'
              ? 'This pool has high IL risk due to volatile asset pairing. Your position value may decrease if prices diverge significantly.'
              : 'Medium IL risk — price divergence between assets can reduce position value compared to holding assets separately.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── RangeBoundBox (for V3/V4 expanded layouts) ────────────────────────────────
function RangeBoundBox({
  label, displayPrice, unit, onDec, onInc, isFullRange,
}: {
  label: string
  displayPrice: string
  unit: string
  onDec: () => void
  onInc: () => void
  isFullRange: boolean
}) {
  return (
    <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-2">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDec}
          disabled={isFullRange}
          className="w-8 h-8 rounded-lg border border-[#1a2535] bg-[#0d1520] text-slate-400 hover:text-white hover:border-[#2a3a52] transition-all flex items-center justify-center text-lg font-light disabled:opacity-30 disabled:cursor-not-allowed"
        >
          −
        </button>
        <span className={`text-sm font-semibold ${isFullRange ? 'text-slate-500' : 'text-white'}`}>
          {isFullRange ? (label === 'Min Price' ? '0' : '∞') : displayPrice}
        </span>
        <button
          type="button"
          onClick={onInc}
          disabled={isFullRange}
          className="w-8 h-8 rounded-lg border border-[#1a2535] bg-[#0d1520] text-slate-400 hover:text-white hover:border-[#2a3a52] transition-all flex items-center justify-center text-lg font-light disabled:opacity-30 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
      <p className="text-[10px] text-slate-600 mt-2">{unit}</p>
    </div>
  )
}

// ── Shared V3-style range controls component ──────────────────────────────────
function RangeControls({
  preset, onPresetClick,
  tickLower, tickUpper, tickSpacing, isFullRange,
  dec0, dec1, sym0, sym1,
  invertPrice, onToggleInvert,
  onAdjustLower, onAdjustUpper,
}: {
  preset: V3Preset | 'custom'
  onPresetClick: (p: V3Preset) => void
  tickLower: number
  tickUpper: number
  tickSpacing: number
  isFullRange: boolean
  dec0: number
  dec1: number
  sym0: string
  sym1: string
  invertPrice: boolean
  onToggleInvert: () => void
  onAdjustLower: (d: 1 | -1) => void
  onAdjustUpper: (d: 1 | -1) => void
}) {
  const lowerHuman = tickToHumanPrice(tickLower, dec0, dec1)
  const upperHuman = tickToHumanPrice(tickUpper, dec0, dec1)
  const minDisplay = invertPrice ? fmtPrice(1 / upperHuman) : fmtPrice(lowerHuman)
  const maxDisplay = invertPrice ? fmtPrice(1 / lowerHuman) : fmtPrice(upperHuman)
  const priceUnit = invertPrice ? `${sym0} per ${sym1}` : `${sym1} per ${sym0}`

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-white">Set Price Range</p>

      {/* Preset tabs */}
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(V3_RANGE_PRESETS) as V3Preset[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPresetClick(p)}
            className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${
              preset === p
                ? 'border-[#CC3BFF] bg-[#CC3BFF]/10 text-white'
                : 'border-[#1a2535] text-slate-500 hover:border-[#2a3a52] hover:text-slate-300'
            }`}
          >
            {V3_RANGE_PRESETS[p].label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="col-span-4 text-center text-[10px] text-[#CC3BFF]/70 mt-1">
            Custom range active — use +/− to adjust, or select a preset above
          </div>
        )}
      </div>

      {/* Min / Max side by side */}
      <div className="grid grid-cols-2 gap-3">
        <RangeBoundBox
          label="Min Price"
          displayPrice={minDisplay}
          unit={priceUnit}
          onDec={() => onAdjustLower(-1)}
          onInc={() => onAdjustLower(+1)}
          isFullRange={isFullRange}
        />
        <RangeBoundBox
          label="Max Price"
          displayPrice={maxDisplay}
          unit={priceUnit}
          onDec={() => onAdjustUpper(-1)}
          onInc={() => onAdjustUpper(+1)}
          isFullRange={isFullRange}
        />
      </div>

      {/* Price unit toggle */}
      <button
        type="button"
        onClick={onToggleInvert}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span>{priceUnit}</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </button>
    </div>
  )
}

// ── Uniswap V3 Page Flow ──────────────────────────────────────────────────────
function UniswapV3PageFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = UNISWAP_V3_POOLS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const { address: poolAddr, token0, token0Dec, token0Sym, token1, token1Dec, token1Sym, fee, tickSpacing, wmonSide } = info
  const hasNative = wmonSide !== 'none'
  const monIsT0   = wmonSide === 'token0'

  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')
  const [preset, setPreset] = useState<V3Preset | 'custom'>('wide')
  const [customTickLower, setCustomTickLower] = useState<number | null>(null)
  const [customTickUpper, setCustomTickUpper] = useState<number | null>(null)
  const [invertPrice, setInvertPrice] = useState(false)

  const { data: slot0 } = useReadContract({
    address: poolAddr, abi: UNISWAP_V3_POOL_ABI, functionName: 'slot0',
    query: { refetchInterval: 15_000 },
  })
  const sqrtPriceX96 = slot0?.[0] ?? 0n
  const currentTick  = slot0?.[1] ?? 0

  const humanPrice = sqrtPriceX96 > 0n
    ? Math.pow(Number(sqrtPriceX96) / 2 ** 96, 2) * Math.pow(10, token0Dec - token1Dec)
    : 0

  const minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  const isFullRange = preset === 'full'
  let tickLower: number
  let tickUpper: number

  if (preset === 'custom' && customTickLower !== null && customTickUpper !== null) {
    tickLower = customTickLower
    tickUpper = customTickUpper
  } else if (isFullRange) {
    tickLower = minTick; tickUpper = maxTick
  } else {
    const { lowerPct, upperPct } = V3_RANGE_PRESETS[preset as V3Preset]
    tickLower = humanPrice > 0
      ? Math.max(minTick, snapTick(priceToTick(humanPrice * (1 - lowerPct), token0Dec, token1Dec), tickSpacing, 'floor'))
      : minTick
    tickUpper = humanPrice > 0
      ? Math.min(maxTick, snapTick(priceToTick(humanPrice * (1 + upperPct), token0Dec, token1Dec), tickSpacing, 'ceil'))
      : maxTick
  }

  const multiplier = capitalMultiplier(tickLower, tickUpper, currentTick)

  function handlePresetClick(p: V3Preset) {
    setPreset(p); setCustomTickLower(null); setCustomTickUpper(null)
  }

  function adjustLower(delta: 1 | -1) {
    const cur = (preset === 'custom' && customTickLower !== null) ? customTickLower : tickLower
    const curUp = (preset === 'custom' && customTickUpper !== null) ? customTickUpper : tickUpper
    const newL = Math.max(minTick, Math.min(cur + delta * tickSpacing, curUp - tickSpacing))
    setCustomTickLower(newL)
    setCustomTickUpper(curUp)
    setPreset('custom')
  }

  function adjustUpper(delta: 1 | -1) {
    const cur = (preset === 'custom' && customTickUpper !== null) ? customTickUpper : tickUpper
    const curLow = (preset === 'custom' && customTickLower !== null) ? customTickLower : tickLower
    const newU = Math.min(maxTick, Math.max(cur + delta * tickSpacing, curLow + tickSpacing))
    setCustomTickUpper(newU)
    setCustomTickLower(curLow)
    setPreset('custom')
  }

  // Balances
  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const { data: bal0Raw } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: bal1Raw } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const bal0Str = monIsT0
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (bal0Raw !== undefined ? formatUnits(bal0Raw, token0Dec) : undefined)
  const bal1Str = wmonSide === 'token1'
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (bal1Raw !== undefined ? formatUnits(bal1Raw, token1Dec) : undefined)

  function onAmt0Change(v: string) {
    setAmt0(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const r1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, token0Dec))
      setAmt1(r1 > 0 ? (r1 / Math.pow(10, token1Dec)).toFixed(Math.min(token1Dec, 6)) : '')
    } else { setAmt1('') }
  }
  function onAmt1Change(v: string) {
    setAmt1(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const r0 = v3Amount0FromAmount1(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, token1Dec))
      setAmt0(r0 > 0 ? (r0 / Math.pow(10, token0Dec)).toFixed(Math.min(token0Dec, 6)) : '')
    } else { setAmt0('') }
  }
  useEffect(() => {
    if (sqrtPriceX96 > 0n && amt0 && Number(amt0) > 0) {
      const r1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(amt0) * Math.pow(10, token0Dec))
      setAmt1(r1 > 0 ? (r1 / Math.pow(10, token1Dec)).toFixed(Math.min(token1Dec, 6)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customTickLower, customTickUpper, sqrtPriceX96])

  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, token0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, token1Dec) : 0n

  const bal0Wei = monIsT0 ? (nativeBal?.value ?? 0n) : (bal0Raw ?? 0n)
  const bal1Wei = wmonSide === 'token1' ? (nativeBal?.value ?? 0n) : (bal1Raw ?? 0n)
  const insuf0 = raw0 > 0n && raw0 > bal0Wei
  const insuf1 = raw1 > 0n && raw1 > bal1Wei

  const npmAddr = UNISWAP_V3_NPM.address
  const { data: allow0 } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: allow1 } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const t0Approved = raw0 > 0n && (allow0 ?? 0n) >= raw0
  const t1Approved = raw1 > 0n && (allow1 ?? 0n) >= raw1

  const currentStep = wmonSide === 'token0'
    ? (!t1Approved ? 1 : 2)
    : wmonSide === 'token1'
      ? (!t0Approved ? 1 : 2)
      : (!t0Approved ? 1 : !t1Approved ? 2 : 3)

  const stepLabels = wmonSide === 'token0'
    ? [`Approve ${token1Sym}`, 'Mint Position']
    : wmonSide === 'token1'
      ? [`Approve ${token0Sym}`, 'Mint Position']
      : [`Approve ${token0Sym}`, `Approve ${token1Sym}`, 'Mint Position']

  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const mintWrite    = useWriteContract()
  const mintTx       = useWaitForTransactionReceipt({ hash: mintWrite.data })

  const isSigning = approveWrite.isPending || mintWrite.isPending
  const isWaiting = approveTx.isLoading    || mintTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = mintTx.isSuccess
  const txHash    = mintWrite.data ?? approveWrite.data
  const error     = approveWrite.error ?? approveTx.error ?? mintWrite.error ?? mintTx.error
  const isMintStep = wmonSide === 'none' ? currentStep === 3 : currentStep === 2
  const erc20Sym  = wmonSide === 'token0' ? token1Sym : token0Sym

  function handleAction() {
    if (!address || raw0 === 0n || raw1 === 0n || isPending || insuf0 || insuf1) return
    const addr = address as `0x${string}`
    if (isMintStep) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      if (hasNative) {
        const mintData = encodeFunctionData({ abi: UNISWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }] })
        const refundData = encodeFunctionData({ abi: UNISWAP_V3_NPM.abi, functionName: 'refundETH', args: [] })
        mintWrite.writeContract({ address: npmAddr, abi: UNISWAP_V3_NPM.abi, functionName: 'multicall', args: [[mintData, refundData]], value: monIsT0 ? raw0 : raw1 })
      } else {
        mintWrite.writeContract({ address: npmAddr, abi: UNISWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }] })
      }
    } else if (wmonSide === 'token0' && currentStep === 1) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    } else if (wmonSide === 'token1' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 2) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    }
  }

  const btnLabel = isSuccess ? '✓ Position Created'
    : isSigning              ? 'Confirm in wallet…'
    : isWaiting              ? 'Transaction pending…'
    : wmonSide === 'none' && currentStep === 1 ? `Approve ${token0Sym}`
    : wmonSide === 'none' && currentStep === 2 ? `Approve ${token1Sym}`
    : !isMintStep            ? `Approve ${erc20Sym}`
    :                          'Mint Position'

  return (
    <div className="space-y-4">
      {/* Current price */}
      {humanPrice > 0 && (
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-4 py-2.5">
          <p className="text-xs text-slate-500">
            Current price:{' '}
            <span className="text-white font-medium">
              {invertPrice ? fmtPrice(1 / humanPrice) : fmtPrice(humanPrice)}{' '}
              {invertPrice ? `${token0Sym} per ${token1Sym}` : `${token1Sym} per ${token0Sym}`}
            </span>
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_360px] gap-6">
        {/* Left: Range controls */}
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5">
          <RangeControls
            preset={preset}
            onPresetClick={handlePresetClick}
            tickLower={tickLower}
            tickUpper={tickUpper}
            tickSpacing={tickSpacing}
            isFullRange={isFullRange}
            dec0={token0Dec}
            dec1={token1Dec}
            sym0={token0Sym}
            sym1={token1Sym}
            invertPrice={invertPrice}
            onToggleInvert={() => setInvertPrice(p => !p)}
            onAdjustLower={adjustLower}
            onAdjustUpper={adjustUpper}
          />
        </div>

        {/* Right: Deposit form */}
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5 space-y-4">
          {/* Capital efficiency */}
          {!isFullRange && multiplier > 1 && (
            <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-2.5">
              <span className="text-xs text-slate-400">Capital efficiency</span>
              <span className="text-xs font-semibold text-emerald-400">~{multiplier.toFixed(1)}x vs full range</span>
            </div>
          )}

          {/* Fee tier */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Fee tier</span>
            <span className="text-white font-medium">{(fee / 10000).toFixed(fee < 1000 ? 3 : 2)}%</span>
          </div>

          <WalletSection />

          <AmountInput label={`You deposit (${token0Sym})`} token={token0Sym} value={amt0} onChange={onAmt0Change} max={bal0Str} />
          <AmountInput label={`You deposit (${token1Sym})`} token={token1Sym} value={amt1} onChange={onAmt1Change} max={bal1Str} />

          {(insuf0 || insuf1) && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">
              {insuf0 && insuf1 ? `Not enough ${token0Sym} or ${token1Sym}` : insuf0 ? `Not enough ${token0Sym}` : `Not enough ${token1Sym}`}
            </p>
          )}

          <Steps steps={stepLabels} current={currentStep} />
          {approveTx.isSuccess && isMintStep && (
            <p className="text-center text-xs text-slate-600">{erc20Sym} approved · now mint position</p>
          )}

          <Btn
            label={btnLabel}
            onClick={handleAction}
            disabled={!address || raw0 === 0n || raw1 === 0n || insuf0 || insuf1 || isPending || isSuccess}
          />

          {txHash && (
            <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
            </a>
          )}
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 break-words">
              {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PancakeSwap V3 Page Flow ───────────────────────────────────────────────────
function PancakeV3PageFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = PANCAKESWAP_V3_POOLS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const { address: poolAddr, token0, t0Dec, t0Sym, token1, t1Dec, t1Sym, fee, tickSpacing, wmonSide } = info
  const hasNative = wmonSide !== 'none'
  const monIsT0   = wmonSide === 'token0'

  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')
  const [preset, setPreset] = useState<V3Preset | 'custom'>('wide')
  const [customTickLower, setCustomTickLower] = useState<number | null>(null)
  const [customTickUpper, setCustomTickUpper] = useState<number | null>(null)
  const [invertPrice, setInvertPrice] = useState(false)

  const { data: slot0 } = useReadContract({
    address: poolAddr, abi: PANCAKESWAP_V3_POOL_ABI, functionName: 'slot0',
    query: { refetchInterval: 15_000 },
  })
  const sqrtPriceX96 = slot0?.[0] ?? 0n
  const currentTick  = slot0?.[1] ?? 0

  const humanPrice = sqrtPriceX96 > 0n
    ? Math.pow(Number(sqrtPriceX96) / 2 ** 96, 2) * Math.pow(10, t0Dec - t1Dec)
    : 0

  const minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  const isFullRange = preset === 'full'
  let tickLower: number
  let tickUpper: number

  if (preset === 'custom' && customTickLower !== null && customTickUpper !== null) {
    tickLower = customTickLower; tickUpper = customTickUpper
  } else if (isFullRange) {
    tickLower = minTick; tickUpper = maxTick
  } else {
    const { lowerPct, upperPct } = V3_RANGE_PRESETS[preset as V3Preset]
    tickLower = humanPrice > 0
      ? Math.max(minTick, snapTick(priceToTick(humanPrice * (1 - lowerPct), t0Dec, t1Dec), tickSpacing, 'floor'))
      : minTick
    tickUpper = humanPrice > 0
      ? Math.min(maxTick, snapTick(priceToTick(humanPrice * (1 + upperPct), t0Dec, t1Dec), tickSpacing, 'ceil'))
      : maxTick
  }

  const multiplier = capitalMultiplier(tickLower, tickUpper, currentTick)

  function handlePresetClick(p: V3Preset) {
    setPreset(p); setCustomTickLower(null); setCustomTickUpper(null)
  }

  function adjustLower(delta: 1 | -1) {
    const cur = (preset === 'custom' && customTickLower !== null) ? customTickLower : tickLower
    const curUp = (preset === 'custom' && customTickUpper !== null) ? customTickUpper : tickUpper
    setCustomTickLower(Math.max(minTick, Math.min(cur + delta * tickSpacing, curUp - tickSpacing)))
    setCustomTickUpper(curUp); setPreset('custom')
  }

  function adjustUpper(delta: 1 | -1) {
    const cur = (preset === 'custom' && customTickUpper !== null) ? customTickUpper : tickUpper
    const curLow = (preset === 'custom' && customTickLower !== null) ? customTickLower : tickLower
    setCustomTickUpper(Math.min(maxTick, Math.max(cur + delta * tickSpacing, curLow + tickSpacing)))
    setCustomTickLower(curLow); setPreset('custom')
  }

  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const { data: bal0Raw } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: bal1Raw } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const bal0Str = monIsT0 ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined) : (bal0Raw !== undefined ? formatUnits(bal0Raw, t0Dec) : undefined)
  const bal1Str = wmonSide === 'token1' ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined) : (bal1Raw !== undefined ? formatUnits(bal1Raw, t1Dec) : undefined)

  function onAmt0Change(v: string) {
    setAmt0(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const r1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, t0Dec))
      setAmt1(r1 > 0 ? (r1 / Math.pow(10, t1Dec)).toFixed(Math.min(t1Dec, 6)) : '')
    } else { setAmt1('') }
  }
  function onAmt1Change(v: string) {
    setAmt1(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const r0 = v3Amount0FromAmount1(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, t1Dec))
      setAmt0(r0 > 0 ? (r0 / Math.pow(10, t0Dec)).toFixed(Math.min(t0Dec, 6)) : '')
    } else { setAmt0('') }
  }
  useEffect(() => {
    if (sqrtPriceX96 > 0n && amt0 && Number(amt0) > 0) {
      const r1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(amt0) * Math.pow(10, t0Dec))
      setAmt1(r1 > 0 ? (r1 / Math.pow(10, t1Dec)).toFixed(Math.min(t1Dec, 6)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customTickLower, customTickUpper, sqrtPriceX96])

  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, t0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, t1Dec) : 0n
  const bal0Wei = monIsT0 ? (nativeBal?.value ?? 0n) : (bal0Raw ?? 0n)
  const bal1Wei = wmonSide === 'token1' ? (nativeBal?.value ?? 0n) : (bal1Raw ?? 0n)
  const insuf0 = raw0 > 0n && raw0 > bal0Wei
  const insuf1 = raw1 > 0n && raw1 > bal1Wei

  const npmAddr = PANCAKESWAP_V3_NPM.address
  const { data: allow0 } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: allow1 } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const t0Approved = raw0 > 0n && (allow0 ?? 0n) >= raw0
  const t1Approved = raw1 > 0n && (allow1 ?? 0n) >= raw1

  const currentStep = wmonSide === 'token0'
    ? (!t1Approved ? 1 : 2)
    : wmonSide === 'token1'
      ? (!t0Approved ? 1 : 2)
      : (!t0Approved ? 1 : !t1Approved ? 2 : 3)

  const stepLabels = wmonSide === 'token0'
    ? [`Approve ${t1Sym}`, 'Mint Position']
    : wmonSide === 'token1'
      ? [`Approve ${t0Sym}`, 'Mint Position']
      : [`Approve ${t0Sym}`, `Approve ${t1Sym}`, 'Mint Position']

  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const mintWrite    = useWriteContract()
  const mintTx       = useWaitForTransactionReceipt({ hash: mintWrite.data })

  const isSigning = approveWrite.isPending || mintWrite.isPending
  const isWaiting = approveTx.isLoading    || mintTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = mintTx.isSuccess
  const txHash    = mintWrite.data ?? approveWrite.data
  const error     = approveWrite.error ?? approveTx.error ?? mintWrite.error ?? mintTx.error
  const isMintStep = wmonSide === 'none' ? currentStep === 3 : currentStep === 2
  const erc20Sym  = wmonSide === 'token0' ? t1Sym : t0Sym

  function handleAction() {
    if (!address || raw0 === 0n || raw1 === 0n || isPending || insuf0 || insuf1) return
    const addr = address as `0x${string}`
    if (isMintStep) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      if (hasNative) {
        const mintData = encodeFunctionData({ abi: PANCAKESWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }] })
        const refundData = encodeFunctionData({ abi: PANCAKESWAP_V3_NPM.abi, functionName: 'refundETH', args: [] })
        mintWrite.writeContract({ address: npmAddr, abi: PANCAKESWAP_V3_NPM.abi, functionName: 'multicall', args: [[mintData, refundData]], value: monIsT0 ? raw0 : raw1 })
      } else {
        mintWrite.writeContract({ address: npmAddr, abi: PANCAKESWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }] })
      }
    } else if (wmonSide === 'token0' && currentStep === 1) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    } else if (wmonSide === 'token1' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 2) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    }
  }

  const btnLabel = isSuccess ? '✓ Position Created'
    : isSigning              ? 'Confirm in wallet…'
    : isWaiting              ? 'Transaction pending…'
    : wmonSide === 'none' && currentStep === 1 ? `Approve ${t0Sym}`
    : wmonSide === 'none' && currentStep === 2 ? `Approve ${t1Sym}`
    : !isMintStep            ? `Approve ${erc20Sym}`
    :                          'Mint Position'

  return (
    <div className="space-y-4">
      {humanPrice > 0 && (
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-4 py-2.5">
          <p className="text-xs text-slate-500">
            Current price:{' '}
            <span className="text-white font-medium">
              {invertPrice ? fmtPrice(1 / humanPrice) : fmtPrice(humanPrice)}{' '}
              {invertPrice ? `${t0Sym} per ${t1Sym}` : `${t1Sym} per ${t0Sym}`}
            </span>
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_360px] gap-6">
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5">
          <RangeControls
            preset={preset} onPresetClick={handlePresetClick}
            tickLower={tickLower} tickUpper={tickUpper}
            tickSpacing={tickSpacing} isFullRange={isFullRange}
            dec0={t0Dec} dec1={t1Dec} sym0={t0Sym} sym1={t1Sym}
            invertPrice={invertPrice} onToggleInvert={() => setInvertPrice(p => !p)}
            onAdjustLower={adjustLower} onAdjustUpper={adjustUpper}
          />
        </div>

        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5 space-y-4">
          {!isFullRange && multiplier > 1 && (
            <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-2.5">
              <span className="text-xs text-slate-400">Capital efficiency</span>
              <span className="text-xs font-semibold text-emerald-400">~{multiplier.toFixed(1)}x vs full range</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Fee tier</span>
            <span className="text-white font-medium">{(fee / 10000).toFixed(fee < 1000 ? 3 : 2)}%</span>
          </div>

          <WalletSection />
          <AmountInput label={`You deposit (${t0Sym})`} token={t0Sym} value={amt0} onChange={onAmt0Change} max={bal0Str} />
          <AmountInput label={`You deposit (${t1Sym})`} token={t1Sym} value={amt1} onChange={onAmt1Change} max={bal1Str} />

          {(insuf0 || insuf1) && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">
              {insuf0 && insuf1 ? `Not enough ${t0Sym} or ${t1Sym}` : insuf0 ? `Not enough ${t0Sym}` : `Not enough ${t1Sym}`}
            </p>
          )}

          <Steps steps={stepLabels} current={currentStep} />
          <Btn label={btnLabel} onClick={handleAction}
            disabled={!address || raw0 === 0n || raw1 === 0n || insuf0 || insuf1 || isPending || isSuccess} />

          {txHash && (
            <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
            </a>
          )}
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 break-words">
              {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Uniswap V4 Page Flow ──────────────────────────────────────────────────────
function UniswapV4PageFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = UNISWAP_V4_POOLS[pool.id]

  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')
  const [preset, setPreset] = useState<V3Preset | 'custom'>('wide')
  const [customTickLower, setCustomTickLower] = useState<number | null>(null)
  const [customTickUpper, setCustomTickUpper] = useState<number | null>(null)
  const [invertPrice, setInvertPrice] = useState(false)

  const { currency0, c0Dec, c0Sym, currency1, c1Dec, c1Sym, fee, tickSpacing, hasNative, poolId } = info ?? {}

  const { data: slot0 } = useReadContract({
    address: UNISWAP_V4_STATE_VIEW.address, abi: UNISWAP_V4_STATE_VIEW.abi,
    functionName: 'getSlot0', args: [poolId as `0x${string}`],
    query: { enabled: !!info, refetchInterval: 15_000 },
  })
  const sqrtPriceX96 = slot0 ? (slot0 as readonly [bigint, number, number, number])[0] : 0n
  const currentTick  = slot0 ? (slot0 as readonly [bigint, number, number, number])[1] : 0

  const humanPrice = sqrtPriceX96 > 0n
    ? Math.pow(Number(sqrtPriceX96) / 2 ** 96, 2) * Math.pow(10, c0Dec - c1Dec)
    : 0

  const minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  const isFullRange = preset === 'full'
  let tickLower: number
  let tickUpper: number

  if (preset === 'custom' && customTickLower !== null && customTickUpper !== null) {
    tickLower = customTickLower; tickUpper = customTickUpper
  } else if (isFullRange) {
    tickLower = minTick; tickUpper = maxTick
  } else {
    const { lowerPct, upperPct } = V3_RANGE_PRESETS[preset as V3Preset]
    tickLower = humanPrice > 0
      ? Math.max(minTick, snapTick(priceToTick(humanPrice * (1 - lowerPct), c0Dec, c1Dec), tickSpacing, 'floor'))
      : minTick
    tickUpper = humanPrice > 0
      ? Math.min(maxTick, snapTick(priceToTick(humanPrice * (1 + upperPct), c0Dec, c1Dec), tickSpacing, 'ceil'))
      : maxTick
  }

  const multiplier = capitalMultiplier(tickLower, tickUpper, currentTick)

  function handlePresetClick(p: V3Preset) {
    setPreset(p); setCustomTickLower(null); setCustomTickUpper(null)
  }

  function adjustLower(delta: 1 | -1) {
    const cur = (preset === 'custom' && customTickLower !== null) ? customTickLower : tickLower
    const curUp = (preset === 'custom' && customTickUpper !== null) ? customTickUpper : tickUpper
    setCustomTickLower(Math.max(minTick, Math.min(cur + delta * tickSpacing, curUp - tickSpacing)))
    setCustomTickUpper(curUp); setPreset('custom')
  }

  function adjustUpper(delta: 1 | -1) {
    const cur = (preset === 'custom' && customTickUpper !== null) ? customTickUpper : tickUpper
    const curLow = (preset === 'custom' && customTickLower !== null) ? customTickLower : tickLower
    setCustomTickUpper(Math.min(maxTick, Math.max(cur + delta * tickSpacing, curLow + tickSpacing)))
    setCustomTickLower(curLow); setPreset('custom')
  }

  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const { data: c0BalRaw } = useReadContract({
    address: currency0 as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !hasNative },
  })
  const { data: c1BalRaw } = useReadContract({
    address: currency1 as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const c0BalStr = hasNative ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined) : (c0BalRaw !== undefined ? formatUnits(c0BalRaw, c0Dec) : undefined)
  const c1BalStr = c1BalRaw !== undefined ? formatUnits(c1BalRaw, c1Dec) : undefined

  function onAmt0Change(v: string) {
    setAmt0(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const r1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, c0Dec))
      setAmt1(r1 > 0 ? (r1 / Math.pow(10, c1Dec)).toFixed(Math.min(c1Dec, 6)) : '')
    } else { setAmt1('') }
  }
  function onAmt1Change(v: string) {
    setAmt1(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const r0 = v3Amount0FromAmount1(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, c1Dec))
      setAmt0(r0 > 0 ? (r0 / Math.pow(10, c0Dec)).toFixed(Math.min(c0Dec, 6)) : '')
    } else { setAmt0('') }
  }
  useEffect(() => {
    if (sqrtPriceX96 > 0n && amt0 && Number(amt0) > 0) {
      const r1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(amt0) * Math.pow(10, c0Dec))
      setAmt1(r1 > 0 ? (r1 / Math.pow(10, c1Dec)).toFixed(Math.min(c1Dec, 6)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customTickLower, customTickUpper, sqrtPriceX96])

  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, c0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, c1Dec) : 0n
  const c0BalWei = hasNative ? (nativeBal?.value ?? 0n) : (c0BalRaw ?? 0n)
  const insuf0 = raw0 > 0n && raw0 > c0BalWei
  const insuf1 = raw1 > 0n && raw1 > (c1BalRaw ?? 0n)

  const pmAddr       = UNISWAP_V4_POSITION_MANAGER.address
  const p2Addr       = PERMIT2.address
  const MAX_UINT256  = 2n ** 256n - 1n
  const MAX_UINT160  = 2n ** 160n - 1n
  const P2_DEADLINE  = 2n ** 48n - 1n
  const publicClient = usePublicClient()

  const { data: erc20Allow0ToP2 } = useReadContract({
    address: currency0 as `0x${string}`, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, p2Addr],
    query: { enabled: !!address && !hasNative },
  })
  const { data: erc20Allow1ToP2 } = useReadContract({
    address: currency1 as `0x${string}`, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, p2Addr],
    query: { enabled: !!address },
  })
  const { data: p2Allow0 } = useReadContract({
    address: p2Addr, abi: PERMIT2.abi, functionName: 'allowance',
    args: [address as `0x${string}`, currency0 as `0x${string}`, pmAddr],
    query: { enabled: !!address && !hasNative },
  })
  const { data: p2Allow1 } = useReadContract({
    address: p2Addr, abi: PERMIT2.abi, functionName: 'allowance',
    args: [address as `0x${string}`, currency1 as `0x${string}`, pmAddr],
    query: { enabled: !!address },
  })
  const nowSec = Math.floor(Date.now() / 1000)
  const p2Amt0 = p2Allow0 ? (p2Allow0 as readonly [bigint, number, number])[0] : 0n
  const p2Exp0 = p2Allow0 ? (p2Allow0 as readonly [bigint, number, number])[1] : 0
  const p2Amt1 = p2Allow1 ? (p2Allow1 as readonly [bigint, number, number])[0] : 0n
  const p2Exp1 = p2Allow1 ? (p2Allow1 as readonly [bigint, number, number])[1] : 0

  const c0ErcApproved = hasNative || (raw0 > 0n && (erc20Allow0ToP2 ?? 0n) >= raw0)
  const c0P2Approved  = hasNative || (raw0 > 0n && p2Amt0 >= raw0 && p2Exp0 > nowSec)
  const c1ErcApproved = raw1 > 0n && (erc20Allow1ToP2 ?? 0n) >= raw1
  const c1P2Approved  = raw1 > 0n && p2Amt1 >= raw1 && p2Exp1 > nowSec

  const currentStep = hasNative
    ? (!c1ErcApproved ? 1 : !c1P2Approved ? 2 : 3)
    : (!c0ErcApproved ? 1 : !c0P2Approved ? 2 : !c1ErcApproved ? 3 : !c1P2Approved ? 4 : 5)

  const isMinting  = currentStep === (hasNative ? 3 : 5)
  const visualStep = isMinting ? 2 : 1
  const stepLabels = ['Approve tokens', 'Add Liquidity']
  const actionLabel = hasNative
    ? (currentStep === 1 ? `Approve ${c1Sym}` : currentStep === 2 ? `Authorize ${c1Sym}` : 'Add Liquidity')
    : (currentStep === 1 ? `Approve ${c0Sym}` : currentStep === 2 ? `Authorize ${c0Sym}` : currentStep === 3 ? `Approve ${c1Sym}` : currentStep === 4 ? `Authorize ${c1Sym}` : 'Add Liquidity')

  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const mintWrite    = useWriteContract()
  const mintTx       = useWaitForTransactionReceipt({ hash: mintWrite.data })

  const isSigning = approveWrite.isPending || mintWrite.isPending
  const isWaiting = approveTx.isLoading    || mintTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = mintTx.isSuccess
  const txHash    = mintWrite.data ?? approveWrite.data
  const txError   = approveWrite.error ?? approveTx.error ?? mintWrite.error ?? mintTx.error
  const hasInput  = raw0 > 0n || raw1 > 0n

  // Save tokenId to localStorage after successful V4 mint
  useEffect(() => {
    if (!mintTx.isSuccess || !address) return
    const addr: string = address

    async function findAndSave(w: string) {
      console.log('[V4] findAndSave start, logs:', mintTx.data?.logs?.length ?? 'no receipt')
      // Primary: parse Transfer(from=0, to=wallet, tokenId) from receipt logs
      const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      const ZERO     = '0x0000000000000000000000000000000000000000000000000000000000000000'
      if (mintTx.data?.logs) {
        for (const log of mintTx.data.logs) {
          console.log('[V4] log:', log.address, log.topics)
          if (
            log.address.toLowerCase() === pmAddr.toLowerCase() &&
            log.topics[0] === TRANSFER &&
            log.topics[1] === ZERO &&
            log.topics[3]
          ) {
            console.log('[V4] Transfer found, tokenId:', log.topics[3])
            saveV4TokenId(w, BigInt(log.topics[3] as string))
            return
          }
        }
      }
      // Fallback: nextTokenId() - 1 (minted id = nextTokenId before increment)
      console.log('[V4] Transfer not found in logs, trying nextTokenId fallback')
      try {
        const nextId = await publicClient?.readContract({
          address: pmAddr as `0x${string}`,
          abi: NEXT_ID_ABI,
          functionName: 'nextTokenId',
        })
        console.log('[V4] nextTokenId:', nextId)
        if (typeof nextId === 'bigint' && nextId > 0n) {
          saveV4TokenId(w, nextId - 1n)
        }
      } catch (e) { console.error('[V4] nextTokenId error:', e) }
    }

    findAndSave(addr)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintTx.isSuccess])

  function handleAction() {
    if (!address || isPending || insuf0 || insuf1 || !hasInput) return
    const addr = address as `0x${string}`
    if (!hasNative && currentStep === 1) {
      approveWrite.writeContract({ address: currency0 as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [p2Addr, MAX_UINT256] })
    } else if (!hasNative && currentStep === 2) {
      approveWrite.writeContract({ address: p2Addr, abi: PERMIT2.abi, functionName: 'approve', args: [currency0 as `0x${string}`, pmAddr, MAX_UINT160, Number(P2_DEADLINE)] })
    } else if (currentStep === (hasNative ? 1 : 3)) {
      approveWrite.writeContract({ address: currency1 as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [p2Addr, MAX_UINT256] })
    } else if (currentStep === (hasNative ? 2 : 4)) {
      approveWrite.writeContract({ address: p2Addr, abi: PERMIT2.abi, functionName: 'approve', args: [currency1 as `0x${string}`, pmAddr, MAX_UINT160, Number(P2_DEADLINE)] })
    } else {
      const amt0Float = Number(amt0) * Math.pow(10, c0Dec)
      const amt1Float = Number(amt1) * Math.pow(10, c1Dec)
      const liquidity = computeV4Liquidity(sqrtPriceX96, tickLower, tickUpper, amt0Float, amt1Float)
      if (liquidity === 0n) return
      const unlockData = encodeV4UnlockData(
        currency0 as `0x${string}`, currency1 as `0x${string}`,
        fee, tickSpacing, tickLower, tickUpper,
        liquidity, raw0 * 102n / 100n, raw1 * 102n / 100n, addr, hasNative,
      )
      mintWrite.writeContract({
        address: pmAddr, abi: UNISWAP_V4_POSITION_MANAGER.abi,
        functionName: 'modifyLiquidities',
        args: [unlockData, BigInt(Math.floor(Date.now() / 1000) + 1200)],
        value: hasNative ? raw0 * 102n / 100n : 0n,
        gas: 3_000_000n,
      })
    }
  }

  const btnLabel = isSuccess ? '✓ Position Created'
    : isSigning              ? 'Confirm in wallet…'
    : isWaiting              ? 'Transaction pending…'
    : actionLabel

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  return (
    <div className="space-y-4">
      {humanPrice > 0 && (
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-4 py-2.5">
          <p className="text-xs text-slate-500">
            Current price:{' '}
            <span className="text-white font-medium">
              {invertPrice ? fmtPrice(1 / humanPrice) : fmtPrice(humanPrice)}{' '}
              {invertPrice ? `${c0Sym} per ${c1Sym}` : `${c1Sym} per ${c0Sym}`}
            </span>
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_360px] gap-6">
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5">
          <RangeControls
            preset={preset} onPresetClick={handlePresetClick}
            tickLower={tickLower} tickUpper={tickUpper}
            tickSpacing={tickSpacing} isFullRange={isFullRange}
            dec0={c0Dec} dec1={c1Dec} sym0={c0Sym} sym1={c1Sym}
            invertPrice={invertPrice} onToggleInvert={() => setInvertPrice(p => !p)}
            onAdjustLower={adjustLower} onAdjustUpper={adjustUpper}
          />
        </div>

        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5 space-y-4">
          {!isFullRange && multiplier > 1 && (
            <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-2.5">
              <span className="text-xs text-slate-400">Capital efficiency</span>
              <span className="text-xs font-semibold text-emerald-400">~{multiplier.toFixed(1)}x vs full range</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Fee tier</span>
            <span className="text-white font-medium">
              {fee < 100 ? (fee / 10000).toFixed(4) : fee < 1000 ? (fee / 10000).toFixed(3) : (fee / 10000).toFixed(2)}%
            </span>
          </div>

          <WalletSection />
          <AmountInput label={`You deposit (${c0Sym})`} token={c0Sym} value={amt0} onChange={onAmt0Change} max={c0BalStr} />
          <AmountInput label={`You deposit (${c1Sym})`} token={c1Sym} value={amt1} onChange={onAmt1Change} max={c1BalStr} />

          {(insuf0 || insuf1) && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">
              {insuf0 && insuf1 ? `Not enough ${c0Sym} or ${c1Sym}` : insuf0 ? `Not enough ${c0Sym}` : `Not enough ${c1Sym}`}
            </p>
          )}

          <Steps steps={stepLabels} current={visualStep} />
          <Btn label={btnLabel} onClick={handleAction}
            disabled={!address || !hasInput || insuf0 || insuf1 || isPending || isSuccess} />

          {txHash && (
            <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
            </a>
          )}
          {txError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 break-words">
              {(txError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Simple page layout (LST / Lending / Borrowing / Kuru / Clober / V2) ───────
function SimplePageLayout({ pool, address }: { pool: Pool; address?: string }) {
  const lp = pool as LPPool
  const lending = pool as LendingPool
  const borrowing = pool as BorrowingPool
  const lst = pool as LiquidStakingPool
  const action = pool.type === 'borrowing' ? 'borrow' : 'deposit'

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-6">
      {/* Left: pool info */}
      <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5">
        <PoolInfoPanel pool={pool} />
      </div>

      {/* Right: flow form */}
      <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-white capitalize">{action}</p>

        {pool.status === 'full' && pool.protocol !== 'Curvance' && (
          <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl px-4 py-3 text-xs text-slate-400 leading-relaxed">
            This pool is currently at capacity — no new deposits are accepted.
          </div>
        )}

        <WalletSection action={action} />

        {pool.type === 'liquid_staking' && <LSTFlow pool={lst} address={address} />}
        {pool.type === 'lending' && <LendingFlow pool={lending} address={address} />}
        {pool.type === 'borrowing' && <BorrowFlow pool={borrowing} address={address} />}
        {pool.type === 'lp' && pool.protocol === 'Kuru' && pool.id.startsWith('kuru-vault-') && (
          <KuruVaultFlow pool={lp} address={address} />
        )}
        {pool.type === 'lp' && pool.protocol === 'Clober' && (
          <CloberFlow pool={lp} address={address} />
        )}
        {pool.type === 'lp' && pool.protocol === 'Uniswap' && pool.id.startsWith('uniswap-v2-') && (
          <UniswapV2Flow pool={lp} address={address} />
        )}
      </div>
    </div>
  )
}

// ── Main pool page export ─────────────────────────────────────────────────────
export function PoolPage({ pool }: { pool: Pool }) {
  const { address } = useAccount()

  const isLP  = pool.type === 'lp'
  const lp    = pool as LPPool
  const isV3  = isLP && pool.protocol === 'Uniswap' && pool.id.startsWith('uniswap-v3-')
  const isV4  = isLP && pool.protocol === 'Uniswap' && pool.id.startsWith('uniswap-v4-')
  const isPancake = isLP && pool.protocol === 'PancakeSwap'

  // V3-like pools dispatch to expanded page flows
  const isExpandedV3 = isV3 || isV4 || isPancake

  return (
    <div className="space-y-6">
      <PoolHeader pool={pool} />
      <PoolStats pool={pool} />

      {isV3 && <UniswapV3PageFlow pool={lp} address={address} />}
      {isPancake && <PancakeV3PageFlow pool={lp} address={address} />}
      {isV4 && <UniswapV4PageFlow pool={lp} address={address} />}
      {!isExpandedV3 && <SimplePageLayout pool={pool} address={address} />}
    </div>
  )
}
