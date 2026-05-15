import { Suspense } from 'react'
import { PoolTable } from '@/components/PoolTable'
import { supabase } from '@/lib/supabase'
import { fromRow } from '@/lib/normalize'
import type { Pool, LPPool, PoolRow } from '@/types'

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

export default async function DiscoverPage() {
  const pools = await getPools()

  // Stats — exclude borrowing to avoid double-counting TVL
  const depositPools = pools.filter(p => p.type !== 'borrowing')
  const totalTvl = depositPools.reduce((s, p) => s + p.tvl, 0)

  // Featured top 3 by APY (non-borrowing only)
  const featured = [...depositPools]
    .sort((a, b) => getApy(b) - getApy(a))
    .slice(0, 3)

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

      {/* ── Featured top pools ─────────────────────────────────────────── */}
      {featured.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {featured.map(pool => {
            const apy = getApy(pool)
            const name = pool.type === 'lp'
              ? `${(pool as LPPool).token0}/${(pool as LPPool).token1}`
              : (pool as { asset: string }).asset
            const typeLabel = pool.type === 'liquid_staking' ? 'LIQUID STAKING'
              : pool.type.toUpperCase()

            return (
              <div
                key={pool.id}
                className="group relative bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--border-hover)] transition-all cursor-pointer overflow-hidden"
              >
                {/* subtle glow on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-[#CC3BFF]/6 to-transparent pointer-events-none rounded-2xl" />

                {/* Top row: avatar + name + TVL */}
                <div className="flex items-center gap-2.5 mb-4">
                  <ProtocolAvatar protocol={pool.protocol} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{name}</p>
                    <p className="text-xs text-slate-500">{pool.protocol}</p>
                  </div>
                  <span className="ml-auto shrink-0 px-2 py-0.5 bg-[var(--border)] text-slate-500 text-xs rounded-full font-medium">
                    {fmtTvl(pool.tvl)} TVL
                  </span>
                </div>

                {/* APY + arrow */}
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-emerald-400 leading-none">
                      {apy.toFixed(2)}%
                    </span>
                    <span className="text-xs text-slate-500 pb-0.5">APY</span>
                  </div>
                  <span className="text-slate-500 group-hover:text-slate-300 text-xl transition-colors">→</span>
                </div>

                {/* type label */}
                <p className="mt-3 text-xs text-slate-500 font-medium">{typeLabel}</p>
              </div>
            )
          })}
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
