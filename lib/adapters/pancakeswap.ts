import type { LPPool } from '@/types'
import { lpRisk } from '@/lib/risk'

// ─── Constants ────────────────────────────────────────────────────────────────

const STABLES = new Set(['USDC', 'USDT', 'USDT0', 'AUSD', 'USD1', 'DAI', 'USDS'])
const MIN_TVL_USD = 10_000
const APR_CAP = 1000

const POOL_LIST_BASE = 'https://explorer.pancakeswap.com/api/cached/pools/list'
const POOL_LIST_PARAMS =
  'orderBy=tvlUSD&protocols=v2&protocols=v3&protocols=stable' +
  '&protocols=infinityBin&protocols=infinityCl&chains=monad&limit=100'
const MERKL_URL =
  'https://api.merkl.xyz/v4/opportunities/' +
  '?chainId=143&test=false&mainProtocolId=pancake-swap&action=POOL,HOLD&status=LIVE&items=100'

const HEADERS = {
  'accept':  '*/*',
  'origin':  'https://pancakeswap.finance',
  'referer': 'https://pancakeswap.finance/',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PancakeToken {
  id: string
  symbol: string
  decimals: number
}

interface PancakeRow {
  id: string          // pool address
  tvlUSD: string
  volumeUSD24h: string
  apr24h: string      // decimal (0.815 = 81.5%)
  feeTier: number
  protocol: string    // 'v2'|'v3'|'stable'|'infinityBin'|'infinityCl'
  token0: PancakeToken
  token1: PancakeToken
}

interface PoolListResponse {
  hasNextPage: boolean
  endCursor: string
  rows: PancakeRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

// ─── API: Pool list (paginated) ───────────────────────────────────────────────

async function fetchAllRows(): Promise<{ rows: PancakeRow[]; pages: number }> {
  const rows: PancakeRow[] = []
  let cursor: string | null = null
  let pages = 0

  while (true) {
    const url = cursor
      ? `${POOL_LIST_BASE}?${POOL_LIST_PARAMS}&after=${encodeURIComponent(cursor)}`
      : `${POOL_LIST_BASE}?${POOL_LIST_PARAMS}`

    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`[PancakeSwap] Pool list HTTP ${res.status}`)

    const json: PoolListResponse = await res.json()
    rows.push(...json.rows)
    pages++

    if (!json.hasNextPage) break
    cursor = json.endCursor
  }

  return { rows, pages }
}

// ─── API: Merkl reward APRs ───────────────────────────────────────────────────

async function fetchMerkl(): Promise<Map<string, number>> {
  try {
    const res = await fetch(MERKL_URL, { headers: HEADERS, next: { revalidate: 0 } })
    if (!res.ok) {
      console.warn(`[PancakeSwap] Merkl HTTP ${res.status} — reward_apr = 0 for all pools`)
      return new Map()
    }
    const list = await res.json() as Array<{ identifier: string; apr: number }>
    const map = new Map<string, number>()
    for (const o of list) map.set(o.identifier.toLowerCase(), o.apr)
    return map
  } catch (err) {
    console.warn('[PancakeSwap] Merkl fetch failed — reward_apr = 0 for all pools:', err)
    return new Map()
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function fetchPancakeSwapPools(): Promise<LPPool[]> {
  console.log('[PancakeSwap] Fetching from PancakeSwap Explorer + Merkl...')

  const [{ rows: allRows, pages }, merklMap] = await Promise.all([
    fetchAllRows(),
    fetchMerkl(),
  ])

  const now = new Date().toISOString()
  const results: LPPool[] = []
  let skippedLowTvl = 0
  let skippedCapped = 0

  for (const row of allRows) {
    const tvl = parseFloat(row.tvlUSD) || 0
    if (tvl < MIN_TVL_USD) { skippedLowTvl++; continue }

    const vol24h   = parseFloat(row.volumeUSD24h) || 0
    const feeApr   = Math.min(parseFloat(row.apr24h) * 100, APR_CAP)  // decimal → %
    const rewardApr = merklMap.get(row.id.toLowerCase()) ?? 0
    const totalApr  = Math.min(feeApr + rewardApr, APR_CAP)

    if (feeApr >= APR_CAP) skippedCapped++

    const t0sym = row.token0.symbol
    const t1sym = row.token1.symbol
    const proto = row.protocol.toLowerCase()

    const id = `pancakeswap-${proto}-${t0sym.toLowerCase()}-${t1sym.toLowerCase()}-${row.feeTier}`
    const feeTierBps = Math.round(row.feeTier / 100)

    const lp: LPPool = {
      id,
      protocol:         'PancakeSwap',
      type:             'lp',
      tvl,
      volume_24h:       vol24h,
      token0:           t0sym,
      token1:           t1sym,
      fee_tier:         feeTierBps,
      fee_apr:          feeApr,
      reward_apr:       rewardApr,
      total_apr:        totalApr,
      in_range:         true,
      il_risk:          ilRisk(t0sym, t1sym),
      risk_score:       lpRisk({ protocol: 'PancakeSwap', token0: t0sym, token1: t1sym, tvl, vol24h }),
      updated_at:       now,
      contract_address: row.id,  // pool contract address from Explorer API
    }

    console.log(
      `[PancakeSwap] ${id}: TVL=$${tvl.toFixed(0)},` +
      ` fee_apr=${feeApr.toFixed(2)}%, reward_apr=${rewardApr.toFixed(2)}%, total=${totalApr.toFixed(2)}%`
    )
    results.push(lp)
  }

  if (results.length === 0) throw new Error('[PancakeSwap] No pools after $10K TVL filter')

  console.log(
    `[PancakeSwap] Fetched ${allRows.length} pools (${pages} pages),` +
    ` ${merklMap.size} Merkl opportunities,` +
    ` after $10K filter: ${results.length} pools` +
    ` (skipped: ${skippedLowTvl} low-TVL, ${skippedCapped} APR-capped)`
  )
  return results
}
