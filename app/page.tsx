import { Suspense } from 'react'
import { PoolTable } from '@/components/PoolTable'
import { supabase } from '@/lib/supabase'
import { fromRow } from '@/lib/normalize'
import type { Pool, LPPool, PoolRow } from '@/types'

// Force server-render on every request so cron data updates are visible immediately
export const dynamic = 'force-dynamic'

async function getPools(): Promise<Pool[]> {
  try {
    const { data, error } = await supabase
      .from('pools')
      .select('*')
      .order('tvl', { ascending: false })
    if (error) { console.error('[Page] Supabase error:', error); return [] }
    return (data as PoolRow[]).map(fromRow)
  } catch (e) {
    console.error('[Page] getPools failed:', e)
    return []
  }
}

function getApy(p: Pool): number {
  if (p.type === 'lp') return (p as LPPool).total_apr
  return (p as { apy: number }).apy
}

function fmtTvl(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

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

function ProtocolAvatar({ protocol }: { protocol: string }) {
  const bg = PROTOCOL_COLORS[protocol] ?? 'bg-slate-600'
  const initials = protocol.slice(0, 2).toUpperCase()
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white ${bg} shrink-0`}>
      {initials}
    </span>
  )
}

const TOKEN_LOGOS: Record<string, string> = {
  MON:       '/logos/tokens/MON.jpg',
  USDC:      '/logos/tokens/USDC.png',
  AUSD:      '/logos/tokens/AUSD.jpg',
  WBTC:      '/logos/tokens/WBTC.png',
  WETH:      '/logos/tokens/WETH.png',
  WMON:      '/logos/tokens/wmon.png',
  DUST:      '/logos/tokens/DUST.jpg',
  USDT0:     '/logos/tokens/USDT0.jpg',
  GMON:      '/logos/tokens/gMON.png',
  SHMON:     '/logos/tokens/shMON.png',
  SMON:      '/logos/tokens/sMON.webp',
  APRMON:    '/logos/tokens/aprMon.png',
  CBBTC:     '/logos/tokens/cbBTC.png',
  WEETH:     '/logos/tokens/weETH.png',
  LVMON:     '/logos/tokens/LVMON.png',
  LV:        '/logos/tokens/LV.png',
  USD1:      '/logos/tokens/USD1.png',
  XAUT0:     '/logos/tokens/XAUT0.png',
  ALLOCA:    '/logos/tokens/ALLOCA.jpg',
  CAKE:      '/logos/tokens/CAKE.jpg',
  EARAUSD:   '/logos/tokens/earnAUSD.png',
  EARNAUESD: '/logos/tokens/earnAUSD.png',
  SAVUSD:    '/logos/tokens/savusd.svg',
  EBTC:      '/logos/tokens/ebtc.svg',
  EZETH:     '/logos/tokens/ezeth.svg',
  WSETH:     '/logos/tokens/wsETH.jpg',
  LOAZND:    '/logos/tokens/loAZND.webp',
  SAUSD:     '/logos/tokens/sausd.svg',
  SYZUSD:    '/logos/tokens/syzusd.svg',
  VUSD:      '/logos/tokens/vusd.svg',
  MUBOND:    '/logos/tokens/mubond.svg',
  WSRUSD:    '/logos/tokens/wsrusd.svg',
  YZM:       '/logos/tokens/yzm.svg',
  // New tokens
  ANAGO:     '/logos/tokens/Anago.png',
  APE:       '/logos/tokens/APE.png',
  BOB:       '/logos/tokens/BOB.jpg',
  CHOG:      '/logos/tokens/CHOG.png',
  DAK:       '/logos/tokens/DAK.png',
  EARN:      '/logos/tokens/EARN.png',
  EURW:      '/logos/tokens/EURW.png',
  GMONAD:    '/logos/tokens/GMONAD.avif',
  IGN:       '/logos/tokens/IGN.jpg',
  MONIKA:    '/logos/tokens/MONIKA.png',
  NAD:       '/logos/tokens/NAD.jpg',
  NADS:      '/logos/tokens/NAD.jpg',
  WNSHMON:   '/logos/tokens/wnSHMON.png',
  WNUSDC:    '/logos/tokens/wnUSDC.png',
  WNWMON:    '/logos/tokens/wnWMON.png',
}

function TokenLogo({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const src = TOKEN_LOGOS[key]
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={symbol} width={size} height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-300 shrink-0"
      style={{ width: size, height: size }}>
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  )
}

function TokenPairLogos({ t0, t1 }: { t0: string; t1: string }) {
  return (
    <div className="relative shrink-0" style={{ width: 40, height: 28 }}>
      <div className="absolute left-0 top-0"><TokenLogo symbol={t0} size={26} /></div>
      <div className="absolute left-[14px] top-0 ring-2 ring-[var(--card)] rounded-full"><TokenLogo symbol={t1} size={26} /></div>
    </div>
  )
}

export default async function DiscoverPage() {
  const pools = await getPools()

  // Stats — exclude borrowing to avoid double-counting TVL
  const depositPools = pools.filter(p => p.type !== 'borrowing')
  const totalTvl = depositPools.reduce((s, p) => s + p.tvl, 0)

  // Top 3 per category by APY
  const topLP = [...pools.filter(p => p.type === 'lp')]
    .sort((a, b) => getApy(b) - getApy(a)).slice(0, 3)
  const topLST = [...pools.filter(p => p.type === 'liquid_staking')]
    .sort((a, b) => getApy(b) - getApy(a)).slice(0, 3)
  const topLending = [...pools.filter(p => p.type === 'lending')]
    .sort((a, b) => getApy(b) - getApy(a)).slice(0, 3)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Discover</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Explore every yield opportunity across Monad DeFi in one place.
          </p>
        </div>

        {pools.length > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Market Size</p>
              <p className="text-base font-semibold text-white">
                {totalTvl >= 1_000_000
                  ? `$${(totalTvl / 1_000_000).toFixed(2)}M`
                  : `$${totalTvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
              </p>
            </div>
            <div className="px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Pools</p>
              <p className="text-base font-semibold text-white">{pools.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Top pools by category ──────────────────────────────────────── */}
      {pools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {([
            { title: 'Top Liquidity Provision', pools: topLP },
            { title: 'Top Liquid Staking',      pools: topLST },
            { title: 'Top Lending & Borrowing', pools: topLending },
          ] as const).map(({ title, pools: catPools }) => (
            <div key={title} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 flex flex-col">
              {/* Title */}
              <p className="text-base font-bold text-white mb-4">{title}</p>
              {/* Divider */}
              <div className="border-t border-[var(--border)] mb-4" />
              {/* Pool rows */}
              <div className="flex flex-col gap-3">
                {catPools.map(pool => {
                  const apy  = getApy(pool)
                  const isLP = pool.type === 'lp'
                  const t0   = isLP ? (pool as LPPool).token0 : (pool as { asset: string }).asset
                  const t1   = isLP ? (pool as LPPool).token1 : ''
                  const name = isLP ? `${t0}/${t1}` : t0
                  return (
                    <div key={pool.id} className="flex items-center gap-3">
                      {isLP
                        ? <TokenPairLogos t0={t0} t1={t1} />
                        : <TokenLogo symbol={t0} size={28} />
                      }
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{name}</p>
                        <p className="text-xs text-slate-500">{pool.protocol}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-emerald-400">
                        {apy.toFixed(2)}%
                      </span>
                    </div>
                  )
                })}
                {catPools.length === 0 && (
                  <p className="text-xs text-slate-600 italic">No data</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pool table ─────────────────────────────────────────────────── */}
      {pools.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg mb-2">No pools loaded yet.</p>
          <p className="text-sm">
            Trigger{' '}
            <code className="bg-[var(--card)] px-1.5 py-0.5 rounded text-slate-300">GET /api/cron</code>{' '}
            with header{' '}
            <code className="bg-[var(--card)] px-1.5 py-0.5 rounded text-slate-300">x-cron-secret</code>{' '}
            to populate data.
          </p>
        </div>
      ) : (
        <Suspense><PoolTable pools={pools} /></Suspense>
      )}
    </div>
  )
}
