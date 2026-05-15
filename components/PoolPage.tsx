'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts'
import { saveV4TokenId, loadV4TokenIds } from '@/lib/v4positions'
import {
  useAccount, useDisconnect, useBalance,
  useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts, usePublicClient,
} from 'wagmi'
import { ConnectModal } from '@/components/WalletButton'
import { parseUnits, formatUnits, encodeFunctionData, keccak256, encodeAbiParameters } from 'viem'
import type { Pool, LendingPool, BorrowingPool, LiquidStakingPool, LPPool } from '@/types'
import {
  ERC20_ABI,
  UNISWAP_V2_ROUTER, UNISWAP_V2_PAIR_ABI, UNISWAP_V2_POOLS,
  UNISWAP_V3_NPM, UNISWAP_V3_POOL_ABI, UNISWAP_V3_POOLS,
  UNISWAP_V4_POSITION_MANAGER, UNISWAP_V4_STATE_VIEW, UNISWAP_V4_POOLS, PERMIT2,
  PANCAKESWAP_V3_NPM, PANCAKESWAP_V3_POOL_ABI, PANCAKESWAP_V3_POOLS,
  CURVANCE_MARKETS, CURVANCE_BORROW_MARKETS, CURVANCE_BORROW_ABI,
  NEVERLAND_DATA_PROVIDER, NEVERLAND_RESERVES, NEVERLAND_BORROW_RESERVES,
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
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)

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
    <>
      <div className="flex items-center justify-between bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 gap-3">
        <div>
          <p className="text-sm font-medium text-white">Connect wallet</p>
          <p className="text-xs text-slate-500 mt-0.5">Required to {action}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 px-4 py-1.5 text-xs font-semibold bg-[#CC3BFF] hover:opacity-90 text-white rounded-lg transition-colors"
        >
          Connect
        </button>
      </div>
      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </>
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


// ── NeverlandLTV — reads PoolDataProvider.getReserveConfigurationData(asset) → ltv (BPS) ──
function NeverlandLTV({ asset }: { asset: `0x${string}` }) {
  const { data } = useReadContract({
    address: NEVERLAND_DATA_PROVIDER.address,
    abi: NEVERLAND_DATA_PROVIDER.abi,
    functionName: 'getReserveConfigurationData',
    args: [asset],
  })
  if (!data || data[1] === 0n) return null
  const ltv = Number(data[1]) / 100  // BPS → percent
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">Max LTV</span>
      <span className="text-white font-semibold">{ltv.toFixed(0)}%</span>
    </div>
  )
}

// ── CurvanceLTV — reads MarketManager.collConfig(cToken) → collRatio (BPS) ────
// Step 1: cToken.marketManager() → market manager address
// Step 2: marketManager.collConfig(cToken) → [collRatio, collReqSoft, collReqHard]
const MARKET_MANAGER_ABI = [{ name: 'marketManager', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] }] as const
const COLL_CONFIG_ABI   = [{ name: 'collConfig', type: 'function', stateMutability: 'view', inputs: [{ name: 'cToken', type: 'address' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] }] as const

function CurvanceLTV({ colCToken }: { colCToken: `0x${string}` }) {
  const { data: mmAddr } = useReadContract({ address: colCToken, abi: MARKET_MANAGER_ABI, functionName: 'marketManager' })
  const { data: cfg }    = useReadContract({
    address: mmAddr,
    abi: COLL_CONFIG_ABI,
    functionName: 'collConfig',
    args: [colCToken],
    query: { enabled: !!mmAddr },
  })
  if (!cfg) return null
  // collRatio is BPS (e.g. 7500 = 75%)
  const ltv = Number(cfg[0]) / 100
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">Max LTV</span>
      <span className="text-white font-semibold">{ltv.toFixed(0)}%</span>
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

{/* Curvance borrow collateral + LTV */}
        {curvBorrow && (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Collateral</span>
              <span className="text-white font-semibold">{curvBorrow.colSym}</span>
            </div>
            <CurvanceLTV colCToken={curvBorrow.colCToken} />
          </>
        )}

        {/* Neverland LTV */}
        {pool.protocol === 'Neverland' && (pool.type === 'lending' || pool.type === 'borrowing') && (() => {
          const r = pool.type === 'lending' ? NEVERLAND_RESERVES[pool.id] : NEVERLAND_BORROW_RESERVES[pool.id]
          return r ? <NeverlandLTV asset={r.asset} /> : null
        })()}

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

// ── V3 Price Range Chart ──────────────────────────────────────────────────────
type OhlcvRow = { time: number; close: number }
type ChartTf  = '1D' | '1W' | '1M'

const GECKO_OHLCV = 'https://api.geckoterminal.com/api/v2/networks/monad/pools'

const TF_CONFIG: Record<ChartTf, { resolution: string; aggregate: number; limit: number }> = {
  '1D': { resolution: 'minute', aggregate: 15, limit: 96   },
  '1W': { resolution: 'hour',   aggregate: 1,  limit: 168  },
  '1M': { resolution: 'day',    aggregate: 1,  limit: 30   },
}

function V3PriceRangeChart({
  poolContractAddr,
  minPrice, maxPrice, currentPrice,
  isFullRange, invertPrice,
  sym0, sym1,
}: {
  poolContractAddr: string
  minPrice: number
  maxPrice: number
  currentPrice: number
  isFullRange: boolean
  invertPrice: boolean
  sym0: string
  sym1: string
}) {
  const [tf, setTf]           = useState<ChartTf>('1W')
  const [rows, setRows]       = useState<OhlcvRow[]>([])
  const [loading, setLoading] = useState(true)
  const invertedRef           = useRef(false) // whether we had to flip GeckoTerminal data

  useEffect(() => {
    if (!poolContractAddr) return
    let cancelled = false
    setLoading(true)

    const { resolution, aggregate, limit } = TF_CONFIG[tf]
    const url = `${GECKO_OHLCV}/${poolContractAddr}/ohlcv/${resolution}?aggregate=${aggregate}&limit=${limit}&currency=token&token=base`

    fetch(url, { next: { revalidate: 0 } } as RequestInit)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const list: [number, number, number, number, number, number][] =
          data?.data?.attributes?.ohlcv_list ?? []
        if (!list.length) { setRows([]); setLoading(false); return }

        // Sniff-and-flip: GeckoTerminal base/quote isn't always token0/token1
        // Compare latest close to currentPrice; if far off, use 1/close
        const latestClose = list[list.length - 1][4]
        const cp = currentPrice > 0 ? currentPrice : 1
        const errDirect  = Math.abs(latestClose / cp - 1)
        const errInverted = Math.abs((1 / latestClose) / cp - 1)
        invertedRef.current = errInverted < errDirect

        const result: OhlcvRow[] = list.map(([ts, , , , close]) => ({
          time:  ts * 1000,
          close: invertedRef.current ? 1 / close : close,
        }))
        setRows(result)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [poolContractAddr, tf, currentPrice])

  // Apply invertPrice for display
  const displayRows = invertPrice
    ? rows.map(r => ({ ...r, close: r.close > 0 ? 1 / r.close : r.close }))
    : rows

  const displayMin = isFullRange ? undefined : invertPrice ? (maxPrice > 0 ? 1 / maxPrice : 0) : minPrice
  const displayMax = isFullRange ? undefined : invertPrice ? (minPrice > 0 ? 1 / minPrice : 0) : maxPrice
  const displayCurrent = invertPrice && currentPrice > 0 ? 1 / currentPrice : currentPrice

  // Y-axis domain: keep the range band visible, with some padding
  let yDomain: [number | 'auto', number | 'auto'] = ['auto', 'auto']
  if (displayRows.length && !isFullRange && displayMin !== undefined && displayMax !== undefined) {
    const closes = displayRows.map(r => r.close)
    const lo = Math.min(...closes, displayMin) * 0.95
    const hi = Math.max(...closes, displayMax) * 1.05
    yDomain = [lo, hi]
  }

  const priceLabel = invertPrice ? `${sym0}/${sym1}` : `${sym1}/${sym0}`

  function fmtTooltipPrice(v: number) {
    if (!isFinite(v)) return '—'
    if (v >= 1000) return v.toFixed(2)
    if (v >= 1)    return v.toFixed(4)
    return v.toFixed(6)
  }

  function fmtAxisDate(ts: number) {
    const d = new Date(ts)
    if (tf === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Number of X-axis ticks to show
  const tickEvery = tf === '1D' ? 12 : tf === '1W' ? 24 : 6
  const xTicks = displayRows
    .filter((_, i) => i % tickEvery === 0)
    .map(r => r.time)

  return (
    <div className="mb-4">
      {/* Timeframe selector */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{priceLabel}</span>
        <div className="flex gap-1">
          {(['1D', '1W', '1M'] as ChartTf[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                tf === t
                  ? 'bg-[#CC3BFF]/20 text-[#CC3BFF] border border-[#CC3BFF]/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[240px] w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-slate-600 animate-pulse">Loading chart…</span>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-slate-600">No chart data</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayRows} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#CC3BFF" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#CC3BFF" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                ticks={xTicks}
                tickFormatter={fmtAxisDate}
                tick={{ fill: '#475569', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: '#475569', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={v => fmtTooltipPrice(v)}
              />
              <Tooltip
                contentStyle={{ background: '#0d1520', border: '1px solid #1a2535', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8', marginBottom: 2 }}
                itemStyle={{ color: '#e2e8f0' }}
                labelFormatter={ts => new Date(ts as number).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                formatter={(v: unknown) => [fmtTooltipPrice(v as number), priceLabel]}
              />
              {/* LP range band */}
              {!isFullRange && displayMin !== undefined && displayMax !== undefined && (
                <ReferenceArea
                  y1={displayMin} y2={displayMax}
                  fill="#CC3BFF" fillOpacity={0.12}
                  stroke="#CC3BFF" strokeOpacity={0.3} strokeWidth={1}
                />
              )}
              {/* Current price line */}
              {displayCurrent > 0 && (
                <ReferenceLine
                  y={displayCurrent}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  label={{ value: fmtTooltipPrice(displayCurrent), position: 'insideTopRight', fill: '#94a3b8', fontSize: 9 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="close"
                stroke="#CC3BFF"
                strokeWidth={1.5}
                fill="url(#priceAreaGrad)"
                dot={false}
                activeDot={{ r: 3, fill: '#CC3BFF' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── RangeBoundBox (for V3/V4 expanded layouts) ────────────────────────────────
function RangeBoundBox({
  label, displayPrice, unit, onDec, onInc, isFullRange, onSetPrice,
}: {
  label: string
  displayPrice: string
  unit: string
  onDec: () => void
  onInc: () => void
  isFullRange: boolean
  onSetPrice?: (price: string) => void
}) {
  const [draft, setDraft] = useState(displayPrice)
  const [focused, setFocused] = useState(false)
  // Sync draft when displayPrice changes externally (preset click, +/- buttons)
  // but not while the user is actively editing
  useEffect(() => {
    if (!focused) setDraft(displayPrice)
  }, [displayPrice, focused])

  function commit() {
    setFocused(false)
    if (onSetPrice && draft.trim() !== '') onSetPrice(draft.trim())
  }

  return (
    <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-2">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDec}
          disabled={isFullRange}
          className="w-8 h-8 flex-shrink-0 rounded-lg border border-[#1a2535] bg-[#0d1520] text-slate-400 hover:text-white hover:border-[#2a3a52] transition-all flex items-center justify-center text-lg font-light disabled:opacity-30 disabled:cursor-not-allowed"
        >
          −
        </button>
        {isFullRange ? (
          <span className="text-sm font-semibold text-slate-500 flex-1 text-center">
            {label === 'Min Price' ? '0' : '∞'}
          </span>
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() }
              if (e.key === 'Escape') { setDraft(displayPrice); setFocused(false) }
            }}
            className="flex-1 min-w-0 text-center text-sm font-semibold text-white bg-transparent outline-none border-b border-transparent focus:border-[#CC3BFF]/50 transition-colors"
          />
        )}
        <button
          type="button"
          onClick={onInc}
          disabled={isFullRange}
          className="w-8 h-8 flex-shrink-0 rounded-lg border border-[#1a2535] bg-[#0d1520] text-slate-400 hover:text-white hover:border-[#2a3a52] transition-all flex items-center justify-center text-lg font-light disabled:opacity-30 disabled:cursor-not-allowed"
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
  onSetLowerTick, onSetUpperTick,
  poolContractAddr, currentHumanPrice,
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
  onSetLowerTick?: (tick: number) => void
  onSetUpperTick?: (tick: number) => void
  poolContractAddr?: string
  currentHumanPrice?: number
}) {
  const lowerHuman = tickToHumanPrice(tickLower, dec0, dec1)
  const upperHuman = tickToHumanPrice(tickUpper, dec0, dec1)
  const minDisplay = invertPrice ? fmtPrice(1 / upperHuman) : fmtPrice(lowerHuman)
  const maxDisplay = invertPrice ? fmtPrice(1 / lowerHuman) : fmtPrice(upperHuman)
  const priceUnit = invertPrice ? `${sym0} per ${sym1}` : `${sym1} per ${sym0}`

  const _minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const _maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  function handleCommitMin(priceStr: string) {
    const v = parseFloat(priceStr)
    if (!isFinite(v) || v <= 0) return
    if (!invertPrice) {
      // min price → tickLower
      const raw = snapTick(priceToTick(v, dec0, dec1), tickSpacing, 'floor')
      onSetLowerTick?.(Math.max(_minTick, Math.min(raw, tickUpper - tickSpacing)))
    } else {
      // inverted min price corresponds to tickUpper
      const raw = snapTick(priceToTick(1 / v, dec0, dec1), tickSpacing, 'ceil')
      onSetUpperTick?.(Math.min(_maxTick, Math.max(raw, tickLower + tickSpacing)))
    }
  }

  function handleCommitMax(priceStr: string) {
    const v = parseFloat(priceStr)
    if (!isFinite(v) || v <= 0) return
    if (!invertPrice) {
      // max price → tickUpper
      const raw = snapTick(priceToTick(v, dec0, dec1), tickSpacing, 'ceil')
      onSetUpperTick?.(Math.min(_maxTick, Math.max(raw, tickLower + tickSpacing)))
    } else {
      // inverted max price corresponds to tickLower
      const raw = snapTick(priceToTick(1 / v, dec0, dec1), tickSpacing, 'floor')
      onSetLowerTick?.(Math.max(_minTick, Math.min(raw, tickUpper - tickSpacing)))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-white">Set Price Range</p>

      {/* Price chart */}
      {poolContractAddr && (
        <V3PriceRangeChart
          poolContractAddr={poolContractAddr}
          minPrice={lowerHuman}
          maxPrice={upperHuman}
          currentPrice={currentHumanPrice ?? 0}
          isFullRange={isFullRange}
          invertPrice={invertPrice}
          sym0={sym0}
          sym1={sym1}
        />
      )}

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
            Custom range — type a price or use +/− to adjust
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
          onSetPrice={handleCommitMin}
        />
        <RangeBoundBox
          label="Max Price"
          displayPrice={maxDisplay}
          unit={priceUnit}
          onDec={() => onAdjustUpper(-1)}
          onInc={() => onAdjustUpper(+1)}
          isFullRange={isFullRange}
          onSetPrice={handleCommitMax}
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

// Calculate token amounts held in a V3 position given current sqrtPriceX96
function calcV3TokenAmounts(
  sqrtPriceX96: bigint, tickLower: number, tickUpper: number, liquidity: bigint
): { amount0: number; amount1: number } {
  if (liquidity === 0n) return { amount0: 0, amount1: 0 }
  const sp = Number(sqrtPriceX96) / 2 ** 96
  const sa = Math.sqrt(Math.pow(1.0001, tickLower))
  const sb = Math.sqrt(Math.pow(1.0001, tickUpper))
  const L  = Number(liquidity)
  if (sp <= sa) return { amount0: L * (sb - sa) / (sa * sb), amount1: 0 }
  if (sp >= sb) return { amount0: 0, amount1: L * (sb - sa) }
  return { amount0: L * (sb - sp) / (sp * sb), amount1: L * (sp - sa) }
}

// ── V3 Position Card (Uniswap V3 + PancakeSwap V3) ───────────────────────────
// Minimal ABI for reading and managing existing V3 positions — same for both NPMs
const V3_NPM_POSITIONS_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'positions', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce',                    type: 'uint96'  },
      { name: 'operator',                 type: 'address' },
      { name: 'token0',                   type: 'address' },
      { name: 'token1',                   type: 'address' },
      { name: 'fee',                      type: 'uint24'  },
      { name: 'tickLower',                type: 'int24'   },
      { name: 'tickUpper',                type: 'int24'   },
      { name: 'liquidity',                type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0',              type: 'uint128' },
      { name: 'tokensOwed1',              type: 'uint128' },
    ] },
  { name: 'decreaseLiquidity', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'params', type: 'tuple', components: [
      { name: 'tokenId',    type: 'uint256' },
      { name: 'liquidity',  type: 'uint128' },
      { name: 'amount0Min', type: 'uint256' },
      { name: 'amount1Min', type: 'uint256' },
      { name: 'deadline',   type: 'uint256' },
    ]}],
    outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }] },
  { name: 'collect', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'params', type: 'tuple', components: [
      { name: 'tokenId',    type: 'uint256' },
      { name: 'recipient',  type: 'address' },
      { name: 'amount0Max', type: 'uint128' },
      { name: 'amount1Max', type: 'uint128' },
    ]}],
    outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }] },
  { name: 'multicall', type: 'function', stateMutability: 'payable',
    inputs:  [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }] },
] as const

function V3PositionCard({ npmAddr, poolToken0, poolToken1, poolFee, sym0, sym1, dec0, dec1, address, sqrtPriceX96, showPanel, onCountChange }: {
  npmAddr: `0x${string}`
  poolToken0: string; poolToken1: string; poolFee: number
  sym0: string; sym1: string; dec0: number; dec1: number
  address: string
  sqrtPriceX96: bigint
  showPanel: boolean
  onCountChange: (n: number) => void
}) {
  // Step 1: how many V3 NFTs this wallet holds
  const { data: nftCount } = useReadContract({
    address: npmAddr, abi: V3_NPM_POSITIONS_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  // Step 2: enumerate tokenIds (cap at 50)
  const idCount = Math.min(Number(nftCount ?? 0n), 50)
  const { data: idResults } = useReadContracts({
    contracts: Array.from({ length: idCount }, (_, i) => ({
      address: npmAddr, abi: V3_NPM_POSITIONS_ABI, functionName: 'tokenOfOwnerByIndex' as const,
      args: [address as `0x${string}`, BigInt(i)] as const,
    })),
    query: { enabled: !!address && idCount > 0 },
  })
  const tokenIds = (idResults ?? []).flatMap(r => r.status === 'success' ? [r.result as bigint] : [])

  // Step 3: fetch position data for each tokenId
  const { data: posResults } = useReadContracts({
    contracts: tokenIds.map(id => ({
      address: npmAddr, abi: V3_NPM_POSITIONS_ABI, functionName: 'positions' as const,
      args: [id] as const,
    })),
    query: { enabled: tokenIds.length > 0 },
  })

  // Filter to positions in this pool (token0 + token1 + fee must match)
  type PosData = readonly [bigint, `0x${string}`, `0x${string}`, `0x${string}`, number, number, number, bigint, bigint, bigint, bigint, bigint]
  const userPositions = (posResults ?? []).flatMap((r, i) => {
    if (r.status !== 'success') return []
    const p = r.result as PosData
    if (p[2].toLowerCase() !== poolToken0.toLowerCase()) return []
    if (p[3].toLowerCase() !== poolToken1.toLowerCase()) return []
    if (p[4] !== poolFee) return []
    return [{ tokenId: tokenIds[i], tickLower: p[5], tickUpper: p[6], liquidity: p[7], tokensOwed0: p[10], tokensOwed1: p[11] }]
  }).filter(pos => pos.liquidity > 0n || pos.tokensOwed0 > 0n || pos.tokensOwed1 > 0n)

  // Notify parent whenever count changes (so parent can show/hide the tab)
  useEffect(() => { onCountChange(userPositions.length) }, [userPositions.length]) // eslint-disable-line

  if (!showPanel || userPositions.length === 0) return null

  return (
    <div className="space-y-3">
      {userPositions.map(pos => (
        <V3PositionItem
          key={pos.tokenId.toString()}
          pos={pos}
          npmAddr={npmAddr}
          sym0={sym0} sym1={sym1} dec0={dec0} dec1={dec1}
          sqrtPriceX96={sqrtPriceX96}
          poolFee={poolFee}
          address={address}
        />
      ))}
    </div>
  )
}

// Each position gets its own hook state — prevents shared tx state bug across multiple positions
type V3Pos = { tokenId: bigint; tickLower: number; tickUpper: number; liquidity: bigint; tokensOwed0: bigint; tokensOwed1: bigint }
function V3PositionItem({ pos, npmAddr, sym0, sym1, dec0, dec1, sqrtPriceX96, poolFee, address }: {
  pos: V3Pos
  npmAddr: `0x${string}`
  sym0: string; sym1: string; dec0: number; dec1: number
  sqrtPriceX96: bigint
  poolFee: number
  address: string
}) {
  const removeWrite  = useWriteContract()
  const removeTx     = useWaitForTransactionReceipt({ hash: removeWrite.data })
  const collectWrite = useWriteContract()
  const collectTx    = useWaitForTransactionReceipt({ hash: collectWrite.data })
  const MAX128 = (2n ** 128n) - 1n

  function handleRemove() {
    if (!address || pos.liquidity === 0n) return
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
    const decData = encodeFunctionData({ abi: V3_NPM_POSITIONS_ABI, functionName: 'decreaseLiquidity',
      args: [{ tokenId: pos.tokenId, liquidity: pos.liquidity, amount0Min: 0n, amount1Min: 0n, deadline }]
    })
    const colData = encodeFunctionData({ abi: V3_NPM_POSITIONS_ABI, functionName: 'collect',
      args: [{ tokenId: pos.tokenId, recipient: address as `0x${string}`, amount0Max: MAX128, amount1Max: MAX128 }]
    })
    removeWrite.writeContract({ address: npmAddr, abi: V3_NPM_POSITIONS_ABI, functionName: 'multicall', args: [[decData, colData]] })
  }

  function handleCollect() {
    if (!address) return
    collectWrite.writeContract({ address: npmAddr, abi: V3_NPM_POSITIONS_ABI, functionName: 'collect',
      args: [{ tokenId: pos.tokenId, recipient: address as `0x${string}`, amount0Max: MAX128, amount1Max: MAX128 }]
    })
  }

  const fees0        = formatUnits(pos.tokensOwed0, dec0)
  const fees1        = formatUnits(pos.tokensOwed1, dec1)
  const hasLiquidity = pos.liquidity > 0n
  const { amount0, amount1 } = sqrtPriceX96 > 0n
    ? calcV3TokenAmounts(sqrtPriceX96, pos.tickLower, pos.tickUpper, pos.liquidity)
    : { amount0: 0, amount1: 0 }
  const posAmt0 = amount0 / Math.pow(10, dec0)
  const posAmt1 = amount1 / Math.pow(10, dec1)
  // hasFees: settled tokensOwed > 0, OR active liquidity (NPM collect() syncs live fees via burn(0))
  const hasFees      = pos.tokensOwed0 > 0n || pos.tokensOwed1 > 0n || hasLiquidity
  const isRemoving   = removeWrite.isPending || removeTx.isLoading
  const isCollecting = collectWrite.isPending || collectTx.isLoading
  const removeHash   = removeWrite.data
  const collectHash  = collectWrite.data
  const removeErr    = removeWrite.error ?? removeTx.error
  const collectErr   = collectWrite.error ?? collectTx.error

  return (
    <div className="bg-[#0a1020] border border-[#1a2535] rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{sym0}/{sym1}</p>
          <p className="text-xs text-slate-500">{(poolFee / 10000).toFixed(poolFee < 1000 ? 3 : 2)}% fee</p>
        </div>
        <span className="text-xs text-slate-500 bg-[#0d1520] border border-[#1a2535] rounded-lg px-2 py-0.5">
          #{pos.tokenId.toString()}
        </span>
      </div>

      {/* Position value */}
      {hasLiquidity && sqrtPriceX96 > 0n && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">{sym0}</p>
            <p className="text-sm font-semibold text-white">
              {posAmt0 < 0.000001 ? '< 0.000001' : posAmt0.toFixed(Math.min(dec0, 6))}
            </p>
          </div>
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">{sym1}</p>
            <p className="text-sm font-semibold text-white">
              {posAmt1 < 0.000001 ? '< 0.000001' : posAmt1.toFixed(Math.min(dec1, 6))}
            </p>
          </div>
        </div>
      )}

      {/* Status row */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
          hasLiquidity
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : 'text-slate-500 bg-slate-500/10 border-slate-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${hasLiquidity ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          {hasLiquidity ? 'Active' : 'Closed'}
        </div>
        {hasFees && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
            Fees pending
          </div>
        )}
      </div>

      {/* Uncollected fees */}
      {(pos.tokensOwed0 > 0n || pos.tokensOwed1 > 0n) ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">{sym0} fees</p>
            <p className="text-sm font-semibold text-white">{Number(fees0).toFixed(Math.min(dec0, 6))}</p>
          </div>
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">{sym1} fees</p>
            <p className="text-sm font-semibold text-white">{Number(fees1).toFixed(Math.min(dec1, 6))}</p>
          </div>
        </div>
      ) : hasLiquidity ? (
        <p className="text-xs text-slate-500 bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
          Live fees synced on collect
        </p>
      ) : null}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleRemove}
          disabled={!hasLiquidity || isRemoving || removeTx.isSuccess}
          className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors
            bg-rose-500/10 border border-rose-500/25 text-rose-400
            hover:bg-rose-500/20 hover:border-rose-500/40
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {removeTx.isSuccess ? '✓ Removed' :
           removeWrite.isPending ? 'Confirm…' :
           removeTx.isLoading ? 'Pending…' :
           'Remove All'}
        </button>
        <button
          onClick={handleCollect}
          disabled={!hasFees || isCollecting || collectTx.isSuccess}
          className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors
            bg-amber-500/10 border border-amber-500/25 text-amber-400
            hover:bg-amber-500/20 hover:border-amber-500/40
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {collectTx.isSuccess ? '✓ Collected' :
           collectWrite.isPending ? 'Confirm…' :
           collectTx.isLoading ? 'Pending…' :
           'Collect Fees'}
        </button>
      </div>

      <p className="text-[10px] text-slate-600">WMON returned for native MON side — not auto-unwrapped</p>

      {(removeHash || collectHash) && (
        <div className="space-y-1">
          {removeHash && (
            <a href={`https://monadexplorer.com/tx/${removeHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              Remove tx: {removeHash.slice(0, 20)}…{removeHash.slice(-8)} ↗
            </a>
          )}
          {collectHash && (
            <a href={`https://monadexplorer.com/tx/${collectHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              Collect tx: {collectHash.slice(0, 20)}…{collectHash.slice(-8)} ↗
            </a>
          )}
        </div>
      )}
      {(removeErr || collectErr) && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 break-words">
          {((removeErr ?? collectErr) as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── V4 Position Card (Uniswap V4) ─────────────────────────────────────────────
// Actions: DECREASE_LIQUIDITY=0x01, TAKE_PAIR=0x11 (verified via v4-periphery Actions.sol)
// Mint uses SETTLE_PAIR=0x0D, SWEEP=0x14 — matches the hardcoded '0x020d14' in encodeV4UnlockData
const V4_PM_READ_ABI = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'getPoolAndPositionInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'key', type: 'tuple', components: [
        { name: 'currency0',   type: 'address' },
        { name: 'currency1',   type: 'address' },
        { name: 'fee',         type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks',       type: 'address' },
      ]},
      { name: 'info', type: 'bytes32' },
    ] },
  { name: 'getPositionLiquidity', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'uint128' }] },
] as const

// Decode V4 PositionInfo bytes32 → ticks
// Layout: [255..56] poolId | [55..32] tickUpper (int24) | [31..8] tickLower (int24) | [7..0] flags
function decodeV4PosInfo(info: `0x${string}`): { tickLower: number; tickUpper: number } {
  const n = BigInt(info)
  const tickUpper = Number(BigInt.asIntN(24, (n >> 32n) & 0xFFFFFFn))
  const tickLower = Number(BigInt.asIntN(24, (n >> 8n) & 0xFFFFFFn))
  return { tickLower, tickUpper }
}

// Compute V4 PoolId = keccak256(ABI-encoded PoolKey) — same as PoolIdLibrary.toId()
function computeV4PoolId(c0: string, c1: string, fee: number, tickSpacing: number, hooks: string): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [c0 as `0x${string}`, c1 as `0x${string}`, fee, tickSpacing, hooks as `0x${string}`],
  ))
}

// Encode V4 modifyLiquidities unlockData for DECREASE + TAKE_PAIR
// liquidity=0 → collect fees only (fee sync happens regardless of liquidity amount)
function encodeV4DecreaseData(
  tokenId: bigint,
  liquidity: bigint,
  currency0: `0x${string}`,
  currency1: `0x${string}`,
  recipient: `0x${string}`,
): `0x${string}` {
  const decreaseParams = encodeAbiParameters(
    [
      { name: 'tokenId',    type: 'uint256' },
      { name: 'liquidity',  type: 'uint128' },
      { name: 'amount0Min', type: 'uint128' },
      { name: 'amount1Min', type: 'uint128' },
      { name: 'hookData',   type: 'bytes'   },
    ],
    [tokenId, liquidity, 0n, 0n, '0x']
  )
  const takePairParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
    [currency0, currency1, recipient]
  )
  // DECREASE_LIQUIDITY=0x01, TAKE_PAIR=0x11
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    ['0x0111', [decreaseParams, takePairParams]]
  )
}

type V4PosItem = { tokenId: bigint; liquidity: bigint; tickLower: number; tickUpper: number }

function V4PositionItem({ pos, currency0, currency1, c0Sym, c1Sym, c0Dec, c1Dec, sqrtPriceX96, address }: {
  pos: V4PosItem
  currency0: `0x${string}`; currency1: `0x${string}`
  c0Sym: string; c1Sym: string
  c0Dec: number; c1Dec: number
  sqrtPriceX96: bigint
  address: string
}) {
  const removeWrite  = useWriteContract()
  const removeTx     = useWaitForTransactionReceipt({ hash: removeWrite.data })
  const collectWrite = useWriteContract()
  const collectTx    = useWaitForTransactionReceipt({ hash: collectWrite.data })
  const pmAddr = UNISWAP_V4_POSITION_MANAGER.address

  function handleRemove() {
    if (!address || pos.liquidity === 0n) return
    const unlockData = encodeV4DecreaseData(pos.tokenId, pos.liquidity, currency0, currency1, address as `0x${string}`)
    removeWrite.writeContract({
      address: pmAddr, abi: UNISWAP_V4_POSITION_MANAGER.abi,
      functionName: 'modifyLiquidities',
      args: [unlockData, BigInt(Math.floor(Date.now() / 1000) + 1200)],
    })
  }

  function handleCollect() {
    if (!address || pos.liquidity === 0n) return
    // liquidity=0 → fee sync only, no liquidity removed
    const unlockData = encodeV4DecreaseData(pos.tokenId, 0n, currency0, currency1, address as `0x${string}`)
    collectWrite.writeContract({
      address: pmAddr, abi: UNISWAP_V4_POSITION_MANAGER.abi,
      functionName: 'modifyLiquidities',
      args: [unlockData, BigInt(Math.floor(Date.now() / 1000) + 1200)],
    })
  }

  const hasLiquidity = pos.liquidity > 0n
  const { amount0, amount1 } = sqrtPriceX96 > 0n
    ? calcV3TokenAmounts(sqrtPriceX96, pos.tickLower, pos.tickUpper, pos.liquidity)
    : { amount0: 0, amount1: 0 }
  const posAmt0 = amount0 / Math.pow(10, c0Dec)
  const posAmt1 = amount1 / Math.pow(10, c1Dec)

  const isRemoving   = removeWrite.isPending || removeTx.isLoading
  const isCollecting = collectWrite.isPending || collectTx.isLoading
  const removeHash   = removeWrite.data
  const collectHash  = collectWrite.data
  const removeErr    = removeWrite.error ?? removeTx.error
  const collectErr   = collectWrite.error ?? collectTx.error

  return (
    <div className="bg-[#0a1020] border border-[#1a2535] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{c0Sym}/{c1Sym}</p>
          <p className="text-xs text-slate-500">Uniswap V4</p>
        </div>
        <span className="text-xs text-slate-500 bg-[#0d1520] border border-[#1a2535] rounded-lg px-2 py-0.5">
          #{pos.tokenId.toString()}
        </span>
      </div>

      {hasLiquidity && sqrtPriceX96 > 0n && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">{c0Sym}</p>
            <p className="text-sm font-semibold text-white">
              {posAmt0 < 0.000001 ? '< 0.000001' : posAmt0.toFixed(Math.min(c0Dec, 6))}
            </p>
          </div>
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">{c1Sym}</p>
            <p className="text-sm font-semibold text-white">
              {posAmt1 < 0.000001 ? '< 0.000001' : posAmt1.toFixed(Math.min(c1Dec, 6))}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
          hasLiquidity
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : 'text-slate-500 bg-slate-500/10 border-slate-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${hasLiquidity ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          {hasLiquidity ? 'Active' : 'Closed'}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleRemove}
          disabled={!hasLiquidity || isRemoving || removeTx.isSuccess}
          className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors
            bg-rose-500/10 border border-rose-500/25 text-rose-400
            hover:bg-rose-500/20 hover:border-rose-500/40
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {removeTx.isSuccess ? '✓ Removed' :
           removeWrite.isPending ? 'Confirm…' :
           removeTx.isLoading ? 'Pending…' :
           'Remove All'}
        </button>
        <button
          onClick={handleCollect}
          disabled={!hasLiquidity || isCollecting || collectTx.isSuccess}
          className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors
            bg-amber-500/10 border border-amber-500/25 text-amber-400
            hover:bg-amber-500/20 hover:border-amber-500/40
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {collectTx.isSuccess ? '✓ Collected' :
           collectWrite.isPending ? 'Confirm…' :
           collectTx.isLoading ? 'Pending…' :
           'Collect Fees'}
        </button>
      </div>

      <p className="text-[10px] text-slate-600">Fees synced via modifyLiquidities(0 liquidity)</p>

      {(removeHash || collectHash) && (
        <div className="space-y-1">
          {removeHash && (
            <a href={`https://monadexplorer.com/tx/${removeHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              Remove tx: {removeHash.slice(0, 20)}…{removeHash.slice(-8)} ↗
            </a>
          )}
          {collectHash && (
            <a href={`https://monadexplorer.com/tx/${collectHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              Collect tx: {collectHash.slice(0, 20)}…{collectHash.slice(-8)} ↗
            </a>
          )}
        </div>
      )}
      {(removeErr || collectErr) && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 break-words">
          {((removeErr ?? collectErr) as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

function V4PositionCard({ poolId, currency0, currency1, c0Sym, c1Sym, c0Dec, c1Dec, address, sqrtPriceX96, showPanel, onCountChange }: {
  poolId: `0x${string}`
  currency0: `0x${string}`; currency1: `0x${string}`
  c0Sym: string; c1Sym: string
  c0Dec: number; c1Dec: number
  address: string
  sqrtPriceX96: bigint
  showPanel: boolean
  onCountChange: (n: number) => void
}) {
  const pmAddr = UNISWAP_V4_POSITION_MANAGER.address

  // Load saved tokenIds from localStorage (positions deposited via Monatrix)
  const [savedIds, setSavedIds] = useState<bigint[]>([])
  useEffect(() => {
    if (address) setSavedIds(loadV4TokenIds(address).map(BigInt))
  }, [address])

  // Step 1: verify current ownership
  const { data: ownerResults } = useReadContracts({
    contracts: savedIds.map(id => ({
      address: pmAddr, abi: V4_PM_READ_ABI, functionName: 'ownerOf' as const, args: [id] as const,
    })),
    query: { enabled: savedIds.length > 0, refetchInterval: 15_000 },
  })
  const ownedIds = savedIds.filter((_, i) => {
    const r = ownerResults?.[i]
    return r?.status === 'success' && (r.result as string).toLowerCase() === address.toLowerCase()
  })

  // Step 2: get pool info + liquidity for owned positions
  const { data: posInfoResults } = useReadContracts({
    contracts: ownedIds.map(id => ({
      address: pmAddr, abi: V4_PM_READ_ABI, functionName: 'getPoolAndPositionInfo' as const, args: [id] as const,
    })),
    query: { enabled: ownedIds.length > 0 },
  })
  const { data: liqResults } = useReadContracts({
    contracts: ownedIds.map(id => ({
      address: pmAddr, abi: V4_PM_READ_ABI, functionName: 'getPositionLiquidity' as const, args: [id] as const,
    })),
    query: { enabled: ownedIds.length > 0 },
  })

  // Step 3: filter to positions in this pool and with liquidity
  const userPositions: V4PosItem[] = []
  ownedIds.forEach((id, i) => {
    const pr = posInfoResults?.[i]
    const lr = liqResults?.[i]
    if (pr?.status !== 'success' || lr?.status !== 'success') return
    const liq = lr.result as bigint
    if (liq === 0n) return
    // wagmi returns outer tuple as array, inner named-component tuple as object
    type PosInfoResult = readonly [
      { currency0: `0x${string}`; currency1: `0x${string}`; fee: number; tickSpacing: number; hooks: `0x${string}` },
      `0x${string}`
    ]
    const [keyObj, infoHex] = pr.result as unknown as PosInfoResult
    const { currency0: c0, currency1: c1, fee: posFeeTier, tickSpacing: posTickSpacing, hooks } = keyObj
    const computed = computeV4PoolId(c0, c1, posFeeTier, posTickSpacing, hooks)
    if (computed.toLowerCase() !== poolId.toLowerCase()) return
    const { tickLower, tickUpper } = decodeV4PosInfo(infoHex)
    userPositions.push({ tokenId: id, liquidity: liq, tickLower, tickUpper })
  })

  useEffect(() => { onCountChange(userPositions.length) }, [userPositions.length]) // eslint-disable-line

  if (!showPanel || userPositions.length === 0) return null

  return (
    <div className="space-y-3">
      {userPositions.map(pos => (
        <V4PositionItem
          key={pos.tokenId.toString()}
          pos={pos}
          currency0={currency0} currency1={currency1}
          c0Sym={c0Sym} c1Sym={c1Sym}
          c0Dec={c0Dec} c1Dec={c1Dec}
          sqrtPriceX96={sqrtPriceX96}
          address={address}
        />
      ))}
    </div>
  )
}

// ── Uniswap V2 Page Flow ──────────────────────────────────────────────────────
function UniswapV2PageFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = UNISWAP_V2_POOLS[pool.id]
  if (!info) return <UniswapV2Flow pool={pool} address={address} />

  const { address: pairAddr, token0, token0Dec, token0Sym, token1, token1Dec, token1Sym } = info

  // Position state
  const [view, setView]       = useState<'deposit' | 'remove'>('deposit')
  const [lpInput, setLpInput] = useState('')

  // On-chain reads
  const { data: reserves }    = useReadContract({ address: pairAddr, abi: UNISWAP_V2_PAIR_ABI, functionName: 'getReserves', query: { refetchInterval: 15_000 } })
  const { data: totalSupply } = useReadContract({ address: pairAddr, abi: UNISWAP_V2_PAIR_ABI, functionName: 'totalSupply', query: { refetchInterval: 15_000 } })
  const { data: lpBalRaw }    = useReadContract({ address: pairAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address as `0x${string}`], query: { enabled: !!address, refetchInterval: 15_000 } })
  const { data: lpAllowRaw }  = useReadContract({ address: pairAddr, abi: ERC20_ABI, functionName: 'allowance', args: [address as `0x${string}`, UNISWAP_V2_ROUTER.address], query: { enabled: !!address } })

  const lpBal  = lpBalRaw   ?? 0n
  const lpSupply = totalSupply ?? 0n
  const reserve0 = reserves?.[0] ?? 0n
  const reserve1 = reserves?.[1] ?? 0n

  const lpBalStr = lpBal > 0n ? formatUnits(lpBal, 18) : '0'
  const hasPosition = lpBal > 0n

  // Reset view when position disappears
  useEffect(() => { if (!hasPosition) setView('deposit') }, [hasPosition])

  // Parsed LP input — capped at balance
  const rawLpInput = lpInput && Number(lpInput) > 0 ? parseUnits(lpInput, 18) : 0n
  const rawLp = rawLpInput > lpBal ? lpBal : rawLpInput

  // Estimated amounts out: token_out = lp_amount * reserve / totalSupply
  const est0 = lpSupply > 0n && rawLp > 0n ? rawLp * reserve0 / lpSupply : 0n
  const est1 = lpSupply > 0n && rawLp > 0n ? rawLp * reserve1 / lpSupply : 0n

  const approved = rawLp > 0n && (lpAllowRaw ?? 0n) >= rawLp

  // Write hooks
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const removeWrite  = useWriteContract()
  const removeTx     = useWaitForTransactionReceipt({ hash: removeWrite.data })

  const isSigning = approveWrite.isPending || removeWrite.isPending
  const isWaiting = approveTx.isLoading    || removeTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = removeTx.isSuccess
  const txHash    = removeWrite.data ?? approveWrite.data
  const error     = approveWrite.error ?? approveTx.error ?? removeWrite.error ?? removeTx.error

  function handleAction() {
    if (!address || rawLp === 0n || isPending) return
    const addr = address as `0x${string}`
    if (!approved) {
      approveWrite.writeContract({ address: pairAddr, abi: ERC20_ABI, functionName: 'approve', args: [UNISWAP_V2_ROUTER.address, rawLp] })
    } else {
      const min0 = est0 * 99n / 100n
      const min1 = est1 * 99n / 100n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      removeWrite.writeContract({
        address: UNISWAP_V2_ROUTER.address,
        abi: UNISWAP_V2_ROUTER.abi,
        functionName: 'removeLiquidity',
        args: [token0, token1, rawLp, min0, min1, addr, deadline],
      })
    }
  }

  const btnLabel = isSuccess  ? '✓ Liquidity Removed'
    : isSigning               ? 'Confirm in wallet…'
    : isWaiting               ? 'Transaction pending…'
    : !approved               ? 'Approve LP Token'
                              : 'Remove Liquidity'

  function setPercent(pct: number) {
    const raw = lpBal * BigInt(pct) / 100n
    setLpInput(formatUnits(raw, 18))
  }

  return (
    <div className="space-y-4">
      {/* Tab bar — only show when user has LP */}
      {hasPosition && (
        <div className="flex gap-1 bg-[#0a1020] border border-[#1a2535] rounded-xl p-1">
          <button
            type="button"
            onClick={() => setView('deposit')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              view === 'deposit'
                ? 'bg-[#0d1a2a] text-white border border-[#2a3a52]'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setView('remove')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              view === 'remove'
                ? 'bg-[#0d1a2a] text-white border border-[#2a3a52]'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Your Position
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${view === 'remove' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#1a2535] text-slate-400'}`}>
              {Number(lpBalStr).toFixed(4)} LP
            </span>
          </button>
        </div>
      )}

      {/* Deposit view */}
      {view === 'deposit' && <UniswapV2Flow pool={pool} address={address} />}

      {/* Remove liquidity view */}
      {view === 'remove' && (
        <div className="space-y-4">
          {/* LP balance */}
          <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Your LP Balance</p>
            <p className="text-lg font-semibold text-white">{Number(lpBalStr).toFixed(6)} LP</p>
            {lpSupply > 0n && lpBal > 0n && (
              <p className="text-xs text-slate-600">
                {((Number(lpBal) / Number(lpSupply)) * 100).toFixed(4)}% of pool
              </p>
            )}
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500">Amount to remove</label>
              <button type="button" onClick={() => setLpInput(lpBalStr)} className="text-[10px] text-[#CC3BFF] hover:text-[#BFA2FF]">MAX</button>
            </div>
            <div className="flex gap-1.5 mb-2">
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPercent(pct)}
                  className="flex-1 py-1 rounded-lg text-xs border border-[#1a2535] text-slate-400 hover:border-[#CC3BFF]/50 hover:text-white transition-all"
                >
                  {pct === 100 ? 'MAX' : `${pct}%`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3">
              <input
                type="text"
                inputMode="decimal"
                value={lpInput}
                onChange={e => setLpInput(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-white text-sm font-semibold outline-none placeholder:text-slate-600"
              />
              <span className="text-xs text-slate-500 shrink-0">LP Token</span>
            </div>
          </div>

          {/* Estimated amounts out */}
          {rawLp > 0n && (
            <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl p-4 space-y-2">
              <p className="text-xs text-slate-500">You will receive (estimated)</p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{token0Sym}</span>
                <span className="text-white font-medium">{Number(formatUnits(est0, token0Dec)).toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{token1Sym}</span>
                <span className="text-white font-medium">{Number(formatUnits(est1, token1Dec)).toFixed(6)}</span>
              </div>
              <p className="text-[10px] text-slate-600">1% slippage applied</p>
            </div>
          )}

          <Steps steps={['Approve LP', 'Remove Liquidity']} current={!approved ? 1 : 2} />

          {approveTx.isSuccess && !approved && (
            <p className="text-center text-xs text-slate-600">LP approved · ready to remove</p>
          )}

          <button
            type="button"
            onClick={handleAction}
            disabled={!address || rawLp === 0n || isPending || isSuccess}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
              isSuccess
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-not-allowed'
                : rawLp === 0n || !address
                  ? 'bg-[#0d1520] border border-[#1a2535] text-slate-600 cursor-not-allowed'
                  : 'bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 hover:border-rose-500/50'
            }`}
          >
            {btnLabel}
          </button>

          {txHash && (
            <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
            </a>
          )}
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </div>
      )}
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
  const [posCount, setPosCount] = useState(0)
  const [view, setView] = useState<'deposit' | 'positions'>('deposit')

  useEffect(() => { if (posCount === 0) setView('deposit') }, [posCount])

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

  function setLowerTick(tick: number) { setCustomTickLower(tick); setCustomTickUpper(tickUpper); setPreset('custom') }
  function setUpperTick(tick: number) { setCustomTickUpper(tick); setCustomTickLower(tickLower); setPreset('custom') }

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
      {/* Tab bar — always at top when wallet has positions in this pool */}
      {posCount > 0 && (
        <div className="flex gap-1 bg-[#0a1020] border border-[#1a2535] rounded-xl p-1">
          <button
            onClick={() => setView('deposit')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition-colors ${
              view === 'deposit' ? 'bg-[#CC3BFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setView('positions')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
              view === 'positions' ? 'bg-[#CC3BFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Your Positions
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              view === 'positions' ? 'bg-white/20 text-white' : 'bg-[#CC3BFF]/20 text-[#CC3BFF]'
            }`}>{posCount}</span>
          </button>
        </div>
      )}

      {/* Always-mounted — runs hooks even when hidden, notifies parent of count */}
      <V3PositionCard
        npmAddr={UNISWAP_V3_NPM.address}
        poolToken0={token0} poolToken1={token1} poolFee={fee}
        sym0={token0Sym} sym1={token1Sym} dec0={token0Dec} dec1={token1Dec}
        address={address ?? ''} sqrtPriceX96={sqrtPriceX96} showPanel={view === 'positions'} onCountChange={setPosCount}
      />

      {/* Deposit view */}
      {view === 'deposit' && <>
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
          <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl p-5">
            <RangeControls
              preset={preset} onPresetClick={handlePresetClick}
              tickLower={tickLower} tickUpper={tickUpper}
              tickSpacing={tickSpacing} isFullRange={isFullRange}
              dec0={token0Dec} dec1={token1Dec} sym0={token0Sym} sym1={token1Sym}
              invertPrice={invertPrice} onToggleInvert={() => setInvertPrice(p => !p)}
              onAdjustLower={adjustLower} onAdjustUpper={adjustUpper}
              onSetLowerTick={setLowerTick} onSetUpperTick={setUpperTick}
              poolContractAddr={poolAddr} currentHumanPrice={humanPrice}
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
      </>}
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
  const [posCount, setPosCount] = useState(0)
  const [view, setView] = useState<'deposit' | 'positions'>('deposit')

  useEffect(() => { if (posCount === 0) setView('deposit') }, [posCount])

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

  function setLowerTick(tick: number) { setCustomTickLower(tick); setCustomTickUpper(tickUpper); setPreset('custom') }
  function setUpperTick(tick: number) { setCustomTickUpper(tick); setCustomTickLower(tickLower); setPreset('custom') }

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
      {/* Tab bar — always at top when wallet has positions in this pool */}
      {posCount > 0 && (
        <div className="flex gap-1 bg-[#0a1020] border border-[#1a2535] rounded-xl p-1">
          <button
            onClick={() => setView('deposit')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition-colors ${
              view === 'deposit' ? 'bg-[#CC3BFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setView('positions')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
              view === 'positions' ? 'bg-[#CC3BFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Your Positions
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              view === 'positions' ? 'bg-white/20 text-white' : 'bg-[#CC3BFF]/20 text-[#CC3BFF]'
            }`}>{posCount}</span>
          </button>
        </div>
      )}

      {/* Always-mounted — runs hooks even when hidden, notifies parent of count */}
      <V3PositionCard
        npmAddr={PANCAKESWAP_V3_NPM.address}
        poolToken0={token0} poolToken1={token1} poolFee={fee}
        sym0={t0Sym} sym1={t1Sym} dec0={t0Dec} dec1={t1Dec}
        address={address ?? ''} sqrtPriceX96={sqrtPriceX96} showPanel={view === 'positions'} onCountChange={setPosCount}
      />

      {/* Deposit view */}
      {view === 'deposit' && <>
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
              onSetLowerTick={setLowerTick} onSetUpperTick={setUpperTick}
              poolContractAddr={poolAddr} currentHumanPrice={humanPrice}
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
      </>}
    </div>
  )
}

// ── Uniswap V4 Page Flow ──────────────────────────────────────────────────────
function UniswapV4PageFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = UNISWAP_V4_POOLS[pool.id]

  const [view, setView]         = useState<'deposit' | 'positions'>('deposit')
  const [posCount, setPosCount] = useState(0)
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

  function setLowerTick(tick: number) { setCustomTickLower(tick); setCustomTickUpper(tickUpper); setPreset('custom') }
  function setUpperTick(tick: number) { setCustomTickUpper(tick); setCustomTickLower(tickLower); setPreset('custom') }

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
      {/* Tab bar — only shown when wallet has tracked positions in this pool */}
      {posCount > 0 && (
        <div className="flex gap-1 bg-[#0a1020] border border-[#1a2535] rounded-xl p-1">
          <button
            onClick={() => setView('deposit')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition-colors ${
              view === 'deposit' ? 'bg-[#CC3BFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setView('positions')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
              view === 'positions' ? 'bg-[#CC3BFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Your Positions
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              view === 'positions' ? 'bg-white/20 text-white' : 'bg-[#CC3BFF]/20 text-[#CC3BFF]'
            }`}>{posCount}</span>
          </button>
        </div>
      )}

      {/* Always-mounted — runs hooks even when hidden, notifies parent of position count */}
      <V4PositionCard
        poolId={poolId as `0x${string}`}
        currency0={currency0 as `0x${string}`} currency1={currency1 as `0x${string}`}
        c0Sym={c0Sym} c1Sym={c1Sym} c0Dec={c0Dec} c1Dec={c1Dec}
        address={address ?? ''} sqrtPriceX96={sqrtPriceX96}
        showPanel={view === 'positions'} onCountChange={setPosCount}
      />

      {/* Deposit view */}
      {view === 'deposit' && <>
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
              onSetLowerTick={setLowerTick} onSetUpperTick={setUpperTick}
              poolContractAddr={poolId} currentHumanPrice={humanPrice}
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
      </>}
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

  const isCurvanceBorrow = pool.type === 'borrowing' && pool.protocol === 'Curvance'

  const curvanceMarket = CURVANCE_BORROW_MARKETS[pool.id]

  // Read outstanding debt for Curvance borrow pools
  const { data: debtRaw } = useReadContract({
    address: curvanceMarket?.loanCToken,
    abi: CURVANCE_BORROW_ABI,
    functionName: 'debtBalance',
    args: [address as `0x${string}`],
    query: { enabled: isCurvanceBorrow && !!address && !!curvanceMarket },
  })
  const hasDebt = isCurvanceBorrow && debtRaw != null && debtRaw > 0n

  return (
    <div className="space-y-4">
      {/* YOUR POSITION — only shown for Curvance borrow pools when debt exists */}
      {hasDebt && curvanceMarket && (
        <div className="bg-[#0d1520] border border-[#1a2535] rounded-2xl px-5 py-4">
          <p className="text-xs text-slate-500 mb-1">Your Position</p>
          <p className="text-sm font-semibold text-rose-400">
            {Number(formatUnits(debtRaw!, curvanceMarket.loanDec)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {curvanceMarket.loanSym} debt
          </p>
        </div>
      )}

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
            <UniswapV2PageFlow pool={lp} address={address} />
          )}
        </div>
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
