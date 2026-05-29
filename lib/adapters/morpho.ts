import { createPublicClient, http, parseAbi, formatUnits, defineChain } from 'viem'
import type { LendingPool } from '@/types'
import { lendingRisk } from '@/lib/risk'

// Morpho redeployed all vaults on Monad with new addresses (0xbeef... vanity prefix for Steakhouse).
// TVL: read on-chain via totalAssets() for all 13 vaults.
// APY: 12/13 vaults are Morpho V2 → use vaultV2s GraphQL query (netApy field).
//      Grove x Steakhouse AUSD (0x32841A85) is V1 → use old vaults query (state.netApy).

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_URL ?? 'https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}` } },
})

// 13 active Morpho vaults on Monad (from app.morpho.org/monad, May 2026)
const VAULTS = [
  { address: '0xbeef04b01e0275D4ac2e2986256BB14E3Ff6ef42', name: 'Steakhouse Prime ETH',          asset: 'WETH',  assetDec: 18 },
  { address: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371', name: 'Hyperithm USDC Apex',           asset: 'USDC',  assetDec: 6  },
  { address: '0x32841A8511D5c2c5b253f45668780B99139e476D', name: 'Grove x Steakhouse AUSD',       asset: 'AUSD',  assetDec: 6  },
  { address: '0xe09A93786275546690247d70f1767cF0b69e8Ea0', name: 'Hyperithm cbBTC Apex',          asset: 'cbBTC', assetDec: 8  },
  { address: '0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59', name: 'August USDC V2',               asset: 'USDC',  assetDec: 6  },
  { address: '0xbeeff300E9A9caeC7beEA740ab8758D33b777509', name: 'Steakhouse High Yield USDT0',  asset: 'USDT0', assetDec: 6  },
  { address: '0xbeeff421948cDE29644a63FBA4ef5e5a621075d0', name: 'Steakhouse High Yield cbBTC',  asset: 'cbBTC', assetDec: 8  },
  { address: '0xBeEFfB65df79Baac701307c9605b7aB207355Fdb', name: 'Steakhouse High Yield USD1',   asset: 'USD1',  assetDec: 6  },
  { address: '0xbeEFf443C3CbA3E369DA795002243BeaC311aB83', name: 'Steakhouse High Yield USDC',   asset: 'USDC',  assetDec: 6  },
  { address: '0xbeeffeA75cFC4128ebe10C8D7aE22016D215060D', name: 'Steakhouse High Yield AUSD',  asset: 'AUSD',  assetDec: 6  },
  { address: '0x0ED3615ff949C8A34D15441970900E849A3409FC', name: 'Unified Labs USDC RWA',        asset: 'USDC',  assetDec: 6  },
  { address: '0xEceF08A3cD83054e8FF6D8Cb9cE41a36b81E8d7E', name: 'UltraYield cbBTC',            asset: 'cbBTC', assetDec: 8  },
  { address: '0xbeeff96D65Cb80a0029dc9D3C4d7306c3C3A6253', name: 'Steakhouse High Yield ETH',   asset: 'WETH',  assetDec: 18 },
] as const

// Token addresses for non-stable price lookups
const WETH_ADDR  = '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242' as `0x${string}`
const CBBTC_ADDR = '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b' as `0x${string}`

// Neverland PriceOracle — returns price in USD with 8 decimals (Chainlink-compatible)
const PRICE_ORACLE = '0x94bba11004b9877d13bb5e1ae29319b6f7bdedd4' as `0x${string}`

const ERC4626_ABI = parseAbi(['function totalAssets() view returns (uint256)'])
const ORACLE_ABI  = parseAbi(['function getAssetPrice(address asset) view returns (uint256)'])

// Stablecoins — treat as $1
const STABLE_ASSETS = new Set(['USDC', 'AUSD', 'USDT0', 'USD1'])

// Morpho API: 12/13 vaults use V2 architecture (vaultV2s query).
// Grove x Steakhouse AUSD (0x32841A85) uses V1 architecture (vaults query).
const MORPHO_API = 'https://api.morpho.org/graphql'

// V1 vault (Grove x Steakhouse AUSD) — not indexed in vaultV2s
const GROVE_AUSD = '0x32841A8511D5c2c5b253f45668780B99139e476D'

async function fetchApyMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const v2Addrs = VAULTS
      .filter(v => v.address !== GROVE_AUSD)
      .map(v => `"${v.address.toLowerCase()}"`)
      .join(',')

    const query = `{
      vaultV2s(where: { address_in: [${v2Addrs}] }, first: 20) {
        items { address netApy }
      }
      vaults(where: { address_in: ["${GROVE_AUSD.toLowerCase()}"] }) {
        items { address state { netApy } }
      }
    }`

    const res = await fetch(MORPHO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      next: { revalidate: 0 },
    })
    const json = await res.json()

    for (const v of (json.data?.vaultV2s?.items ?? [])) {
      map.set(v.address.toLowerCase(), (v.netApy ?? 0) * 100)
    }
    for (const v of (json.data?.vaults?.items ?? [])) {
      map.set(v.address.toLowerCase(), (v.state?.netApy ?? 0) * 100)
    }
    console.log(`[Morpho] APY from API: ${map.size}/13 vaults indexed`)
  } catch (e) {
    console.log('[Morpho] APY fetch skipped:', (e as Error).message)
  }
  return map
}

export async function fetchMorphoPools(): Promise<LendingPool[]> {
  console.log('[Morpho] Fetching 13 vaults on-chain...')

  const client = createPublicClient({ chain: monad, transport: http(process.env.MONAD_RPC_URL!) })

  // Batch: totalAssets() for all 13 vaults + WETH & cbBTC prices from oracle
  const [onChainResults, apyMap] = await Promise.all([
    client.multicall({
      contracts: [
        ...VAULTS.map(v => ({ address: v.address as `0x${string}`, abi: ERC4626_ABI, functionName: 'totalAssets' as const })),
        { address: PRICE_ORACLE, abi: ORACLE_ABI, functionName: 'getAssetPrice' as const, args: [WETH_ADDR] },
        { address: PRICE_ORACLE, abi: ORACLE_ABI, functionName: 'getAssetPrice' as const, args: [CBBTC_ADDR] },
      ],
    }),
    fetchApyMap(),
  ])

  const wethPrice  = onChainResults[VAULTS.length].status === 'success'     ? Number(onChainResults[VAULTS.length].result as bigint) / 1e8     : 0
  const cbbtcPrice = onChainResults[VAULTS.length + 1].status === 'success' ? Number(onChainResults[VAULTS.length + 1].result as bigint) / 1e8 : 0
  console.log(`[Morpho] Prices: WETH=$${wethPrice.toFixed(0)} cbBTC=$${cbbtcPrice.toFixed(0)}`)

  function assetPriceUsd(sym: string): number {
    if (STABLE_ASSETS.has(sym)) return 1
    if (sym === 'WETH') return wethPrice
    if (sym === 'cbBTC') return cbbtcPrice
    return 0
  }

  const now = new Date().toISOString()
  const results: LendingPool[] = []

  for (let i = 0; i < VAULTS.length; i++) {
    const vault = VAULTS[i]
    const res = onChainResults[i]
    if (res.status !== 'success') {
      console.log(`[Morpho] ${vault.name}: totalAssets() failed, skipping`)
      continue
    }

    const totalAssetsRaw = res.result as bigint
    const totalAssetsNum = Number(formatUnits(totalAssetsRaw, vault.assetDec))
    const price = assetPriceUsd(vault.asset)
    const tvl   = totalAssetsNum * price
    const apy   = apyMap.get(vault.address.toLowerCase()) ?? 0
    const id    = `morpho-${vault.address.toLowerCase().slice(2, 10)}`

    const pool: LendingPool = {
      id,
      protocol:         'Morpho',
      type:             'lending',
      tvl,
      volume_24h:       0,
      asset:            vault.asset,
      apy,
      utilization:      0,
      risk_score:       lendingRisk({ protocol: 'Morpho', tvl, utilization: 0 }),
      updated_at:       now,
      contract_address: vault.address,
    }

    console.log(`[Morpho] ${id} (${vault.name}): ${vault.asset} TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}%`)
    results.push(pool)
  }

  console.log(`[Morpho] Returning ${results.length} vaults`)
  return results
}
