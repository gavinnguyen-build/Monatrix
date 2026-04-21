import type { LPPool } from '@/types'
import { lpRisk } from '@/lib/risk'

const GECKO_MULTI = 'https://api.geckoterminal.com/api/v2/networks/monad/pools/multi'

const STABLES = new Set(['USDC', 'USDT', 'USDT0', 'AUSD', 'USD1', 'DAI', 'USDS'])

function ilRisk(t0: string, t1: string): 'low' | 'medium' | 'high' {
  const s0 = STABLES.has(t0.toUpperCase())
  const s1 = STABLES.has(t1.toUpperCase())
  if (s0 && s1) return 'low'
  if (s0 || s1) return 'medium'
  return 'high'
}

// ─── Pool config (addresses verified via on-chain token0/token1/fee queries Apr 2026) ─
interface PoolConfig {
  id: string
  address: string
  token0: string
  token1: string
  feeTier: number  // fee fraction, e.g. 500/1_000_000 = 0.0005
}

const POOLS: PoolConfig[] = [
  // Batch 1 — high TVL pairs
  { id: 'pancake-wmon-usdc-500',    address: '0x63e48b725540a3db24acf6682a29f877808c53f2', token0: 'WMON',  token1: 'USDC',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-ausd-wmon-500',    address: '0xd5b70d70cbe6c42bcd1aaa662a21673a83f4615b', token0: 'AUSD',  token1: 'WMON',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-wbtc-wmon-500',    address: '0x0944526d2727b532653e6ca6c4d980461e170a09', token0: 'WBTC',  token1: 'WMON',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-wmon-weth-500',    address: '0xb02793fe655c1169a8699b4ee462f8ac9c75e402', token0: 'WMON',  token1: 'WETH',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-apr-wmon-2500',    address: '0x8506627b3362595f36ddf4d0df1f5c8940b052d0', token0: 'APR',   token1: 'WMON',  feeTier: 2500 / 1_000_000 },
  { id: 'pancake-ausd-usdt0-100',   address: '0x3e9d111a71bbf5d1dff8ad444f2b3287c3f56145', token0: 'AUSD',  token1: 'USDT0', feeTier: 100  / 1_000_000 },
  { id: 'pancake-wbtc-weth-500',    address: '0xbad186a74e01eb666d069a45c9ba7b2acb3274ab', token0: 'WBTC',  token1: 'WETH',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-apr-usdc-2500',    address: '0x834d94a041c40def1d05c579b422da42082e8555', token0: 'APR',   token1: 'USDC',  feeTier: 2500 / 1_000_000 },
  { id: 'pancake-ausd-usdc-100',    address: '0xe84765b4e2634f3bd8a91c89e432f6b81f0647bc', token0: 'AUSD',  token1: 'USDC',  feeTier: 100  / 1_000_000 },
  // Batch 2 — remaining pairs
  { id: 'pancake-wbtc-usdc-500',    address: '0x9b60e561e3ab15782fbb23ea0a766dd8d91ff8ac', token0: 'WBTC',  token1: 'USDC',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-cbtc-weth-500',    address: '0xca50b90382eed621b193fe8282f90b2f3a181d03', token0: 'cbBTC', token1: 'WETH',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-wmon-cbtc-500',    address: '0x614b85502b89540bb79be98d5429ec032a78a284', token0: 'WMON',  token1: 'cbBTC', feeTier: 500  / 1_000_000 },
  { id: 'pancake-xaut0-usdt0-500',  address: '0xa5c3a55af4029724f519ac8d340be9916ac83e45', token0: 'XAUt0', token1: 'USDT0', feeTier: 500  / 1_000_000 },
  { id: 'pancake-usdc-weth-500',    address: '0xe5bf0f773740a48cda56b8df37e0dc182f377139', token0: 'USDC',  token1: 'WETH',  feeTier: 500  / 1_000_000 },
  { id: 'pancake-lv-wmon-2500',     address: '0x276664da3b25af7cd13eb4d3294d9840b60e5732', token0: 'LV',    token1: 'WMON',  feeTier: 2500 / 1_000_000 },
  { id: 'pancake-wmon-cake-2500',   address: '0x92c57d703941e29a2ece8688ebe228807daa880d', token0: 'WMON',  token1: 'Cake',  feeTier: 2500 / 1_000_000 },
  { id: 'pancake-wmon-usdc-2500',   address: '0x85717a98d195c9306bbf7c9523ba71f044fea0f7', token0: 'WMON',  token1: 'USDC',  feeTier: 2500 / 1_000_000 },
  { id: 'pancake-wmon-lvmon-2500',  address: '0xc59514136bdc9c0e735471cd650625ba0f5a634d', token0: 'WMON',  token1: 'LVMON', feeTier: 2500 / 1_000_000 },
]

const POOL_MAP = new Map(POOLS.map(p => [p.address, p]))

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
  if (!res.ok) throw new Error(`[PancakeSwap] GeckoTerminal HTTP ${res.status}`)
  const json = await res.json()
  return json.data ?? []
}

export async function fetchPancakeSwapPools(): Promise<LPPool[]> {
  console.log('[PancakeSwap] Fetching 18 pools via GeckoTerminal...')

  // Split into 2 batches of 9 to stay within URL length limits
  const batch1 = POOLS.slice(0, 9).map(p => p.address)
  const batch2 = POOLS.slice(9).map(p => p.address)

  const [raw1, raw2] = await Promise.all([fetchBatch(batch1), fetchBatch(batch2)])
  const allPools = [...raw1, ...raw2]
  console.log(`[PancakeSwap] Got ${allPools.length} pools from GeckoTerminal`)

  const results: LPPool[] = []
  const now = new Date().toISOString()

  for (const pool of allPools) {
    const addr = pool.attributes.address?.toLowerCase()
    const cfg = POOL_MAP.get(addr)
    if (!cfg) continue

    const tvl    = parseFloat(pool.attributes.reserve_in_usd) || 0
    const vol24h = parseFloat(pool.attributes.volume_usd?.h24 ?? '0') || 0

    let feeApr = 0
    if (tvl > 0 && vol24h > 0) {
      const raw = (vol24h * cfg.feeTier * 365 / tvl) * 100
      feeApr = raw > 2000 ? 0 : raw
    }

    const lp: LPPool = {
      id:          cfg.id,
      protocol:    'PancakeSwap',
      type:        'lp',
      tvl,
      volume_24h:  vol24h,
      token0:      cfg.token0,
      token1:      cfg.token1,
      fee_tier:    cfg.feeTier * 10000,
      fee_apr:     feeApr,
      reward_apr:  0,
      total_apr:   feeApr,
      in_range:    true,
      il_risk:     ilRisk(cfg.token0, cfg.token1),
      risk_score:  lpRisk({ protocol: 'PancakeSwap', token0: cfg.token0, token1: cfg.token1, tvl, vol24h }),
      updated_at:  now,
    }

    console.log(`[PancakeSwap] ${cfg.id}: TVL=$${tvl.toFixed(0)}, vol=$${vol24h.toFixed(0)}, APR=${feeApr.toFixed(2)}%`)
    results.push(lp)
  }

  if (results.length === 0) throw new Error('[PancakeSwap] No pools returned from GeckoTerminal')
  console.log(`[PancakeSwap] Returning ${results.length}/18 pools`)
  return results
}
