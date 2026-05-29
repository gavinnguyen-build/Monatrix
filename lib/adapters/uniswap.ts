import type { LPPool } from '@/types'
import { lpRisk } from '@/lib/risk'

// ─── Constants ────────────────────────────────────────────────────────────────

const STABLES = new Set(['USDC', 'USDT', 'AUSD', 'USD1', 'DAI', 'USDT0', 'USDS'])
const MON_NATIVE = new Set(['MON', 'WMON'])
// USDC and AUSD are the primary quote currencies — they always go on the right side
const BASE_QUOTES = new Set(['USDC', 'AUSD'])
const V2_FEE_TIER = 3000  // V2 charges 0.30% but API returns feeTier=0
const DYNAMIC_FEE_FLAG = 8388608   // 2^23 — V4 dynamic fee, skip APR calc
const MIN_TVL_USD = 10_000
const APR_CAP = 1000
const VOL_TVL_RATIO_MAX = 1000
const ZERO_HOOKS = '0x0000000000000000000000000000000000000000'

const EXPLORE_STATS_URL =
  'https://interface.gateway.uniswap.org/v2/uniswap.explore.v1.ExploreStatsService/ExploreStats' +
  '?connect=v1&encoding=json&message=%7B%22chainId%22%3A%22143%22%2C%22multichain%22%3Atrue%7D'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExploreToken {
  address: string
  symbol: string
  decimals: number
  name: string
  price?: { value: number }
}

interface ExplorePool {
  id: string
  totalLiquidity?: { value: number }
  volume1Day?: { value: number }
  feeTier: number
  token0: ExploreToken
  token1: ExploreToken
  protocolVersion: string
  hook?: string | { address: string }
}

interface ExploreStatsResponse {
  stats?: {
    poolStatsV2?: ExplorePool[]
    poolStatsV3?: ExplorePool[]
    poolStatsV4?: ExplorePool[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

function buildPoolId(
  version: 'v2' | 'v3' | 'v4',
  t0sym: string,
  t1sym: string,
  feeTier: number,
  hook?: string | { address: string },
): string {
  const t0 = t0sym.toLowerCase()
  const t1 = t1sym.toLowerCase()
  if (version === 'v2') return `uniswap-v2-${t0}-${t1}`
  const feePart = feeTier === DYNAMIC_FEE_FLAG ? 'dynamic' : String(feeTier)
  if (version === 'v4') {
    const hookAddr = typeof hook === 'object' ? hook?.address : hook
    const hookShort = (!hookAddr || hookAddr.toLowerCase() === ZERO_HOOKS)
      ? 'nohook'
      : hookAddr.slice(2, 8).toLowerCase()
    return `uniswap-v4-${t0}-${t1}-${feePart}-${hookShort}`
  }
  return `uniswap-v3-${t0}-${t1}-${feePart}`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function fetchUniswapPools(): Promise<LPPool[]> {
  console.log('[Uniswap] Fetching from ExploreStats API...')

  const res = await fetch(EXPLORE_STATS_URL, {
    headers: {
      'accept': '*/*',
      'origin': 'https://app.uniswap.org',
      'referer': 'https://app.uniswap.org/',
      'x-request-source': 'uniswap-web',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`[Uniswap] ExploreStats HTTP ${res.status}`)

  const json: ExploreStatsResponse = await res.json()
  const stats = json.stats
  if (!stats) throw new Error('[Uniswap] ExploreStats: empty response — no "stats" field')

  const v2Pools = stats.poolStatsV2 ?? []
  const v3Pools = stats.poolStatsV3 ?? []
  const v4Pools = stats.poolStatsV4 ?? []
  const totalFetched = v2Pools.length + v3Pools.length + v4Pools.length

  console.log(`[Uniswap] V2=${v2Pools.length} V3=${v3Pools.length} V4=${v4Pools.length}, total fetched=${totalFetched}`)

  const now = new Date().toISOString()
  const results: LPPool[] = []
  let skippedLowTvl = 0
  let skippedNoise = 0
  let skippedCapped = 0

  const allPools: Array<ExplorePool & { version: 'v2' | 'v3' | 'v4' }> = [
    ...v2Pools.map(p => ({ ...p, version: 'v2' as const })),
    ...v3Pools.map(p => ({ ...p, version: 'v3' as const })),
    ...v4Pools.map(p => ({ ...p, version: 'v4' as const })),
  ]

  for (const pool of allPools) {
    const tvl = pool.totalLiquidity?.value ?? 0
    const vol24h = pool.volume1Day?.value ?? 0
    const feeTier = pool.feeTier ?? 0
    const t0sym = pool.token0.symbol
    const t1sym = pool.token1.symbol

    if (tvl < MIN_TVL_USD) { skippedLowTvl++; continue }

    // V2 pools have feeTier=0 in the API but always charge 0.30%
    const effectiveFeeTier = (pool.version === 'v2' && feeTier === 0) ? V2_FEE_TIER : feeTier

    let feeApr = 0
    if (effectiveFeeTier !== DYNAMIC_FEE_FLAG && tvl > 0 && vol24h > 0) {
      const feeRate = effectiveFeeTier / 1_000_000
      if (vol24h / tvl > VOL_TVL_RATIO_MAX) {
        skippedNoise++
      } else {
        const raw = (vol24h * feeRate * 365 / tvl) * 100
        feeApr = raw > APR_CAP ? (skippedCapped++, 0) : raw
      }
    }

    const poolId = buildPoolId(pool.version, t0sym, t1sym, feeTier, pool.hook)
    const feeTierBps = effectiveFeeTier === DYNAMIC_FEE_FLAG ? 0 : Math.round(effectiveFeeTier / 100)

    // Display order: non-quote token first
    //   1. altcoin before MON/WMON (e.g. CHOG/MON not MON/CHOG)
    //   2. non-USDC/AUSD before USDC/AUSD (e.g. CBBTC/USDC not USDC/CBBTC)
    const t0up = t0sym.toUpperCase()
    const t1up = t1sym.toUpperCase()
    const swapDisplay =
      (MON_NATIVE.has(t0up) && !MON_NATIVE.has(t1up) && !STABLES.has(t1up)) ||
      (BASE_QUOTES.has(t0up) && !BASE_QUOTES.has(t1up))
    const rawT0 = swapDisplay ? t1sym : t0sym
    const rawT1 = swapDisplay ? t0sym : t1sym
    // Render WMON as MON in display (Uniswap UI does the same)
    const displayT0 = rawT0.toUpperCase() === 'WMON' ? 'MON' : rawT0
    const displayT1 = rawT1.toUpperCase() === 'WMON' ? 'MON' : rawT1

    const lp: LPPool = {
      id:               poolId,
      protocol:         'Uniswap',
      type:             'lp',
      tvl,
      volume_24h:       vol24h,
      token0:           displayT0,
      token1:           displayT1,
      fee_tier:         feeTierBps,
      fee_apr:          feeApr,
      reward_apr:       0,
      total_apr:        feeApr,
      in_range:         true,
      il_risk:          ilRisk(t0sym, t1sym),
      risk_score:       lpRisk({ protocol: 'Uniswap', token0: t0sym, token1: t1sym, tvl, vol24h }),
      updated_at:       now,
      contract_address: pool.id,  // pool contract address (V3) or poolId bytes32 (V4)
    }

    console.log(`[Uniswap] ${poolId}: TVL=$${tvl.toFixed(0)}, vol24h=$${vol24h.toFixed(0)}, APR=${feeApr.toFixed(2)}%`)
    results.push(lp)
  }

  if (results.length === 0) throw new Error('[Uniswap] No pools after filtering — check ExploreStats response')

  console.log(
    `[Uniswap] Returning ${results.length} pools after $${MIN_TVL_USD.toLocaleString()} TVL filter` +
    ` (skipped: ${skippedLowTvl} low-TVL, ${skippedNoise} noisy, ${skippedCapped} APR-capped)`,
  )
  return results
}
