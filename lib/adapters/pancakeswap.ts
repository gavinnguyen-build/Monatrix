import type { LPPool } from '@/types'
import { lpRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain } from 'viem'

// ─── Chain ────────────────────────────────────────────────────────────────────
const monadChain = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

// ─── Constants ────────────────────────────────────────────────────────────────
const GECKO_DEX   = 'https://api.geckoterminal.com/api/v2/networks/monad/dexes/pancakeswap-v3-monad/pools'
const GOLDSKY_URL = 'https://api.goldsky.com/api/public/project_cmneec191ntkn01uu7iznhwan/subgraphs/pancake-monad/v1/gn'
const MAX_PAGES = 10
const MIN_TVL   = 1000

const STABLES = new Set(['USDC', 'USDT', 'USDT0', 'AUSD', 'USD1', 'DAI', 'USDS'])

// ─── PATH 1 FIXES ─────────────────────────────────────────────────────────────
// Fix #1: TVL — bỏ balanceOf (gây inflated 5-30% do gồm unclaimed fees + dust).
//         Dùng thẳng reserve_in_usd của GeckoTerminal (đã trừ unclaimed fees).
//         → KHÔNG cần phase 3 balanceOf calls → giảm ~50% RPC.
//
// Fix #2: Protocol fee — Pancake V3 lấy 10-32% LP fee. Trừ ra khi tính APR.
//         feeProtocol nibble: x=0 nghĩa 0%, x>=4 nghĩa 1/x đi vào protocol.
//
// Fix #3: Volume/TVL sanity filter — vol/tvl > 1000 nghĩa pool data noisy
//         (vol thật cao hơn nhiều so với active liquidity). Skip APR cho pool này.
//
// Fix #4: Cap APR ở 200% thay vì 2000% — outlier filter chặt hơn.

const VOL_TVL_RATIO_MAX = 1000  // pools beyond this are noisy, APR unreliable
const APR_CAP = 200             // hard cap, anything above = data issue

// Pools manually blocked (fake TVL, test tokens, or unwanted duplicates)
const BLOCKED_IDS = new Set([
  'pancake-kpl-kpl-2500',
  'pancake-kpl-kpl-10000',
  'pancake-wmon-kpl-2500',
  'pancake-wmon-kpl-10000',
  'pancake-wmon-james_test-2500',
  'pancake-wmon-ape-2500',
  'pancake-wmon-chog-2500',
  'pancake-wmon-gmonad-2500',
])

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const POOL_ABI = [
  { name: 'fee',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] },
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  // Read slot0 to extract feeProtocol nibble for Fix #2
  { name: 'slot0', type: 'function', stateMutability: 'view', inputs: [], outputs: [
    { name: 'sqrtPriceX96', type: 'uint160' },
    { name: 'tick',         type: 'int24'   },
    { name: 'observationIndex',       type: 'uint16' },
    { name: 'observationCardinality', type: 'uint16' },
    { name: 'observationCardinalityNext', type: 'uint16' },
    { name: 'feeProtocol', type: 'uint8' },
    { name: 'unlocked',    type: 'bool'  },
  ] },
] as const

const ERC20_ABI = [
  { name: 'decimals', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol',   type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'string' }] },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeckoPool {
  attributes: {
    address: string
    name: string
    base_token_price_usd: string
    quote_token_price_usd: string
    reserve_in_usd: string
    volume_usd: { h24: string }
  }
  relationships: {
    base_token:  { data: { id: string } }
    quote_token: { data: { id: string } }
  }
}

interface TokenInfo {
  symbol:   string
  decimals: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

function geckoaddrToAddr(id: string): string {
  return id.replace(/^[^_]+_/, '').toLowerCase()
}

/**
 * Apply protocol fee deduction to gross fee APR.
 *
 * Pancake V3 feeProtocol is packed as 4-bit nibbles:
 *   low nibble (bits 0-3) = protocolFee0 nibble
 *   high nibble (bits 4-7) = protocolFee1 nibble
 *
 * Each nibble x means "1/x of LP fee → protocol":
 *   - x=0 → no protocol fee, LP gets 100%
 *   - x=4 → protocol takes 1/4 = 25%, LP gets 75%
 *   - x=10 → protocol takes 1/10 = 10%, LP gets 90%
 *
 * We average the two nibbles (token0 and token1 protocol fees can differ).
 */
function lpFeeShare(feeProtocolPacked: number): number {
  const nib0 = feeProtocolPacked & 0x0f
  const nib1 = (feeProtocolPacked >> 4) & 0x0f
  const share0 = nib0 === 0 ? 1 : (nib0 - 1) / nib0
  const share1 = nib1 === 0 ? 1 : (nib1 - 1) / nib1
  return (share0 + share1) / 2
}

// ─── Goldsky subgraph: fetch 24h fee data ─────────────────────────────────────
// feesToken0/feesToken1 in subgraph = raw token units (BigDecimal from BigInt).
// Both sides of each swap are summed → divide by 2 to get actual LP fees.
// We fetch today + yesterday and pick the day with more txCount per pool.

interface SubgraphDayData {
  feesToken0:    number  // already divided by 10^decimals
  feesToken1:    number
  txCount:       number
}

async function fetchSubgraphFees(): Promise<Map<string, SubgraphDayData>> {
  const todayStart = Math.floor(Date.now() / 1000 / 86400) * 86400
  const yestStart  = todayStart - 86400

  const query = `{
    today: poolDayDatas(first: 1000, where: { date: ${todayStart} }) {
      pool { id token0Decimals token1Decimals }
      feesToken0 feesToken1 txCount
    }
    yesterday: poolDayDatas(first: 1000, where: { date: ${yestStart} }) {
      pool { id token0Decimals token1Decimals }
      feesToken0 feesToken1 txCount
    }
  }`

  try {
    const res = await fetch(GOLDSKY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.errors) throw new Error(JSON.stringify(json.errors))

    type RawDay = {
      pool: { id: string; token0Decimals: number; token1Decimals: number }
      feesToken0: string; feesToken1: string; txCount: string
    }

    const map = new Map<string, SubgraphDayData>()
    const merge = (days: RawDay[]) => {
      for (const d of days) {
        const addr = d.pool.id.toLowerCase()
        const dec0 = Number(d.pool.token0Decimals)
        const dec1 = Number(d.pool.token1Decimals)
        const incoming: SubgraphDayData = {
          feesToken0: parseFloat(d.feesToken0) / Math.pow(10, dec0),
          feesToken1: parseFloat(d.feesToken1) / Math.pow(10, dec1),
          txCount:    Number(d.txCount),
        }
        const existing = map.get(addr)
        if (!existing || incoming.txCount > existing.txCount) map.set(addr, incoming)
      }
    }
    merge(json.data?.yesterday ?? [])
    merge(json.data?.today ?? [])  // today wins if it has more txns

    console.log(`[PancakeSwap] Goldsky: ${map.size} pools with fee data`)
    return map
  } catch (err) {
    console.warn('[PancakeSwap] Goldsky subgraph failed, falling back to GeckoTerminal volume:', err)
    return new Map()
  }
}

// ─── GeckoTerminal: fetch all pages ───────────────────────────────────────────
async function fetchGeckoPages(): Promise<{ pools: GeckoPool[]; tokenMap: Map<string, TokenInfo> }> {
  const pools: GeckoPool[] = []
  const tokenMap = new Map<string, TokenInfo>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    let res: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${GECKO_DEX}?page=${page}`, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 0 },
      })
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10)
        const wait = Math.max(65, retryAfter) * 1000
        console.warn(`[PancakeSwap] GeckoTerminal 429 page ${page} — waiting ${wait / 1000}s (attempt ${attempt + 1})`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      break
    }
    if (!res || !res.ok) {
      if (page === 1) throw new Error(`[PancakeSwap] GeckoTerminal HTTP ${res?.status ?? 'unknown'}`)
      break
    }
    const json = await res.json()
    const batch = (json.data ?? []) as GeckoPool[]
    if (batch.length === 0) break

    pools.push(...batch)

    // Token info from "included" (we only need symbol + decimals now, no price)
    for (const inc of (json.included ?? []) as { id: string; type: string; attributes: { address?: string; symbol?: string; decimals?: number } }[]) {
      if (inc.type === 'token' && inc.attributes?.address) {
        const addr = inc.attributes.address.toLowerCase()
        if (!tokenMap.has(addr)) {
          tokenMap.set(addr, {
            symbol:   inc.attributes.symbol   ?? 'UNKNOWN',
            decimals: inc.attributes.decimals ?? 18,
          })
        }
      }
    }

    if (batch.length < 20) break
    await new Promise(r => setTimeout(r, 3000))
  }

  return { pools, tokenMap }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function fetchPancakeSwapPools(): Promise<LPPool[]> {
  console.log('[PancakeSwap] Discovering all pools via GeckoTerminal...')

  const [{ pools: geckoPools, tokenMap }, subgraphMap] = await Promise.all([
    fetchGeckoPages(),
    fetchSubgraphFees(),
  ])
  console.log(`[PancakeSwap] Discovered ${geckoPools.length} pools`)
  if (geckoPools.length === 0) throw new Error('[PancakeSwap] No pools returned from GeckoTerminal')

  const rpcUrl = process.env.MONAD_RPC_URL ?? 'https://rpc.monad.xyz'
  const client = createPublicClient({ chain: monadChain, transport: http(rpcUrl) })

  const poolAddrs = geckoPools.map(p => p.attributes.address.toLowerCase() as `0x${string}`)

  // ── Phase 1: fee + token0 + token1 + slot0 (for protocol fee nibble) ──────
  // NOTE: Phase 3 balanceOf calls REMOVED (Fix #1)
  const [feeRes, t0Res, t1Res, slotRes] = await Promise.all([
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'fee'    as const })), allowFailure: true }),
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'token0' as const })), allowFailure: true }),
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'token1' as const })), allowFailure: true }),
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'slot0'  as const })), allowFailure: true }),
  ])

  // ── Phase 2: Token symbol/decimals for tokens not in GeckoTerminal data ───
  const unknownAddrs = new Set<string>()
  for (let i = 0; i < poolAddrs.length; i++) {
    const t0 = t0Res[i].status === 'success' ? (t0Res[i].result as string).toLowerCase() : null
    const t1 = t1Res[i].status === 'success' ? (t1Res[i].result as string).toLowerCase() : null
    if (t0 && !tokenMap.has(t0)) unknownAddrs.add(t0)
    if (t1 && !tokenMap.has(t1)) unknownAddrs.add(t1)
  }

  if (unknownAddrs.size > 0) {
    const addrs = [...unknownAddrs] as `0x${string}`[]
    const [symRes, decRes] = await Promise.all([
      client.multicall({ contracts: addrs.map(a => ({ address: a, abi: ERC20_ABI, functionName: 'symbol'   as const })), allowFailure: true }),
      client.multicall({ contracts: addrs.map(a => ({ address: a, abi: ERC20_ABI, functionName: 'decimals' as const })), allowFailure: true }),
    ])
    addrs.forEach((addr, i) => {
      tokenMap.set(addr, {
        symbol:   symRes[i].status === 'success' ? (symRes[i].result as string) : 'UNKNOWN',
        decimals: decRes[i].status === 'success' ? Number(decRes[i].result)     : 18,
      })
    })
  }

  // ── Build result pools ───────────────────────────────────────────────────
  const results: LPPool[] = []
  const now = new Date().toISOString()
  let skippedNoise = 0
  let skippedCapped = 0

  for (let i = 0; i < geckoPools.length; i++) {
    const gp = geckoPools[i]
    const feeTierRaw = feeRes[i].status === 'success' ? Number(feeRes[i].result) : null
    const t0Addr     = t0Res[i].status === 'success'  ? (t0Res[i].result as string).toLowerCase() : null
    const t1Addr     = t1Res[i].status === 'success'  ? (t1Res[i].result as string).toLowerCase() : null

    if (!feeTierRaw || !t0Addr || !t1Addr) continue

    const t0Info = tokenMap.get(t0Addr)
    const t1Info = tokenMap.get(t1Addr)
    const token0 = t0Info?.symbol ?? 'UNKNOWN'
    const token1 = t1Info?.symbol ?? 'UNKNOWN'

    // TVL: GeckoTerminal reserve_in_usd (accurate, excludes unclaimed fees)
    const tvl    = parseFloat(gp.attributes.reserve_in_usd) || 0
    const vol24h = parseFloat(gp.attributes.volume_usd?.h24 ?? '0') || 0

    // APR: prefer Goldsky on-chain fees, fall back to GeckoTerminal volume
    let feeApr = 0
    const poolAddr = gp.attributes.address.toLowerCase()
    const subData  = subgraphMap.get(poolAddr)

    if (subData && subData.txCount > 0 && tvl > 0) {
      // Subgraph counts both sides of every swap → divide by 2 to get actual fees
      const baseAddr     = geckoaddrToAddr(gp.relationships.base_token.data.id)
      const isBaseToken0 = baseAddr === t0Addr
      const price0 = isBaseToken0
        ? parseFloat(gp.attributes.base_token_price_usd)
        : parseFloat(gp.attributes.quote_token_price_usd)
      const price1 = isBaseToken0
        ? parseFloat(gp.attributes.quote_token_price_usd)
        : parseFloat(gp.attributes.base_token_price_usd)

      const feeUsd24h = (subData.feesToken0 * price0 + subData.feesToken1 * price1) / 2
      const raw = (feeUsd24h / tvl) * 365 * 100
      if (raw > APR_CAP) { skippedCapped++ } else { feeApr = raw }
    } else if (tvl > 0 && vol24h > 0 && vol24h / tvl <= VOL_TVL_RATIO_MAX) {
      // Fallback: GeckoTerminal volume + protocol fee deduction
      const feeTier = feeTierRaw / 1_000_000
      let lpShare = 1.0
      if (slotRes[i].status === 'success') {
        const slot0 = slotRes[i].result as readonly [bigint, number, number, number, number, number, boolean]
        lpShare = lpFeeShare(slot0[5])
      }
      const raw = (vol24h * feeTier * lpShare * 365 / tvl) * 100
      if (raw > APR_CAP) { skippedCapped++ } else { feeApr = raw }
    } else if (tvl > 0 && vol24h > 0) {
      skippedNoise++
    }

    // Deterministic ID
    const id = `pancake-${token0.toLowerCase()}-${token1.toLowerCase()}-${feeTierRaw}`

    results.push({
      id,
      protocol:   'PancakeSwap',
      type:       'lp',
      tvl,
      volume_24h: vol24h,
      token0,
      token1,
      fee_tier:   feeTierRaw / 100,  // bps
      fee_apr:    feeApr,
      reward_apr: 0,
      total_apr:  feeApr,
      in_range:   true,
      il_risk:    ilRisk(token0, token1),
      risk_score: lpRisk({ protocol: 'PancakeSwap', token0, token1, tvl, vol24h }),
      updated_at: now,
    })

    console.log(`[PancakeSwap] ${id}: TVL=$${tvl.toFixed(0)}, vol=$${vol24h.toFixed(0)}, APR=${feeApr.toFixed(2)}%`)
  }

  // Filter ghost pools + blocked pools
  const filtered = results.filter(p => p.tvl >= MIN_TVL && !BLOCKED_IDS.has(p.id))
  if (filtered.length === 0) throw new Error('[PancakeSwap] No pools after processing')

  console.log(
    `[PancakeSwap] Returning ${filtered.length} pools ` +
    `(filtered ${results.length - filtered.length} ghost, ` +
    `skipped ${skippedNoise} noisy, ${skippedCapped} APR-capped)`,
  )
  return filtered
}
