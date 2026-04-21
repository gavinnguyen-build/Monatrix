import type { LPPool } from '@/types'
import { lpRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain } from 'viem'

const GECKO_MULTI = 'https://api.geckoterminal.com/api/v2/networks/monad/pools/multi'

const STABLES = new Set(['USDC', 'USDT', 'AUSD', 'USD1', 'DAI', 'USDT0'])

function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

// ─── Target pools ─────────────────────────────────────────────────────────────
// id: deterministic pool ID written to DB
// address: GeckoTerminal lookup key (bytes32 for V4, 0x address for V2/V3)
// feeTier: as decimal fraction (e.g. 0.05% → 0.0005)

interface TargetPool {
  id:      string
  address: string
  token0:  string
  token1:  string
  feeTier: number
  version: 'v2' | 'v3' | 'v4'
}

const TARGET_POOLS: TargetPool[] = [
  // ── V4 ──────────────────────────────────────────────────────────────────────
  // Existing pools (verified Apr 2026)
  { id: 'uniswap-v4-ausd-usdc',    address: '0xd112fde908d7342135fc7297cc53d25bf7a11d6c6e21fe7ac3e73c40f70827e8', token0: 'AUSD',   token1: 'USDC',   feeTier: 0.000009, version: 'v4' },
  { id: 'uniswap-v4-mon-usdc',     address: '0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954', token0: 'MON',    token1: 'USDC',   feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-ausd-usdt0',   address: '0xe56868928b91fcd5ebeada3d0ec8767f2bbfeb1e7da181203d13f6af76b03bf9', token0: 'AUSD',   token1: 'USDT0',  feeTier: 0.00005,  version: 'v4' },
  { id: 'uniswap-v4-usdc-weth',    address: '0xad408916c1c310da9c258d4c128a7bf50fd9edc42a218cc970da39cfc8a05d93', token0: 'USDC',   token1: 'WETH',   feeTier: 0.0005,   version: 'v4' },
  // New V4 pools (verified Apr 2026 via PoolKey hash computation)
  { id: 'uniswap-v4-weeth-weth',   address: '0x2884b37c4a144e7047a1377ba7201d4b8ea318f0240369e01dc400f04e6cac40', token0: 'weETH',  token1: 'WETH',   feeTier: 0.0001,   version: 'v4' },
  { id: 'uniswap-v4-wsteth-weth',  address: '0x55d7ed991392eb9597a76a5f41dfb964e291452c15107c0e64fd3d25925394ce', token0: 'wstETH', token1: 'WETH',   feeTier: 0.0001,   version: 'v4' },
  { id: 'uniswap-v4-usdc-cbbtc',   address: '0x7fc6232a9ec6cc4e9434640dcde5ee08ccae3b07de3247bf788fc9e2051b449e', token0: 'USDC',   token1: 'cbBTC',  feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-wbtc-cbbtc',   address: '0xab7e9e8e532098ef4802c25490136d4f84089dea5900b3bec6153561d17b37bd', token0: 'WBTC',   token1: 'cbBTC',  feeTier: 0.0001,   version: 'v4' },
  { id: 'uniswap-v4-mon-ausd',     address: '0xadaf30776f551bccdfb307c3fd8cdec198ca9a852434c8022ee32d1ccedd8219', token0: 'MON',    token1: 'AUSD',   feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-wbtc-usdc',    address: '0xd77c0f253764f5d5fbc78e13888afcc35c839262e6b21cd02baa9d8551a9898a', token0: 'WBTC',   token1: 'USDC',   feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-ausd-xaut0',   address: '0xe1a8600687e4d06ca4787e5d0ccdacb1d360bfc9ca6ca2a49a688e14d0ef37b4', token0: 'AUSD',   token1: 'XAUt0',  feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-mon-wbtc',     address: '0x1c93dd2f2f47439330150bf728c3beeaad71de45420a49183214898b044b65d1', token0: 'MON',    token1: 'WBTC',   feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-mon-weth',     address: '0x3783b51e33900eb366a9e8473c76cda441e7170d2e5d96927f30c16a7add93aa', token0: 'MON',    token1: 'WETH',   feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-usdc-usdt0',   address: '0x4ac1e6d2eeefa340e9e05ff0b67c0962b500fb7ab1bde4ace7a5ad631da2dc33', token0: 'USDC',   token1: 'USDT0',  feeTier: 0.00002,  version: 'v4' },
  { id: 'uniswap-v4-ausd-usdc-2',  address: '0x092b650478145f0aee73a1b400b342b9c6314db2e07aeb91faf7e75e8159ce72', token0: 'AUSD',   token1: 'USDC',   feeTier: 0.00005,  version: 'v4' },
  { id: 'uniswap-v4-mon-shmon',    address: '0x0a2eb246aac042fed4eeaf8bce78df3568cbe21701c969812702633085b8f771',  token0: 'MON',    token1: 'shMON',  feeTier: 0.0001,   version: 'v4' },
  // Additional V4 pools — non-zero hooks (PoolKey unverifiable via standard hash, deposit not supported)
  { id: 'uniswap-v4-mon-cbbtc',   address: '0x45be07f23e76fc8d5f0de2164381805ef1ab5bc956b710e63d1a7d445065601a', token0: 'MON',    token1: 'cbBTC',  feeTier: 0.0005,   version: 'v4' },
  { id: 'uniswap-v4-ausd-xaut0-2',address: '0xbb790bd65e290ec6704d731e43fbbbcfa0521c67c608db989767cf22a59a9a92', token0: 'AUSD',   token1: 'XAUt0',  feeTier: 0.0005,   version: 'v4' },
  // ── V3 ──────────────────────────────────────────────────────────────────────
  // Existing
  { id: 'uniswap-v3-mon-usdc',     address: '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da',                          token0: 'MON',    token1: 'USDC',   feeTier: 0.003,    version: 'v3' },
  // New V3 pools (token0/token1 verified on-chain Apr 2026)
  { id: 'uniswap-v3-shmon-mon',    address: '0x1f86a9F2441caC9B942CFb5445530CdBB28717eD',                         token0: 'shMON',  token1: 'MON',    feeTier: 0.0001,   version: 'v3' },
  { id: 'uniswap-v3-mon-gmon',     address: '0xb80d7a8F5331A907E34CD73f575c784B43E5acb5',                         token0: 'MON',    token1: 'gMON',   feeTier: 0.0001,   version: 'v3' },
  { id: 'uniswap-v3-usdc-dust',    address: '0xF98D134EF12E3D5DbcF986504B799999b7ded631',                         token0: 'USDC',   token1: 'DUST',   feeTier: 0.01,     version: 'v3' },
  { id: 'uniswap-v3-alloca-mon',   address: '0x1ED2F2057901BBEf02EFbC9928b113a15844A19a',                         token0: 'ALLOCA', token1: 'MON',    feeTier: 0.003,    version: 'v3' },
  { id: 'uniswap-v3-usdc-weth',    address: '0x25EF1a210fF55BcEe9F8fee979aAFf6bD1bE5Bf1',                         token0: 'USDC',   token1: 'WETH',   feeTier: 0.003,    version: 'v3' },
  // ── V2 ──────────────────────────────────────────────────────────────────────
  { id: 'uniswap-v2-dust-usdc',    address: '0x86dbf00485871c901c5129bd525348db96c2eb2d',                          token0: 'USDC',   token1: 'DUST',   feeTier: 0.003,    version: 'v2' },
]

const POOL_MAP = new Map(TARGET_POOLS.map(p => [p.address.toLowerCase(), p]))

interface GeckoPool {
  attributes: {
    address: string
    reserve_in_usd: string
    volume_usd: { h24: string }
  }
}

async function fetchBatch(addresses: string[]): Promise<GeckoPool[]> {
  const url = `${GECKO_MULTI}/${addresses.join(',')}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`[Uniswap] GeckoTerminal HTTP ${res.status}`)
  const json = await res.json()
  return json.data ?? []
}

// ─── On-chain TVL via V4 StateView tick bitmap scan ───────────────────────────
// Used for native MON V4 pools where GeckoTerminal overstates TVL 2-10×.
// Algorithm: enumerate all initialized ticks → reconstruct full liquidity
// distribution → compute token amounts in each tick range → sum to TVL.

const monadChain = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}` } },
})

const STATE_VIEW = '0x77395f3b2e73ae90843717371294fa97cc419d64' as const
const STATE_VIEW_ABI = [
  {
    name: 'getSlot0', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'protocolFee',  type: 'uint24'  },
      { name: 'lpFee',        type: 'uint24'  },
    ],
  },
  {
    name: 'getTickBitmap', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'tick', type: 'int16' }],
    outputs: [{ name: 'tickBitmap', type: 'uint256' }],
  },
  {
    name: 'getTickInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'tick', type: 'int24' }],
    outputs: [
      { name: 'liquidityGross',        type: 'uint128' },
      { name: 'liquidityNet',          type: 'int128'  },
      { name: 'feeGrowthOutside0X128', type: 'uint256' },
      { name: 'feeGrowthOutside1X128', type: 'uint256' },
    ],
  },
] as const

const Q96 = 2n ** 96n

// Convert tick to sqrtPriceX96 (Q64.96 fixed-point)
function tickToSqrtPriceX96(tick: number): bigint {
  const sqrtP = Math.exp(tick * 0.5 * Math.log(1.0001))
  return BigInt(Math.round(sqrtP * Number(Q96)))
}

// Pools using on-chain TVL — GeckoTerminal overstates native MON in V4 pools
// Only needed for pools where currency0 = native MON (address(0))
const ONCHAIN_TVL: Record<string, {
  poolId:      `0x${string}`
  tickSpacing: number
  dec0:        number
  dec1:        number
  price0Key:   'mon' | 'wbtc' | 'weth' | 'stable'
  price1Key:   'mon' | 'wbtc' | 'weth' | 'stable'
}> = {
  'uniswap-v4-mon-ausd': {
    poolId: '0xadaf30776f551bccdfb307c3fd8cdec198ca9a852434c8022ee32d1ccedd8219',
    tickSpacing: 1, dec0: 18, dec1: 6, price0Key: 'mon', price1Key: 'stable',
  },
  'uniswap-v4-mon-wbtc': {
    poolId: '0x1c93dd2f2f47439330150bf728c3beeaad71de45420a49183214898b044b65d1',
    tickSpacing: 1, dec0: 18, dec1: 8, price0Key: 'mon', price1Key: 'wbtc',
  },
  'uniswap-v4-mon-weth': {
    poolId: '0x3783b51e33900eb366a9e8473c76cda441e7170d2e5d96927f30c16a7add93aa',
    tickSpacing: 1, dec0: 18, dec1: 18, price0Key: 'mon', price1Key: 'weth',
  },
}

type PriceKey = 'mon' | 'wbtc' | 'weth' | 'stable'

// Compute USD prices for MON, WBTC, WETH from V4 reference pools on-chain
async function fetchOnChainPrices(client: ReturnType<typeof createPublicClient>): Promise<Record<PriceKey, number>> {
  const [monSlot0, wbtcSlot0, wethSlot0] = await Promise.all([
    // V4 MON/USDC: currency0=MON(18dec), currency1=USDC(6dec)
    client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: 'getSlot0',
      args: ['0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954'] }),
    // V4 WBTC/USDC: currency0=WBTC(8dec), currency1=USDC(6dec)
    client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: 'getSlot0',
      args: ['0xd77c0f253764f5d5fbc78e13888afcc35c839262e6b21cd02baa9d8551a9898a'] }),
    // V4 USDC/WETH: currency0=USDC(6dec), currency1=WETH(18dec)
    client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: 'getSlot0',
      args: ['0xad408916c1c310da9c258d4c128a7bf50fd9edc42a218cc970da39cfc8a05d93'] }),
  ])
  const monSqrtP  = Number(monSlot0[0])  / Number(Q96)
  const wbtcSqrtP = Number(wbtcSlot0[0]) / Number(Q96)
  const wethSqrtP = Number(wethSlot0[0]) / Number(Q96)
  return {
    mon:    monSqrtP  * monSqrtP  * 1e12,        // MON(18)/USDC(6): P² × 10^(18-6)
    wbtc:   wbtcSqrtP * wbtcSqrtP * 100,          // WBTC(8)/USDC(6): P² × 10^(8-6)
    weth:   1e12 / (wethSqrtP * wethSqrtP),       // USDC(6)/WETH(18): 1/(P²) × 10^12
    stable: 1.0,
  }
}

// Full tick bitmap scan: enumerates every initialized tick, reconstructs
// the liquidity at each tick range, sums token amounts to get TVL.
async function scanTickBitmapTVL(
  client: ReturnType<typeof createPublicClient>,
  poolId:      `0x${string}`,
  tickSpacing: number,
  dec0:        number,
  dec1:        number,
  price0USD:   number,
  price1USD:   number,
): Promise<number> {
  // Current price and tick
  const slot0 = await client.readContract({
    address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: 'getSlot0', args: [poolId],
  })
  const sqrtPc      = slot0[0] as bigint
  const currentTick = Number(slot0[1])

  // Enumerate all word positions for the tick bitmap
  const minWord = Math.floor(Math.floor(-887272 / tickSpacing) / 256)
  const maxWord = Math.floor(Math.floor( 887272 / tickSpacing) / 256)
  const allWords: number[] = []
  for (let wp = minWord; wp <= maxWord; wp++) allWords.push(wp)

  // Batch multicall (500/batch) to find non-zero bitmap words
  const BATCH = 500
  const nonZero: Record<number, bigint> = {}
  for (let i = 0; i < allWords.length; i += BATCH) {
    const batch = allWords.slice(i, i + BATCH)
    const results = await client.multicall({
      contracts: batch.map(wp => ({
        address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: 'getTickBitmap',
        args: [poolId, wp] as const,
      })),
    })
    batch.forEach((wp, j) => {
      if (results[j].status === 'success' && (results[j].result as bigint) !== 0n) {
        nonZero[wp] = results[j].result as bigint
      }
    })
  }

  // Extract initialized ticks from non-zero bitmap words
  const ticks: number[] = []
  for (const [wpStr, bitmap] of Object.entries(nonZero)) {
    const wp = Number(wpStr)
    for (let bit = 0; bit < 256; bit++) {
      if ((bitmap >> BigInt(bit)) & 1n) {
        const tick = (wp * 256 + bit) * tickSpacing
        if (tick >= -887272 && tick <= 887272) ticks.push(tick)
      }
    }
  }
  ticks.sort((a, b) => a - b)
  if (ticks.length === 0) return 0

  // Batch multicall to get liquidityNet for each initialized tick
  const nets: bigint[] = []
  for (let i = 0; i < ticks.length; i += BATCH) {
    const batch = ticks.slice(i, i + BATCH)
    const results = await client.multicall({
      contracts: batch.map(tick => ({
        address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: 'getTickInfo',
        args: [poolId, tick] as const,
      })),
    })
    results.forEach(r => {
      nets.push(r.status === 'success' ? (r.result as [bigint, bigint, bigint, bigint])[1] : 0n)
    })
  }

  // Reconstruct liquidity distribution and compute token amounts
  let liquidity = 0n
  let amount0Raw = 0n
  let amount1Raw = 0n

  for (let i = 0; i < ticks.length; i++) {
    liquidity += nets[i]  // add liquidityNet at tickLower, subtract at tickUpper
    if (i + 1 >= ticks.length || liquidity <= 0n) continue

    const ta = ticks[i]
    const tb = ticks[i + 1]
    const sqrtPa = tickToSqrtPriceX96(ta)
    const sqrtPb = tickToSqrtPriceX96(tb)

    if (tb <= currentTick) {
      // Range fully below current tick → all token1
      amount1Raw += liquidity * (sqrtPb - sqrtPa) / Q96
    } else if (ta >= currentTick) {
      // Range fully above current tick → all token0
      amount0Raw += liquidity * (sqrtPb - sqrtPa) * Q96 / (sqrtPa * sqrtPb)
    } else {
      // Range spans current tick → split
      amount1Raw += liquidity * (sqrtPc - sqrtPa) / Q96
      amount0Raw += liquidity * (sqrtPb - sqrtPc) * Q96 / (sqrtPc * sqrtPb)
    }
  }

  const amount0 = Number(amount0Raw) / 10 ** dec0
  const amount1 = Number(amount1Raw) / 10 ** dec1
  return amount0 * price0USD + amount1 * price1USD
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchUniswapPools(): Promise<LPPool[]> {
  const total = TARGET_POOLS.length
  console.log(`[Uniswap] Fetching ${total} pools via GeckoTerminal + on-chain...`)

  // 1. GeckoTerminal: split into batches of 10 (URL length limit)
  const addresses = TARGET_POOLS.map(p => p.address)
  const batches: string[][] = []
  for (let i = 0; i < addresses.length; i += 10) batches.push(addresses.slice(i, i + 10))

  const settled = await Promise.allSettled(batches.map(b => fetchBatch(b)))
  const allPools: GeckoPool[] = []
  const successfulBatches = new Set<number>()
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') { allPools.push(...r.value); successfulBatches.add(i) }
    else console.error(`[Uniswap] Batch ${i + 1} failed:`, r.reason)
  })
  console.log(`[Uniswap] Got ${allPools.length} pools from GeckoTerminal`)

  // 2. On-chain TVL for native MON V4 pools (GeckoTerminal overstates 2-10×)
  const onchainTVL: Record<string, number> = {}
  try {
    const rpcUrl = process.env.MONAD_RPC_URL ?? 'https://rpc.monad.xyz'
    const client = createPublicClient({ chain: monadChain, transport: http(rpcUrl) })

    const prices = await fetchOnChainPrices(client)
    console.log(`[Uniswap] On-chain prices: MON=$${prices.mon.toFixed(4)}, WBTC=$${prices.wbtc.toFixed(0)}, WETH=$${prices.weth.toFixed(0)}`)

    // Sequential — tick bitmap scans make many RPC calls; parallel would hit rate limits
    for (const [id, cfg] of Object.entries(ONCHAIN_TVL)) {
      try {
        const tvl = await scanTickBitmapTVL(
          client, cfg.poolId, cfg.tickSpacing,
          cfg.dec0, cfg.dec1,
          prices[cfg.price0Key], prices[cfg.price1Key],
        )
        onchainTVL[id] = tvl
        console.log(`[Uniswap] On-chain ${id}: TVL=$${tvl.toFixed(0)}`)
      } catch (e) {
        console.error(`[Uniswap] On-chain TVL failed for ${id}:`, e)
      }
    }
  } catch (e) {
    console.error('[Uniswap] On-chain TVL fetch failed, using GeckoTerminal:', e)
  }

  // 3. Build results
  const poolResults: LPPool[] = []
  const now = new Date().toISOString()

  // Gecko pools
  for (const pool of allPools) {
    const addr   = pool.attributes.address?.toLowerCase()
    const target = POOL_MAP.get(addr)
    if (!target) continue

    const geckoTVL = Math.max(0, parseFloat(pool.attributes.reserve_in_usd) || 0)
    const vol24h   = parseFloat(pool.attributes.volume_usd?.h24 ?? '0') || 0
    // Prefer on-chain TVL for MON V4 pools; use `in` not `??` to avoid 0-override
    const tvl      = target.id in onchainTVL ? (onchainTVL[target.id] ?? geckoTVL) : geckoTVL

    let feeApr = 0
    if (tvl > 0 && vol24h > 0) {
      const raw = (vol24h * target.feeTier * 365 / tvl) * 100
      feeApr = raw > 2000 ? 0 : raw
    }

    const lp: LPPool = {
      id:         target.id,
      protocol:   'Uniswap',
      type:       'lp',
      tvl,
      volume_24h: vol24h,
      token0:     target.token0,
      token1:     target.token1,
      fee_tier:   target.feeTier * 10000,
      fee_apr:    feeApr,
      reward_apr: 0,
      total_apr:  feeApr,
      in_range:   true,
      il_risk:    ilRisk(target.token0, target.token1),
      risk_score: lpRisk({ protocol: 'Uniswap', token0: target.token0, token1: target.token1, tvl, vol24h }),
      updated_at: now,
    }
    console.log(`[Uniswap] ${target.id}: TVL=$${tvl.toFixed(0)}, vol=$${vol24h.toFixed(0)}, APR=${feeApr.toFixed(2)}%`)
    poolResults.push(lp)
  }

  // For target pools in a successfully-fetched batch that GeckoTerminal didn't return,
  // write TVL=0 to overwrite any stale bad values in the DB.
  const seenIds = new Set(poolResults.map(p => p.id))
  for (let idx = 0; idx < TARGET_POOLS.length; idx++) {
    const target = TARGET_POOLS[idx]
    if (seenIds.has(target.id)) continue                      // already in results
    if (target.id in onchainTVL) continue                     // handled on-chain
    if (!successfulBatches.has(Math.floor(idx / 10))) continue // batch failed, don't overwrite
    console.log(`[Uniswap] ${target.id}: not in GeckoTerminal response, writing TVL=0`)
    poolResults.push({
      id: target.id, protocol: 'Uniswap', type: 'lp',
      tvl: 0, volume_24h: 0,
      token0: target.token0, token1: target.token1,
      fee_tier: target.feeTier * 10000,
      fee_apr: 0, reward_apr: 0, total_apr: 0,
      in_range: true, il_risk: ilRisk(target.token0, target.token1),
      risk_score: lpRisk({ protocol: 'Uniswap', token0: target.token0, token1: target.token1, tvl: 0, vol24h: 0 }),
      updated_at: now,
    })
  }

  if (poolResults.length === 0) throw new Error('[Uniswap] No pools returned')
  console.log(`[Uniswap] Returning ${poolResults.length}/${total} pools`)
  return poolResults
}
