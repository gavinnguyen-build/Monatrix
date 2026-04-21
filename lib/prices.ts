// CoinGecko simple/price endpoint — no API key needed for free tier
// Rate limit: 10-30 req/min, so we cache aggressively
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price'

// CoinGecko coin IDs — update if a coin ID changes
const COIN_IDS: Record<string, string> = {
  MON: 'monad',
  WMON: 'monad', // same underlying asset as MON
  ETH: 'ethereum',
  WETH: 'ethereum',
  BTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  SHMON: 'shmonad', // staked MON — approximate with MON price until listed separately
}

const STABLES = new Set(['USDC', 'USDT', 'AUSD', 'USD1', 'DAI', 'USDS'])

// Simple in-process cache — shared across all adapter calls in the same cron run
let cache: { prices: Record<string, number>; ts: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch USD prices for a list of token symbols.
 * Returns a map of SYMBOL (uppercase) → USD price.
 * Stablecoins always return 1.0.
 * Unknown tokens are omitted from the result.
 */
export async function getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}

  // Stablecoins: always $1
  for (const s of symbols) {
    if (STABLES.has(s.toUpperCase())) result[s.toUpperCase()] = 1.0
  }

  const nonStable = [...new Set(symbols.map(s => s.toUpperCase()).filter(s => !STABLES.has(s)))]
  if (nonStable.length === 0) return result

  // Hit cache first
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    for (const sym of nonStable) {
      if (cache.prices[sym] !== undefined) result[sym] = cache.prices[sym]
    }
    // If all found in cache, return early
    if (nonStable.every(s => result[s] !== undefined)) return result
  }

  // Determine unique CoinGecko IDs to fetch
  const idSet = new Set<string>()
  for (const sym of nonStable) {
    const id = COIN_IDS[sym]
    if (id) idSet.add(id)
  }

  if (idSet.size === 0) {
    console.warn('[Prices] No CoinGecko IDs found for:', nonStable)
    return result
  }

  try {
    const url = `${COINGECKO_URL}?ids=${[...idSet].join(',')}&vs_currencies=usd`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 }, // Next.js fetch cache: 5 min
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data: Record<string, { usd: number }> = await res.json()

    const fetched: Record<string, number> = {}
    for (const sym of nonStable) {
      const id = COIN_IDS[sym]
      if (id && data[id]?.usd) {
        fetched[sym] = data[id].usd
        result[sym] = data[id].usd
      }
    }

    // Update cache
    cache = { prices: { ...(cache?.prices ?? {}), ...fetched }, ts: Date.now() }
    console.log('[Prices] Fetched from CoinGecko:', fetched)
  } catch (err) {
    console.error('[Prices] CoinGecko fetch failed:', err)
    // Return whatever we had in cache, even if stale
    if (cache) {
      for (const sym of nonStable) {
        if (result[sym] === undefined && cache.prices[sym] !== undefined) {
          result[sym] = cache.prices[sym]
          console.warn(`[Prices] Using stale cache for ${sym}: $${cache.prices[sym]}`)
        }
      }
    }
  }

  return result
}

/**
 * Convenience: get price for a single token symbol.
 * Returns 0 if unknown.
 */
export async function getTokenPrice(symbol: string): Promise<number> {
  const prices = await getTokenPrices([symbol])
  return prices[symbol.toUpperCase()] ?? 0
}
