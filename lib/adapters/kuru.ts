import type { LPPool } from '@/types'
import { getTokenPrices } from '@/lib/prices'
import { lpRisk } from '@/lib/risk'

const KURU_API = 'https://api.kuru.io/api/v1/markets'
const MONAD_RPC = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz'
// totalAssets() selector on KuruAMMVault → returns (uint256 baseLiquidity, uint256 quoteLiquidity)
const TOTAL_ASSETS_SEL = '0x01e1d114'

const STABLES = new Set(['USDC', 'USDT', 'AUSD', 'USD1', 'DAI'])
const MON_ZERO = '0x0000000000000000000000000000000000000000'
const USDC_ADDR = '0x754704bc059f8c67012fed69bc8a327a5aafb603'
const AUSD_ADDR = '0x00000000efe302beaa2b3e6e1b18d08d69a9012a'
const WMON_ADDR = '0x3bd359c1119da7da1d913d1c4d2b7c461115433a'

// MarginAccount — holds all user + vault funds on Kuru
const MARGIN_ACCT = '0x2a68ba1833cdf93fa9da1eebd7f46242ad8e90c5'
// getBalance(address user, address token) → uint256
const GET_BALANCE_SEL = '0xd4fac45d'

// Managed yield vaults (separate product from CLOB markets)
// Vault addresses verified via MonadVision — must use correct addr or TVL will read 0
const KURU_VAULTS = [
  { addr: '0xd0f8a6422ccdd812f29d8fb75cf5fcd41483badc', token0: 'MON', token1: 'USDC', token0Addr: MON_ZERO, token1Addr: USDC_ADDR, token0Dec: 18, token1Dec: 6 },
]

// Only track top 2 pairs by volume
const TARGET_PAIRS = new Set(['MON-USDC', 'AUSD-USDC'])

function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

interface KuruMarket {
  baseasset: string
  quoteasset: string
  kuruammvault: string
  takerfeebps: string
  makerfeebps: string
  basetoken: { ticker: string; decimal: string }
  quotetoken: { ticker: string; decimal: string }
  lastPrice: number | null
  volume24h: number | null
}

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(MONAD_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
    next: { revalidate: 0 },
  })
  const json = await res.json()
  return json.result ?? '0x'
}

// Returns vault's (base, quote) token amounts, or null if vault has no assets
async function fetchVaultAssets(
  vaultAddr: string,
  baseDec: number,
  quoteDec: number,
): Promise<{ baseAmt: number; quoteAmt: number } | null> {
  const result = await ethCall(vaultAddr, TOTAL_ASSETS_SEL)
  if (!result || result === '0x' || result.length < 130) return null
  const baseRaw = BigInt('0x' + result.slice(2, 66))
  const quoteRaw = BigInt('0x' + result.slice(66, 130))
  if (baseRaw === BigInt(0) && quoteRaw === BigInt(0)) return null
  return {
    baseAmt: Number(baseRaw) / 10 ** baseDec,
    quoteAmt: Number(quoteRaw) / 10 ** quoteDec,
  }
}

export async function fetchKuruPools(): Promise<LPPool[]> {
  console.log('[Kuru] Fetching markets from API...')

  const res = await fetch(`${KURU_API}?limit=100`, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`[Kuru] API HTTP error: ${res.status}`)

  const json = await res.json()
  if (!json.success) throw new Error(`[Kuru] API error: ${json.error}`)

  const markets: KuruMarket[] = json.data?.data ?? []
  console.log(`[Kuru] Got ${markets.length} markets`)

  // Fetch live prices from CoinGecko
  const livePrices = await getTokenPrices(['MON', 'WMON', 'USDC', 'AUSD', 'WETH', 'WBTC'])

  // Fallback: derive MON price from MON/USDC market if CoinGecko doesn't have it
  let monPrice = livePrices['MON'] ?? 0
  if (monPrice === 0) {
    const monUsdcMarkets = (markets as (KuruMarket & { volume24h: number })[])
      .filter(m =>
        m.baseasset === MON_ZERO &&
        m.quoteasset.toLowerCase() === USDC_ADDR &&
        (m.volume24h ?? 0) > 100,
      )
      .sort((a, b) => b.volume24h - a.volume24h)
    monPrice = monUsdcMarkets[0]?.lastPrice ?? 0
    if (monPrice > 0) console.log(`[Kuru] CoinGecko MON price unavailable — using Kuru lastPrice: $${monPrice}`)
  }
  if (monPrice === 0) throw new Error('[Kuru] Could not determine MON price')
  console.log(`[Kuru] MON price = $${monPrice}`)

  // Price map: token address (lowercase) → USD
  const prices: Record<string, number> = {
    [USDC_ADDR]: livePrices['USDC'] ?? 1.0,
    [AUSD_ADDR]: livePrices['AUSD'] ?? 1.0,
    [MON_ZERO]: monPrice,
    [WMON_ADDR]: monPrice,
  }

  // Dedup: keep highest-volume market per (base_ticker, quote_ticker) pair
  // Only track TARGET_PAIRS
  const seen = new Map<string, KuruMarket>()
  for (const m of markets) {
    const vol = m.volume24h ?? 0
    const base = m.basetoken?.ticker ?? m.baseasset.slice(0, 6)
    const quote = m.quotetoken?.ticker ?? m.quoteasset.slice(0, 6)
    const key = `${base}-${quote}`
    if (!TARGET_PAIRS.has(key)) continue
    if (!seen.has(key) || vol > (seen.get(key)!.volume24h ?? 0)) {
      seen.set(key, m)
    }
  }

  const pools: LPPool[] = []
  const now = new Date().toISOString()

  for (const m of seen.values()) {
    const baseT = m.basetoken?.ticker ?? '?'
    const quoteT = m.quotetoken?.ticker ?? '?'
    const vol24h = m.volume24h ?? 0
    const quotePrice = prices[m.quoteasset.toLowerCase()] ?? 0
    const basePrice = m.lastPrice && quotePrice > 0 ? m.lastPrice * quotePrice : 0

    const baseDec = parseInt(m.basetoken?.decimal ?? '18')
    const quoteDec = parseInt(m.quotetoken?.decimal ?? '18')

    // TVL from vault's actual on-chain token balances
    let tvl = 0
    const assets = await fetchVaultAssets(m.kuruammvault, baseDec, quoteDec)
    if (assets) {
      tvl = assets.baseAmt * basePrice + assets.quoteAmt * quotePrice
    }

    // Skip if pool is both low-TVL AND low-volume
    if (tvl < 10 && vol24h < 500) {
      console.log(`[Kuru] Skipping ${baseT}/${quoteT} (tvl=$${tvl.toFixed(2)}, vol=$${vol24h})`)
      continue
    }

    // APR: Kuru AMM vault earns from bid-ask spread (no explicit protocol fee).
    // We use vol24h × estimated_fee / tvl × 365, but vol24h is market-wide (CLOB + AMM).
    // When vol/tvl > 1000×/day, the vault is a tiny fraction of market liquidity — APR unreliable.
    // In that case, set to 0 rather than show a misleading number.
    const feeBps = Math.max(
      parseInt(m.takerfeebps ?? '0'),
      parseInt(m.makerfeebps ?? '0'),
      10, // 0.1% estimated AMM vault spread fee
    )
    let feeApr = 0
    if (tvl >= 10 && vol24h / tvl <= 1000) {
      const raw = (vol24h * (feeBps / 10000) * 365 / tvl) * 100
      feeApr = raw > 1000 ? 0 : raw
    }

    const il = ilRisk(baseT, quoteT)

    const pool: LPPool = {
      id: `kuru-${baseT.toLowerCase()}-${quoteT.toLowerCase()}`,
      protocol: 'Kuru',
      type: 'lp',
      tvl,
      volume_24h: vol24h,
      token0: baseT,
      token1: quoteT,
      fee_tier: feeBps,
      fee_apr: feeApr,
      reward_apr: 0,
      total_apr: feeApr,
      in_range: true,
      il_risk: il,
      risk_score: lpRisk({ protocol: 'Kuru', token0: baseT, token1: quoteT, tvl, vol24h }),
      updated_at: now,
    }

    console.log(
      `[Kuru] ${pool.id}: TVL=$${tvl.toFixed(2)}, vol24h=$${vol24h.toFixed(0)}, APR=${feeApr.toFixed(2)}%`,
    )
    pools.push(pool)
  }

  console.log(`[Kuru] Returning ${pools.length} pools`)
  return pools
}

// ─── Kuru Managed Vaults ────────────────────────────────────────────────────
// Separate product: users deposit into a vault, it LPs into the market on their behalf.
// TVL = sum of MarginAccount balances held by the vault address.
// APR = vol24h of the corresponding market × fee_bps / TVL × 365 × 100.

async function getMarginBalance(user: string, token: string): Promise<bigint> {
  const data =
    GET_BALANCE_SEL +
    user.slice(2).padStart(64, '0').toLowerCase() +
    token.slice(2).padStart(64, '0').toLowerCase()
  const result = await ethCall(MARGIN_ACCT, data)
  return result && result !== '0x' && result.length >= 66
    ? BigInt('0x' + result.slice(2, 66))
    : BigInt(0)
}

// Fetch Merkl APRs for all Kuru vault opportunities on Monad (chainId=143)
// Native APR = 0%; all yield comes from WMON rewards distributed via Merkl
async function fetchMerklAprs(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://api.merkl.xyz/v4/opportunities?chainId=143&items=100', { next: { revalidate: 0 } })
    if (!res.ok) return {}
    const items = await res.json() as { identifier: string; apr: number }[]
    const map: Record<string, number> = {}
    for (const item of items) {
      map[item.identifier.toLowerCase()] = item.apr
    }
    return map
  } catch {
    return {}
  }
}

export async function fetchKuruVaultPools(): Promise<LPPool[]> {
  console.log('[KuruVaults] Fetching vault TVL from MarginAccount...')

  // Live prices (shares cache with fetchKuruPools if called in same cron run)
  const livePrices = await getTokenPrices(['MON', 'WMON', 'USDC', 'AUSD'])
  let monPrice = livePrices['MON'] ?? 0

  // Fallback: derive MON price from Kuru API if CoinGecko doesn't have it
  if (monPrice === 0) {
    const apiRes = await fetch(`${KURU_API}?limit=100`, { next: { revalidate: 0 } })
    const apiJson = await apiRes.json()
    const markets: KuruMarket[] = apiJson.data?.data ?? []
    const best = (markets as (KuruMarket & { volume24h: number })[])
      .filter(m => m.baseasset === MON_ZERO && m.quoteasset.toLowerCase() === USDC_ADDR && (m.volume24h ?? 0) > 100)
      .sort((a, b) => b.volume24h - a.volume24h)
    monPrice = best[0]?.lastPrice ?? 0
  }
  if (monPrice === 0) throw new Error('[KuruVaults] Could not determine MON price')
  console.log(`[KuruVaults] MON price = $${monPrice}`)

  const priceByAddr: Record<string, number> = {
    [MON_ZERO]: monPrice,
    [WMON_ADDR]: monPrice,
    [USDC_ADDR]: livePrices['USDC'] ?? 1.0,
    [AUSD_ADDR]: livePrices['AUSD'] ?? 1.0,
  }

  // Fetch Merkl APRs in parallel with vault balance reads
  // Kuru managed vaults: Native APR = 0%, all yield from WMON rewards via Merkl
  const merklAprs = await fetchMerklAprs()

  const pools: LPPool[] = []
  const now = new Date().toISOString()

  for (const v of KURU_VAULTS) {
    // Get balances in parallel
    const [monRaw, wmonRaw, quoteRaw] = await Promise.all([
      getMarginBalance(v.addr, v.token0Addr),
      getMarginBalance(v.addr, WMON_ADDR),
      getMarginBalance(v.addr, v.token1Addr),
    ])

    const token0Amt = Number(monRaw + wmonRaw) / 10 ** v.token0Dec
    const token1Amt = Number(quoteRaw) / 10 ** v.token1Dec
    const token0Price = priceByAddr[v.token0Addr] ?? 0
    const token1Price = priceByAddr[v.token1Addr] ?? 1.0
    const tvl = token0Amt * token0Price + token1Amt * token1Price

    if (tvl < 100) {
      console.log(`[KuruVaults] Skipping ${v.token0}/${v.token1} vault — TVL=$${tvl.toFixed(2)} < $100`)
      continue
    }

    // APR from Merkl — rewards distributed in WMON, updated live
    const merklApr = merklAprs[v.addr.toLowerCase()] ?? 0

    const il = ilRisk(v.token0, v.token1)

    const pool: LPPool = {
      id: `kuru-vault-${v.token0.toLowerCase()}-${v.token1.toLowerCase()}`,
      protocol: 'Kuru',
      type: 'lp',
      tvl,
      volume_24h: 0,
      token0: v.token0,
      token1: v.token1,
      fee_tier: 0,
      fee_apr: 0,
      reward_apr: merklApr,
      total_apr: merklApr,
      in_range: true,
      il_risk: il,
      risk_score: lpRisk({ protocol: 'Kuru', token0: v.token0, token1: v.token1, tvl, vol24h: 0 }),
      updated_at: now,
    }

    console.log(
      `[KuruVaults] ${pool.id}: TVL=$${tvl.toFixed(2)}, Merkl APR=${merklApr.toFixed(2)}%`,
    )
    pools.push(pool)
  }

  console.log(`[KuruVaults] Returning ${pools.length} vault pools`)
  return pools
}
