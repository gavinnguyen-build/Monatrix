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
// StakedMonad — stake MON, receive sMON (NOT ERC4626; uses totalPooled())
const SMON = '0xA3227C5969757783154C60bF0bC1944180ed81B9' as const

// DefiLlama pool UUID for sMON on Monad (stable, won't change)
const DEFILLAMA_POOL_ID = '73c511a9-4dc0-4397-babe-e578fd75f0dd'

// Kintsu uses totalPooled() (uint96), not totalAssets()
const ABI = parseAbi(['function totalPooled() view returns (uint96)'])

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchKintsuPools(): Promise<LiquidStakingPool[]> {
  console.log('[Kintsu] Fetching sMON liquid staking pool...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Parallel: DefiLlama pool data (APY + TVL) + on-chain totalPooled for cross-check
  const [llamaRes, totalPooled] = await Promise.all([
    fetch('https://yields.llama.fi/pools')
      .then(r => r.json()) as Promise<{ data: { pool: string; apy: number; tvlUsd: number }[] }>,
    client.readContract({ address: SMON, abi: ABI, functionName: 'totalPooled' }),
  ])

  const llamaPool = llamaRes.data.find(p => p.pool === DEFILLAMA_POOL_ID)
  if (!llamaPool) throw new Error('[Kintsu] sMON pool not found on DefiLlama')

  const apy = llamaPool.apy
  const tvl = llamaPool.tvlUsd

  console.log(
    `[Kintsu] sMON: onChain=${(Number(totalPooled) / 1e18).toFixed(0)} MON` +
    ` TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}% (source: DefiLlama)`
  )

  const pool: LiquidStakingPool = {
    id: 'kintsu-smon',
    protocol: 'Kintsu',
    type: 'liquid_staking',
    tvl,
    volume_24h: 0,
    asset: 'MON',
    apy,
    lock_period: null,
    risk_score: stakingRisk({ protocol: 'Kintsu', tvl, lockDays: null }),
    updated_at: new Date().toISOString(),
  }

  return [pool]
}
