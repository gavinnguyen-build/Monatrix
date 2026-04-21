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

// DefiLlama pool UUID for gMON on Monad (stable, won't change)
const DEFILLAMA_POOL_ID = '96f74061-dc9a-4ef7-8117-6cd3935230de'

const ABI = parseAbi(['function totalAssets() view returns (uint256)'])

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchMagmaPools(): Promise<LiquidStakingPool[]> {
  console.log('[Magma] Fetching gMON liquid staking pool...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Parallel: DefiLlama pool data (APY + TVL) + on-chain totalAssets for cross-check
  const [llamaRes, totalAssets] = await Promise.all([
    fetch('https://yields.llama.fi/pools')
      .then(r => r.json()) as Promise<{ data: { pool: string; apy: number; tvlUsd: number }[] }>,
    client.readContract({ address: GMON, abi: ABI, functionName: 'totalAssets' }),
  ])

  const llamaPool = llamaRes.data.find(p => p.pool === DEFILLAMA_POOL_ID)
  if (!llamaPool) throw new Error('[Magma] gMON pool not found on DefiLlama')

  const apy = llamaPool.apy
  const tvl = llamaPool.tvlUsd

  console.log(
    `[Magma] gMON: onChain=${(Number(totalAssets) / 1e18).toFixed(0)} MON` +
    ` TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}% (source: DefiLlama)`
  )

  const pool: LiquidStakingPool = {
    id: 'magma-gmon',
    protocol: 'Magma',
    type: 'liquid_staking',
    tvl,
    volume_24h: 0,
    asset: 'MON',
    apy,
    lock_period: null,
    risk_score: stakingRisk({ protocol: 'Magma', tvl, lockDays: null }),
    updated_at: new Date().toISOString(),
  }

  return [pool]
}
