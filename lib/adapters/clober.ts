import type { LPPool } from '@/types'
import { lpRisk } from '@/lib/risk'

const GOLDSKY_URL =
  'https://api.goldsky.com/api/public/project_clsljw95chutg01w45cio46j0/subgraphs/v2-subgraph-monad/latest/gn'

// DefiLlama pool UUIDs — APY matches Clober UI (30-day rolling avg)
const DEFILLAMA_POOL_IDS: Record<string, string> = {
  'clober-usdc-mon': '286a2273-6f50-4de1-8ba2-2ba846515066',
}

const STABLES = new Set(['USDC', 'USDT', 'AUSD', 'USD1', 'DAI'])

function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

// Clober CLV fee rate: 0.1% per trade (confirmed from UI reverse-engineering)
// APY formula: rolling 7-day volume sum / 7 days / TVL × 365 × fee_rate × 100
// Uses hourly buckets to avoid day-boundary snapshot artifacts.
const CLV_FEE_RATE = 0.001

const QUERY = `{
  pools(first: 20, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id
    tokenA { symbol }
    tokenB { symbol }
    totalValueLockedUSD
    poolHourData(first: 168, orderBy: date, orderDirection: desc) {
      date
      volumeUSD
    }
  }
}`

interface SubgraphPool {
  id: string
  tokenA: { symbol: string }
  tokenB: { symbol: string }
  totalValueLockedUSD: string
  poolHourData: Array<{
    date: number
    volumeUSD: string
  }>
}

// True rolling 24h volume: sum the last 24 hourly buckets
function calcVol24h(hourData: SubgraphPool['poolHourData']): number {
  const cutoff = Math.floor(Date.now() / 1000) - 86400
  return hourData
    .filter(h => h.date >= cutoff)
    .reduce((sum, h) => sum + parseFloat(h.volumeUSD), 0)
}

// APY from 7-day rolling hourly volume × fee_rate / currentTVL × 365 × 100
// Hourly granularity avoids day-boundary snapshot artifacts.
// Only use data if there is recent activity (latest bucket within last 2 days).
function calcApy(hourData: SubgraphPool['poolHourData'], currentTvl: number): number {
  if (hourData.length === 0 || currentTvl === 0) return 0

  const nowSec = Math.floor(Date.now() / 1000)
  const twoDaysAgo = nowSec - 2 * 86400

  // Latest entry — already ordered desc by date
  if (hourData[0].date < twoDaysAgo) {
    return 0  // pool inactive
  }

  // 7-day rolling window
  const cutoff7d = nowSec - 7 * 86400
  const last7d = hourData.filter(h => h.date >= cutoff7d)
  if (last7d.length === 0) return 0

  const total7dVol = last7d.reduce((sum, h) => sum + parseFloat(h.volumeUSD), 0)
  const avgDailyVol = total7dVol / 7

  const apy = (avgDailyVol * CLV_FEE_RATE / currentTvl) * 365 * 100
  // Cap at 500% to filter outliers
  return apy > 500 ? 0 : apy
}

export async function fetchCloberPools(): Promise<LPPool[]> {
  console.log('[Clober] Fetching from Goldsky subgraph + DefiLlama...')

  // Parallel: subgraph (TVL + volume) + DefiLlama (APY)
  const [subgraphRes, llamaRes] = await Promise.all([
    fetch(GOLDSKY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
      next: { revalidate: 0 },
    }),
    fetch('https://yields.llama.fi/pools')
      .then(r => r.json()) as Promise<{ data: { pool: string; apy: number; tvlUsd: number }[] }>,
  ])

  if (!subgraphRes.ok) {
    throw new Error(`[Clober] Subgraph HTTP error: ${subgraphRes.status}`)
  }

  const json = await subgraphRes.json()

  if (json.errors) {
    throw new Error(`[Clober] Subgraph errors: ${JSON.stringify(json.errors)}`)
  }

  const subgraphPools: SubgraphPool[] = json.data?.pools ?? []
  console.log(`[Clober] Got ${subgraphPools.length} pools from subgraph`)

  // Index DefiLlama pools by our pool ID for fast lookup
  const llamaByPoolId = new Map(
    Object.entries(DEFILLAMA_POOL_IDS).map(([ourId, llamaId]) => {
      const llamaPool = llamaRes.data.find(p => p.pool === llamaId)
      return [ourId, llamaPool]
    })
  )

  const now = new Date().toISOString()
  const results: LPPool[] = []

  for (const p of subgraphPools) {
    const tvl = Number(p.totalValueLockedUSD)

    // Skip pools with TVL < $10,000
    if (tvl < 10_000) {
      console.log(`[Clober] Skipping ${p.tokenA.symbol}/${p.tokenB.symbol} — TVL $${tvl} < $10000`)
      continue
    }

    const token0 = p.tokenA.symbol
    const token1 = p.tokenB.symbol
    const id = `clober-${token0.toLowerCase()}-${token1.toLowerCase()}`
    const vol24h = calcVol24h(p.poolHourData)

    // Use DefiLlama APY if available (matches Clober UI 30d rolling avg), else fall back to formula
    const llamaPool = llamaByPoolId.get(id)
    const feeApr = llamaPool ? llamaPool.apy : calcApy(p.poolHourData, tvl)

    const pool: LPPool = {
      id,
      protocol:         'Clober',
      type:             'lp',
      tvl,
      volume_24h:       vol24h,
      token0,
      token1,
      fee_tier:         10, // 0.1% = 10 bps
      fee_apr:          feeApr,
      reward_apr:       0,
      total_apr:        feeApr,
      in_range:         true,
      il_risk:          ilRisk(token0, token1),
      risk_score:       lpRisk({ protocol: 'Clober', token0, token1, tvl, vol24h }),
      updated_at:       now,
      contract_address: id,  // CLOB protocol, no pool contract — use slug
    }

    const src = llamaPool ? 'DefiLlama' : 'formula'
    console.log(`[Clober] ${id}: TVL=$${tvl.toFixed(0)}, APY=${feeApr.toFixed(2)}% (${src})`)
    results.push(pool)
  }

  console.log(`[Clober] Returning ${results.length} pools`)
  return results
}
