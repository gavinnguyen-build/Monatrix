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
// Discover ALL PancakeSwap pools on Monad via GeckoTerminal dex endpoints
const GECKO_DEX_V3 = 'https://api.geckoterminal.com/api/v2/networks/monad/dexes/pancakeswap-v3-monad/pools'
const GECKO_DEX_V2 = 'https://api.geckoterminal.com/api/v2/networks/monad/dexes/pancakeswap-v2-monad/pools'
const GECKO_DEX = GECKO_DEX_V3  // kept for backward-compat with fetchGeckoPages
const MAX_PAGES = 15  // safety cap (~300 V3 pools max)

// PancakeSwap V2 fixed fee: 0.25% = 2500 ppm (stored as 25 bps in DB)
const V2_FEE_PPM = 2500

const STABLES = new Set(['USDC', 'USDT', 'USDT0', 'AUSD', 'USD1', 'DAI', 'USDS'])

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const POOL_ABI = [
  { name: 'fee',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] },
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals',  type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol',    type: 'function', stateMutability: 'view',
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
  priceUsd: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

// Extract token address from GeckoTerminal relationship id ("monad_0x..." → "0x...")
function geckoaddrToAddr(id: string): string {
  return id.replace(/^[^_]+_/, '').toLowerCase()
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
        const wait = Math.max(65, retryAfter) * 1000  // GeckoTerminal sends Retry-After: 0; enforce 65s minimum
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

    // Build token info from included (symbol + decimals)
    for (const inc of (json.included ?? []) as { id: string; type: string; attributes: { address?: string; symbol?: string; decimals?: number } }[]) {
      if (inc.type === 'token' && inc.attributes?.address) {
        const addr = inc.attributes.address.toLowerCase()
        if (!tokenMap.has(addr)) {
          tokenMap.set(addr, {
            symbol:   inc.attributes.symbol   ?? 'UNKNOWN',
            decimals: inc.attributes.decimals ?? 18,
            priceUsd: 0,
          })
        }
      }
    }

    // Fill prices from pool attributes
    for (const pool of batch) {
      const base  = geckoaddrToAddr(pool.relationships.base_token.data.id)
      const quote = geckoaddrToAddr(pool.relationships.quote_token.data.id)
      const bp = parseFloat(pool.attributes.base_token_price_usd)  || 0
      const qp = parseFloat(pool.attributes.quote_token_price_usd) || 0
      if (bp > 0) { const t = tokenMap.get(base);  if (t && t.priceUsd === 0) t.priceUsd = bp }
      if (qp > 0) { const t = tokenMap.get(quote); if (t && t.priceUsd === 0) t.priceUsd = qp }
    }

    if (batch.length < 20) break  // last page

    // Space out pages to avoid GeckoTerminal burst rate limit (5 req per ~30s)
    await new Promise(r => setTimeout(r, 3000))
  }

  return { pools, tokenMap }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function fetchPancakeSwapPools(): Promise<LPPool[]> {
  console.log('[PancakeSwap] Discovering all pools via GeckoTerminal...')

  const { pools: geckoPools, tokenMap } = await fetchGeckoPages()
  console.log(`[PancakeSwap] Discovered ${geckoPools.length} pools`)
  if (geckoPools.length === 0) throw new Error('[PancakeSwap] No pools returned from GeckoTerminal')

  const rpcUrl = process.env.MONAD_RPC_URL ?? 'https://rpc.monad.xyz'
  const client = createPublicClient({ chain: monadChain, transport: http(rpcUrl) })

  const poolAddrs = geckoPools.map(p => p.attributes.address.toLowerCase() as `0x${string}`)

  // ── Phase 1: fee(), token0(), token1() for all pools via multicall ─────────
  const [feeRes, t0Res, t1Res] = await Promise.all([
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'fee'    as const })), allowFailure: true }),
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'token0' as const })), allowFailure: true }),
    client.multicall({ contracts: poolAddrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'token1' as const })), allowFailure: true }),
  ])

  // ── Phase 2: Fetch symbol/decimals for tokens not in GeckoTerminal data ────
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
        priceUsd: 0,
      })
    })
  }

  // ── Phase 3: on-chain token balances for accurate TVL ────────────────────
  // Build per-pool token address pairs (only for pools where phase 1 succeeded)
  type PoolTokens = { t0: `0x${string}`; t1: `0x${string}` }
  const poolTokens: (PoolTokens | null)[] = poolAddrs.map((_, i) => {
    const t0 = t0Res[i].status === 'success' ? (t0Res[i].result as `0x${string}`) : null
    const t1 = t1Res[i].status === 'success' ? (t1Res[i].result as `0x${string}`) : null
    return t0 && t1 ? { t0, t1 } : null
  })

  const validIdxs = poolTokens.map((t, i) => t ? i : -1).filter(i => i >= 0)
  const balContracts = validIdxs.flatMap(i => [
    { address: poolTokens[i]!.t0.toLowerCase() as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [poolAddrs[i]] },
    { address: poolTokens[i]!.t1.toLowerCase() as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [poolAddrs[i]] },
  ])

  const balRes = await client.multicall({ contracts: balContracts, allowFailure: true })

  // Map: pool index → { bal0, bal1 }
  const balMap = new Map<number, { bal0: bigint; bal1: bigint }>()
  validIdxs.forEach((poolIdx, j) => {
    const r0 = balRes[j * 2]
    const r1 = balRes[j * 2 + 1]
    if (r0?.status === 'success' && r1?.status === 'success') {
      balMap.set(poolIdx, { bal0: r0.result as bigint, bal1: r1.result as bigint })
    }
  })

  // ── Build result pools ───────────────────────────────────────────────────
  const results: LPPool[] = []
  const now = new Date().toISOString()

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

    // TVL: on-chain balances × prices (fallback to GeckoTerminal reserve_in_usd)
    let tvl = 0
    const bals = balMap.get(i)
    if (bals && t0Info && t1Info) {
      const v0 = t0Info.priceUsd > 0 ? (Number(bals.bal0) / 10 ** t0Info.decimals) * t0Info.priceUsd : 0
      const v1 = t1Info.priceUsd > 0 ? (Number(bals.bal1) / 10 ** t1Info.decimals) * t1Info.priceUsd : 0
      tvl = v0 + v1
    }
    if (tvl === 0) tvl = parseFloat(gp.attributes.reserve_in_usd) || 0

    const vol24h  = parseFloat(gp.attributes.volume_usd?.h24 ?? '0') || 0
    const feeTier = feeTierRaw / 1_000_000  // fraction e.g. 500/1e6 = 0.0005

    let feeApr = 0
    if (tvl > 0 && vol24h > 0) {
      const raw = (vol24h * feeTier * 365 / tvl) * 100
      feeApr = raw > 2000 ? 0 : raw
    }

    // Deterministic ID using on-chain token0/token1 ordering
    const id = `pancake-${token0.toLowerCase()}-${token1.toLowerCase()}-${feeTierRaw}`

    results.push({
      id,
      protocol:   'PancakeSwap',
      type:       'lp',
      tvl,
      volume_24h: vol24h,
      token0,
      token1,
      fee_tier:   feeTierRaw / 100,  // store as bps (500 ppm → 5 bps)
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

  if (results.length === 0) throw new Error('[PancakeSwap] No pools after on-chain processing')

  // ── V2 pools ────────────────────────────────────────────────────────────────
  // PancakeSwap V2 AMM: fixed 0.25% fee, no fee() function on pair contracts.
  // Fetch one page (V2 has ~17 pools on Monad, fits in 1 request).
  await new Promise(r => setTimeout(r, 3000))  // rate limit gap before V2 request
  try {
    const v2Res = await (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(`${GECKO_DEX_V2}?page=1`, {
          headers: { Accept: 'application/json' },
          next: { revalidate: 0 },
        })
        if (r.status === 429) {
          const wait = Math.max(65, parseInt(r.headers.get('Retry-After') ?? '0', 10)) * 1000
          console.warn(`[PancakeSwap V2] GeckoTerminal 429 — waiting ${wait / 1000}s`)
          await new Promise(x => setTimeout(x, wait))
          continue
        }
        if (!r.ok) throw new Error(`GeckoTerminal HTTP ${r.status}`)
        return r
      }
      throw new Error('GeckoTerminal 429 after 3 retries')
    })()
    const v2Json = await v2Res.json()
    const v2Pools = (v2Json.data ?? []) as GeckoPool[]
    console.log(`[PancakeSwap V2] Found ${v2Pools.length} V2 pools`)

    // Enrich tokenMap with V2 included data
    for (const inc of (v2Json.included ?? []) as { id: string; type: string; attributes: { address?: string; symbol?: string; decimals?: number } }[]) {
      if (inc.type === 'token' && inc.attributes?.address) {
        const addr = inc.attributes.address.toLowerCase()
        if (!tokenMap.has(addr)) {
          tokenMap.set(addr, {
            symbol:   inc.attributes.symbol   ?? 'UNKNOWN',
            decimals: inc.attributes.decimals ?? 18,
            priceUsd: 0,
          })
        }
      }
    }
    for (const pool of v2Pools) {
      const base  = geckoaddrToAddr(pool.relationships.base_token.data.id)
      const quote = geckoaddrToAddr(pool.relationships.quote_token.data.id)
      const bp = parseFloat(pool.attributes.base_token_price_usd)  || 0
      const qp = parseFloat(pool.attributes.quote_token_price_usd) || 0
      if (bp > 0) { const t = tokenMap.get(base);  if (t && t.priceUsd === 0) t.priceUsd = bp }
      if (qp > 0) { const t = tokenMap.get(quote); if (t && t.priceUsd === 0) t.priceUsd = qp }
    }

    const v2Addrs = v2Pools.map(p => p.attributes.address.toLowerCase() as `0x${string}`)

    // Get token0/token1 for V2 pairs (no fee() function — V2 uses fixed 0.25%)
    const [v2t0Res, v2t1Res] = await Promise.all([
      client.multicall({ contracts: v2Addrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'token0' as const })), allowFailure: true }),
      client.multicall({ contracts: v2Addrs.map(a => ({ address: a, abi: POOL_ABI, functionName: 'token1' as const })), allowFailure: true }),
    ])

    // Fetch unknown tokens for V2
    const v2Unknown = new Set<string>()
    for (let i = 0; i < v2Addrs.length; i++) {
      const t0 = v2t0Res[i].status === 'success' ? (v2t0Res[i].result as string).toLowerCase() : null
      const t1 = v2t1Res[i].status === 'success' ? (v2t1Res[i].result as string).toLowerCase() : null
      if (t0 && !tokenMap.has(t0)) v2Unknown.add(t0)
      if (t1 && !tokenMap.has(t1)) v2Unknown.add(t1)
    }
    if (v2Unknown.size > 0) {
      const addrs = [...v2Unknown] as `0x${string}`[]
      const [symR, decR] = await Promise.all([
        client.multicall({ contracts: addrs.map(a => ({ address: a, abi: ERC20_ABI, functionName: 'symbol'   as const })), allowFailure: true }),
        client.multicall({ contracts: addrs.map(a => ({ address: a, abi: ERC20_ABI, functionName: 'decimals' as const })), allowFailure: true }),
      ])
      addrs.forEach((addr, i) => tokenMap.set(addr, {
        symbol:   symR[i].status === 'success' ? (symR[i].result as string) : 'UNKNOWN',
        decimals: decR[i].status === 'success' ? Number(decR[i].result)     : 18,
        priceUsd: 0,
      }))
    }

    // On-chain TVL for V2 pools
    const v2PoolTokens = v2Addrs.map((_, i) => {
      const t0 = v2t0Res[i].status === 'success' ? (v2t0Res[i].result as `0x${string}`) : null
      const t1 = v2t1Res[i].status === 'success' ? (v2t1Res[i].result as `0x${string}`) : null
      return t0 && t1 ? { t0, t1 } : null
    })
    const v2ValidIdxs = v2PoolTokens.map((t, i) => t ? i : -1).filter(i => i >= 0)
    const v2BalContracts = v2ValidIdxs.flatMap(i => [
      { address: v2PoolTokens[i]!.t0.toLowerCase() as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [v2Addrs[i]] },
      { address: v2PoolTokens[i]!.t1.toLowerCase() as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [v2Addrs[i]] },
    ])
    const v2BalRes = await client.multicall({ contracts: v2BalContracts, allowFailure: true })
    const v2BalMap = new Map<number, { bal0: bigint; bal1: bigint }>()
    v2ValidIdxs.forEach((poolIdx, j) => {
      const r0 = v2BalRes[j * 2], r1 = v2BalRes[j * 2 + 1]
      if (r0?.status === 'success' && r1?.status === 'success')
        v2BalMap.set(poolIdx, { bal0: r0.result as bigint, bal1: r1.result as bigint })
    })

    // Build V2 result pools
    for (let i = 0; i < v2Pools.length; i++) {
      const gp = v2Pools[i]
      const t0Addr = v2t0Res[i].status === 'success' ? (v2t0Res[i].result as string).toLowerCase() : null
      const t1Addr = v2t1Res[i].status === 'success' ? (v2t1Res[i].result as string).toLowerCase() : null
      if (!t0Addr || !t1Addr) continue

      const t0Info = tokenMap.get(t0Addr)
      const t1Info = tokenMap.get(t1Addr)
      const token0 = t0Info?.symbol ?? 'UNKNOWN'
      const token1 = t1Info?.symbol ?? 'UNKNOWN'

      let tvl = 0
      const bals = v2BalMap.get(i)
      if (bals && t0Info && t1Info) {
        const v0 = t0Info.priceUsd > 0 ? (Number(bals.bal0) / 10 ** t0Info.decimals) * t0Info.priceUsd : 0
        const v1 = t1Info.priceUsd > 0 ? (Number(bals.bal1) / 10 ** t1Info.decimals) * t1Info.priceUsd : 0
        tvl = v0 + v1
      }
      if (tvl === 0) tvl = parseFloat(gp.attributes.reserve_in_usd) || 0

      const vol24h  = parseFloat(gp.attributes.volume_usd?.h24 ?? '0') || 0
      const feeFrac = V2_FEE_PPM / 1_000_000
      const feeApr  = tvl > 0 && vol24h > 0 ? Math.min((vol24h * feeFrac * 365 / tvl) * 100, 2000) : 0
      const id = `pancake-v2-${token0.toLowerCase()}-${token1.toLowerCase()}`

      results.push({
        id, protocol: 'PancakeSwap', type: 'lp',
        tvl, volume_24h: vol24h,
        token0, token1,
        fee_tier:   V2_FEE_PPM / 100,  // 2500 ppm → 25 bps
        fee_apr: feeApr, reward_apr: 0, total_apr: feeApr,
        in_range: true, il_risk: ilRisk(token0, token1),
        risk_score: lpRisk({ protocol: 'PancakeSwap', token0, token1, tvl, vol24h }),
        updated_at: now,
      })
      console.log(`[PancakeSwap V2] ${id}: TVL=$${tvl.toFixed(0)}, vol=$${vol24h.toFixed(0)}, APR=${feeApr.toFixed(2)}%`)
    }
  } catch (e) {
    console.error('[PancakeSwap V2] Failed, skipping V2 pools:', e)
  }

  console.log(`[PancakeSwap] Returning ${results.length} pools`)
  return results
}
