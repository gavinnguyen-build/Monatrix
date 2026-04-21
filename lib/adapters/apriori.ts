import type { LiquidStakingPool } from '@/types'
import { stakingRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain, parseAbi } from 'viem'
import { supabaseAdmin } from '@/lib/supabase'

// ─── Chain ─────────────────────────────────────────────────────────────────────
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

// ─── Contract ──────────────────────────────────────────────────────────────────
// aprMON — ERC4626-like vault, deposit(assets, receiver) payable
const APRMON = '0x0c65A0BC65a5D819235B71F554D210D3F80E0852' as const

const ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
])

// Pool ID (deterministic)
const POOL_ID = 'apriori-aprmon'

// ─── APY computation ───────────────────────────────────────────────────────────
// Apriori is not listed on DefiLlama and does not expose an APY on-chain function.
// We track the ERC4626 exchange rate (convertToAssets(1e18)) across cron runs
// and annualise the rate of change: APY = (newRate/prevRate)^(365*24/h) - 1
// where h = hours between the two cron runs.
// First run returns APY=0; subsequent runs converge to the actual APY.

function computeAPY(newRate: number, prevRate: number, prevTs: string): number {
  const hoursDiff = (Date.now() - new Date(prevTs).getTime()) / 3_600_000
  if (hoursDiff < 0.5 || prevRate <= 0) return 0          // too soon / invalid
  const ratio = newRate / prevRate
  if (ratio <= 1) return 0                                  // rate didn't increase
  const apy = (Math.pow(ratio, (365 * 24) / hoursDiff) - 1) * 100
  return Math.min(apy, 200)                                 // cap at 200% to filter noise
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchAprioriPools(): Promise<LiquidStakingPool[]> {
  console.log('[Apriori] Fetching aprMON liquid staking pool...')

  const rpcUrl = process.env.MONAD_RPC_URL ?? 'https://rpc.monad.xyz'
  const client = createPublicClient({ chain: monad, transport: http(rpcUrl) })

  // Parallel: on-chain data + MON price from GeckoTerminal + previous rate from DB
  const [totalAssets, rateRaw, geckoRes, prevRow] = await Promise.all([
    client.readContract({ address: APRMON, abi: ABI, functionName: 'totalAssets' }),
    client.readContract({ address: APRMON, abi: ABI, functionName: 'convertToAssets', args: [10n ** 18n] }),
    fetch(
      'https://api.geckoterminal.com/api/v2/networks/monad/pools/0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954',
      { headers: { Accept: 'application/json' }, next: { revalidate: 0 } },
    ).then(r => r.json()).catch(() => null),
    // Read previous exchange_rate + updated_at for APY computation
    supabaseAdmin
      .from('pools')
      .select('exchange_rate, updated_at')
      .eq('id', POOL_ID)
      .maybeSingle()
      .then(({ data }) => data)
      .catch(() => null),
  ])

  // MON price from V4 MON/USDC pool (token0=MON 18dec, token1=USDC 6dec)
  const attrs = geckoRes?.data?.attributes
  const monPrice = attrs?.base_token_price_usd ? parseFloat(attrs.base_token_price_usd) : 0

  const totalMON = Number(totalAssets) / 1e18
  const tvl = totalMON * monPrice

  // exchange rate: how many MON per 1 aprMON (increases as rewards accrue)
  const newRate = Number(rateRaw) / 1e18

  // Compute APY from rate change vs previous cron run
  let apy = 0
  if (prevRow?.exchange_rate && prevRow?.updated_at) {
    apy = computeAPY(newRate, prevRow.exchange_rate, prevRow.updated_at)
  }

  console.log(
    `[Apriori] aprMON: totalMON=${totalMON.toFixed(0)} MON` +
    ` TVL=$${tvl.toFixed(0)} rate=${newRate.toFixed(6)}` +
    ` APY=${apy.toFixed(2)}% (prevRate=${prevRow?.exchange_rate?.toFixed(6) ?? 'n/a'})`,
  )

  const pool: LiquidStakingPool = {
    id: POOL_ID,
    protocol: 'Apriori',
    type: 'liquid_staking',
    tvl,
    volume_24h: 0,
    asset: 'MON',
    apy,
    lock_period: null,
    exchange_rate: newRate,
    risk_score: stakingRisk({ protocol: 'Apriori', tvl, lockDays: null }),
    updated_at: new Date().toISOString(),
  }

  return [pool]
}
