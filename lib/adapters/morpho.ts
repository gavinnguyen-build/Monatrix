import type { LendingPool } from '@/types'
import { lendingRisk } from '@/lib/risk'

const MORPHO_API = 'https://api.morpho.org/graphql'

const QUERY = `{
  vaults(where: { chainId_in: [143], listed: true }, first: 50) {
    items {
      address
      name
      symbol
      state {
        netApy
        totalAssetsUsd
      }
      asset {
        symbol
      }
    }
  }
}`

interface MorphoVault {
  address: string
  name: string
  symbol: string
  state: {
    netApy: number | null
    totalAssetsUsd: number | null
  }
  asset: {
    symbol: string
  }
}

// Address prefixes (0x + 8 chars) to skip — too low TVL / not meaningful
// morpho-4f28cc08: Steakhouse High Yield ETH  ($1.58 TVL)
// morpho-bc03e505: Steakhouse High Yield AUSD ($81K TVL, early stage)
const SKIP_ADDR_PREFIXES = new Set(['0x4f28cc08', '0xbc03e505'])

// Vault category labels by address prefix (listed=true vaults on Monad, Apr 2026)
// Format: "<Curator> · <Category>" — matches Morpho UI groupings
const VAULT_LABELS: Record<string, string> = {
  '0xc402b0ca': 'Hyperithm · Apex',        // Hyperithm cbBTC Apex
  '0xba8424eb': 'Steakhouse · Prime',       // Steakhouse Prime ETH
  '0xa8665084': 'Hyperithm · Apex',         // Hyperithm USDC Apex
  '0x961a59fe': 'Steakhouse · High Yield',  // Steakhouse High Yield USDT0
  '0x8699bfe5': 'Steakhouse · High Yield',  // Steakhouse High Yield USD1
  '0x802c91d8': 'Steakhouse · High Yield',  // Steakhouse High Yield USDC
  '0x32841a85': 'Grove · High Yield',       // Grove x Steakhouse High Yield AUSD
  '0x21649703': 'August',                   // August USDC
  '0x0f6f5a82': 'Steakhouse · High Yield',  // Steakhouse High Yield cbBTC
}

export async function fetchMorphoPools(): Promise<LendingPool[]> {
  console.log('[Morpho] Fetching vaults from API...')

  const res = await fetch(MORPHO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`[Morpho] API HTTP error: ${res.status}`)

  const json = await res.json()
  if (json.errors) throw new Error(`[Morpho] API errors: ${JSON.stringify(json.errors)}`)

  const vaults: MorphoVault[] = json.data?.vaults?.items ?? []
  console.log(`[Morpho] Got ${vaults.length} vaults from API`)

  const results: LendingPool[] = []
  const now = new Date().toISOString()

  for (const vault of vaults) {
    if (!vault.name || !vault.symbol) continue
    const addrShort = vault.address.toLowerCase().slice(0, 10) // '0x' + 8 chars
    if (SKIP_ADDR_PREFIXES.has(addrShort)) continue

    const tvl = vault.state.totalAssetsUsd ?? 0
    const apy = (vault.state.netApy ?? 0) * 100
    const id = `morpho-${addrShort.slice(2)}`
    const label = VAULT_LABELS[addrShort] ?? vault.name

    const pool: LendingPool = {
      id,
      protocol: 'Morpho',
      type: 'lending',
      tvl,
      volume_24h: 0,
      asset: vault.asset.symbol,
      apy,
      utilization: 0,
      risk_score: lendingRisk({ protocol: 'Morpho', tvl, utilization: 0 }),
      updated_at: now,
    }

    console.log(`[Morpho] ${id} (${label}): asset=${vault.asset.symbol} TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}%`)
    results.push(pool)
  }

  console.log(`[Morpho] Returning ${results.length} vaults`)
  return results
}
