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
// ShMonad ERC4626 vault — stake MON, receive shMON
const SHMON = '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as const

// DefiLlama pool UUID for shMON on Monad (stable, won't change)
const DEFILLAMA_POOL_ID = 'ee40513c-9356-4c53-9f26-446b484a8ae2'

const ABI = parseAbi(['function totalAssets() view returns (uint256)'])

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchFastlanePools(): Promise<LiquidStakingPool[]> {
  console.log('[Fastlane] Fetching shMON liquid staking pool...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Parallel: DefiLlama pool data (APY + TVL) + on-chain totalAssets for cross-check
  const [llamaRes, totalAssets] = await Promise.all([
    fetch('https://yields.llama.fi/pools')
      .then(r => r.json()) as Promise<{ data: { pool: string; apy: number; tvlUsd: number }[] }>,
    client.readContract({ address: SHMON, abi: ABI, functionName: 'totalAssets' }),
  ])

  const llamaPool = llamaRes.data.find(p => p.pool === DEFILLAMA_POOL_ID)
  if (!llamaPool) throw new Error('[Fastlane] shMON pool not found on DefiLlama')

  const apy = llamaPool.apy
  const tvl = llamaPool.tvlUsd

  console.log(
    `[Fastlane] shMON: onChain=${(Number(totalAssets) / 1e18).toFixed(0)} MON` +
    ` TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}% (source: DefiLlama)`
  )

  const pool: LiquidStakingPool = {
    id:               'fastlane-shmon',
    protocol:         'Fastlane',
    type:             'liquid_staking',
    tvl,
    volume_24h:       0,
    asset:            'MON',
    apy,
    lock_period:      null,
    risk_score:       stakingRisk({ protocol: 'Fastlane', tvl, lockDays: null }),
    updated_at:       new Date().toISOString(),
    contract_address: SHMON,
  }

  return [pool]
}
