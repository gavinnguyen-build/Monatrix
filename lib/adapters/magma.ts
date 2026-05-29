import type { LiquidStakingPool } from '@/types'
import { stakingRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain, parseAbi } from 'viem'

// ─── Chain ─────────────────────────────────────────────────────────────────────
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

// ─── Contracts / API ───────────────────────────────────────────────────────────
// gMON ERC4626 vault — stake MON, receive gMON
const GMON = '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' as const

const ABI = parseAbi(['function totalAssets() view returns (uint256)'])

// Magma historical APY indexer (Hyperindex) — most accurate source
const MAGMA_INDEXER = 'https://indexer.hyperindex.xyz/a7dd119/v1/graphql'
const APY_QUERY = `{
  CoreVault_APY(limit: 1, order_by: {endTimestamp: desc}) {
    totalAPR
    endTimestamp
  }
}`

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchMagmaPools(): Promise<LiquidStakingPool[]> {
  console.log('[Magma] Fetching gMON liquid staking pool...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Parallel: Magma indexer APY + on-chain totalAssets + MON price
  const [indexerRes, totalAssets, priceRes] = await Promise.all([
    fetch(MAGMA_INDEXER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: APY_QUERY }),
    }).then(r => r.json()) as Promise<{ data: { CoreVault_APY: { totalAPR: string; endTimestamp: string }[] } }>,
    client.readContract({ address: GMON, abi: ABI, functionName: 'totalAssets' }),
    fetch('https://coins.llama.fi/prices/current/coingecko:monad')
      .then(r => r.json()) as Promise<{ coins: Record<string, { price: number }> }>,
  ])

  const apyRow = indexerRes.data?.CoreVault_APY?.[0]
  if (!apyRow) throw new Error('[Magma] APY not found in Magma indexer response')

  // totalAPR is stored ×100 (e.g. 1523 = 15.23%)
  const apy = parseFloat(apyRow.totalAPR) / 100

  // TVL = on-chain totalAssets (MON) × MON price
  const monPrice = priceRes.coins['coingecko:monad']?.price ?? 0
  const totalMon = Number(totalAssets) / 1e18
  const tvl = totalMon * monPrice

  console.log(
    `[Magma] gMON: onChain=${totalMon.toFixed(0)} MON` +
    ` TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}% (source: Magma indexer)`
  )

  const pool: LiquidStakingPool = {
    id:               'magma-gmon',
    protocol:         'Magma',
    type:             'liquid_staking',
    tvl,
    volume_24h:       0,
    asset:            'MON',
    apy,
    lock_period:      null,
    risk_score:       stakingRisk({ protocol: 'Magma', tvl, lockDays: null }),
    updated_at:       new Date().toISOString(),
    contract_address: GMON,
  }

  return [pool]
}
