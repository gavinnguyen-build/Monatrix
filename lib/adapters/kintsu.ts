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

// Kintsu uses totalPooled() (uint96), not totalAssets()
const ABI = parseAbi([
  'function totalPooled() view returns (uint96)',
  'function totalSupply() view returns (uint256)',
])

// MON price from DefiLlama (used for TVL calculation)
const DEFILLAMA_MONAD_ID = 'coingecko:monad'

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchKintsuPools(): Promise<LiquidStakingPool[]> {
  console.log('[Kintsu] Fetching sMON liquid staking pool...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Parallel: Kintsu public APY API + on-chain TVL data + MON price
  const [apyRes, totalPooled, priceRes] = await Promise.all([
    fetch('https://kintsu.xyz/api/public/apy')
      .then(r => r.json()) as Promise<{ meta: { latestApy: string }; data: { date: string; apy: number }[] }>,
    client.readContract({ address: SMON, abi: ABI, functionName: 'totalPooled' }),
    fetch('https://coins.llama.fi/prices/current/coingecko:monad')
      .then(r => r.json()) as Promise<{ coins: Record<string, { price: number }> }>,
  ])

  // APY from Kintsu's own API (matches their website exactly)
  const apyRaw = apyRes.data[0]?.apy
  if (!apyRaw) throw new Error('[Kintsu] APY not found in Kintsu API response')
  const apy = apyRaw * 100

  // TVL = totalPooled (MON) × MON price
  const monPrice = priceRes.coins[DEFILLAMA_MONAD_ID]?.price ?? 0
  const totalMon = Number(totalPooled) / 1e18
  const tvl = totalMon * monPrice

  console.log(
    `[Kintsu] sMON: onChain=${totalMon.toFixed(0)} MON` +
    ` TVL=$${tvl.toFixed(0)} APY=${apy.toFixed(2)}% (source: kintsu.xyz/api/public/apy)`
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
