import type { LendingPool, BorrowingPool } from '@/types'
import { lendingRisk, borrowingRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain, parseAbi, encodeFunctionData, decodeFunctionResult } from 'viem'

// ─── Chain ─────────────────────────────────────────────────────────────────────
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

// ─── Contracts ─────────────────────────────────────────────────────────────────
const DATA_PROVIDER = '0xfd0b6b6f736376f7b99ee989c749007c7757fdba' as const
const REWARDS_CTRL  = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec' as const
const PRICE_ORACLE  = '0x94bba11004b9877d13bb5e1ae29319b6f7bdedd4' as const
const LP_USDC_DUST  = '0x86dBF00485871C901C5129bD525348Db96c2eB2d' as const
const DUST_TOKEN    = '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c' as const

const RAY = 10n ** 27n
const SECS_PER_YEAR = 31_536_000

// ─── Reserves ──────────────────────────────────────────────────────────────────
interface Reserve {
  sym: string
  addr: `0x${string}`
  dec: number
  borrowable: boolean  // has active borrow market
}

const RESERVES: Reserve[] = [
  { sym: 'USDC',     addr: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', dec: 6,  borrowable: true },
  { sym: 'WMON',     addr: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', dec: 18, borrowable: true },
  { sym: 'USDT0',    addr: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', dec: 6,  borrowable: true },
  { sym: 'WBTC',     addr: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', dec: 8,  borrowable: true },
  { sym: 'WETH',     addr: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', dec: 18, borrowable: true },
  { sym: 'AUSD',     addr: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', dec: 6,  borrowable: true },
  { sym: 'sMON',     addr: '0xA3227C5969757783154C60bF0bC1944180ed81B9', dec: 18, borrowable: false },
  { sym: 'shMON',    addr: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', dec: 18, borrowable: false },
  { sym: 'gMON',     addr: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', dec: 18, borrowable: false },
  { sym: 'earnAUSD', addr: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', dec: 6,  borrowable: false },
  { sym: 'loAZND',   addr: '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90', dec: 18, borrowable: false },
]

// ─── ABIs ──────────────────────────────────────────────────────────────────────
const ORACLE_ABI = parseAbi(['function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)'])
const DP_RESERVE_ABI = parseAbi([
  'function getReserveData(address asset) external view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40)',
  'function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
])
const REWARDS_ABI = parseAbi([
  'function getRewardsData(address asset, address reward) external view returns (uint256 index, uint256 emissionPerSecond, uint256 lastUpdateTimestamp, uint256 distributionEnd)',
])
const V2_PAIR_ABI = parseAbi([
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
])

// Underlying LST staking APY from DefiLlama — added on top of Neverland base+DUST
// When depositing sMON/shMON/gMON as collateral, user continues earning underlying staking yield
const LST_DEFILLAMA_IDS: Record<string, string> = {
  sMON:  '73c511a9-4dc0-4397-babe-e578fd75f0dd', // Kintsu
  shMON: 'ee40513c-9356-4c53-9f26-446b484a8ae2', // Fastlane
  gMON:  '96f74061-dc9a-4ef7-8117-6cd3935230de', // Magma
}

async function fetchLstUnderlyingApys(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://yields.llama.fi/pools', { next: { revalidate: 0 } })
    if (!res.ok) return {}
    const data = await res.json() as { data: { pool: string; apy: number }[] }
    const idToSym = Object.fromEntries(Object.entries(LST_DEFILLAMA_IDS).map(([s, id]) => [id, s]))
    const result: Record<string, number> = {}
    for (const p of data.data) {
      if (idToSym[p.pool]) result[idToSym[p.pool]] = p.apy ?? 0
    }
    return result
  } catch {
    return {}
  }
}

export async function fetchNeverlandPools(): Promise<(LendingPool | BorrowingPool)[]> {
  console.log('[Neverland] Fetching lending & borrowing pools...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // ── Batch 1: prices + DUST price from LP + LST underlying APYs ───────────
  const [pricesResult, lpReserves, lstApys] = await Promise.all([
    client.readContract({
      address: PRICE_ORACLE,
      abi: ORACLE_ABI,
      functionName: 'getAssetsPrices',
      args: [RESERVES.map(r => r.addr)],
    }),
    client.readContract({
      address: LP_USDC_DUST,
      abi: V2_PAIR_ABI,
      functionName: 'getReserves',
    }),
    fetchLstUnderlyingApys(),
  ])

  // LP: token0=USDC(6dec), token1=DUST(18dec)
  const dustPrice = (Number(lpReserves[0]) / 1e6) / (Number(lpReserves[1]) / 1e18)
  console.log(`[Neverland] DUST price: $${dustPrice.toFixed(4)}`)

  // ── Batch 2: getReserveData + getReserveTokensAddresses for all reserves ──
  const reserveDataCalls = RESERVES.map(r => ({
    address: DATA_PROVIDER as `0x${string}`,
    abi: DP_RESERVE_ABI,
    functionName: 'getReserveData' as const,
    args: [r.addr] as const,
  }))
  const tokenAddrCalls = RESERVES.map(r => ({
    address: DATA_PROVIDER as `0x${string}`,
    abi: DP_RESERVE_ABI,
    functionName: 'getReserveTokensAddresses' as const,
    args: [r.addr] as const,
  }))

  const batch2 = await client.multicall({ contracts: [...reserveDataCalls, ...tokenAddrCalls] })
  const reserveDataResults = batch2.slice(0, RESERVES.length)
  const tokenAddrResults   = batch2.slice(RESERVES.length)

  // ── Batch 3: getRewardsData(aToken, DUST) for all reserves ────────────────
  const aTokens = tokenAddrResults.map(r =>
    r.status === 'success' ? (r.result as [`0x${string}`, `0x${string}`, `0x${string}`])[0] : null
  )
  const rewardsCalls = aTokens.map(aToken => ({
    address: REWARDS_CTRL as `0x${string}`,
    abi: REWARDS_ABI,
    functionName: 'getRewardsData' as const,
    args: aToken ? [aToken, DUST_TOKEN] as const : ['0x0000000000000000000000000000000000000000' as `0x${string}`, DUST_TOKEN] as const,
  }))

  const rewardsResults = await client.multicall({ contracts: rewardsCalls })

  // ── Build pools ───────────────────────────────────────────────────────────
  const results: (LendingPool | BorrowingPool)[] = []
  const now = new Date().toISOString()
  const nowTs = Math.floor(Date.now() / 1000)

  for (let i = 0; i < RESERVES.length; i++) {
    const r = RESERVES[i]
    if (reserveDataResults[i].status !== 'success') {
      console.warn(`[Neverland] getReserveData failed for ${r.sym}`)
      continue
    }

    const rd = reserveDataResults[i].result as [bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,number]
    const totalAToken    = rd[2]
    const totalVarDebt   = rd[4]
    const liquidityRate  = rd[5]   // supply base APY in ray
    const variableBorrow = rd[6]   // borrow base APY in ray

    const price = Number(pricesResult[i]) / 1e8
    const tvlUsd = Number(totalAToken) / 10 ** r.dec * price
    const borrowUsd = Number(totalVarDebt) / 10 ** r.dec * price
    const utilization = tvlUsd > 0 ? borrowUsd / tvlUsd * 100 : 0

    const supplyBase = Number(liquidityRate * 10000n / RAY) / 100
    const borrowBase = Number(variableBorrow * 10000n / RAY) / 100

    // DUST emission reward APY
    let dustRewardApy = 0
    const rw = rewardsResults[i]
    if (rw.status === 'success' && aTokens[i]) {
      const [, eps, , distEnd] = rw.result as [bigint, bigint, bigint, bigint]
      if (Number(distEnd) > nowTs && tvlUsd > 0) {
        const annualDustUsd = Number(eps) / 1e18 * SECS_PER_YEAR * dustPrice
        dustRewardApy = annualDustUsd / tvlUsd * 100
      }
    }

    // For LST collateral (sMON/shMON/gMON): add underlying staking yield
    // User continues earning the LST's native staking APY even while deposited on Neverland
    const lstUnderlyingApy = lstApys[r.sym] ?? 0
    if (lstUnderlyingApy > 0) {
      console.log(`[Neverland] ${r.sym} underlying LST APY: ${lstUnderlyingApy.toFixed(2)}%`)
    }

    const netSupplyApy = supplyBase + dustRewardApy + lstUnderlyingApy
    const symLower = r.sym.toLowerCase()

    // ── Lending pool (supply side) ─────────────────────────────────────────
    const lending: LendingPool = {
      id: `neverland-lending-${symLower}`,
      protocol: 'Neverland',
      type: 'lending',
      tvl: tvlUsd,
      volume_24h: 0,
      asset: r.sym,
      apy: netSupplyApy,
      utilization,
      risk_score: lendingRisk({ protocol: 'Neverland', tvl: tvlUsd, utilization: utilization / 100 }),
      updated_at: now,
    }
    console.log(`[Neverland] lending-${symLower}: TVL=$${tvlUsd.toFixed(0)} base=${supplyBase.toFixed(2)}% dust=${dustRewardApy.toFixed(2)}% net=${netSupplyApy.toFixed(2)}%`)
    results.push(lending)

    // ── Borrowing pool (borrow side) ──────────────────────────────────────
    if (r.borrowable && borrowBase > 0) {
      const borrowing: BorrowingPool = {
        id: `neverland-borrowing-${symLower}`,
        protocol: 'Neverland',
        type: 'borrowing',
        tvl: borrowUsd,              // outstanding borrow volume
        volume_24h: 0,
        asset: r.sym,
        apy: borrowBase,             // rate paid by borrowers
        utilization,
        risk_score: borrowingRisk({ protocol: 'Neverland', tvl: tvlUsd, utilization: utilization / 100 }),
        updated_at: now,
      }
      console.log(`[Neverland] borrowing-${symLower}: borrowed=$${borrowUsd.toFixed(0)} rate=${borrowBase.toFixed(2)}%`)
      results.push(borrowing)
    }
  }

  console.log(`[Neverland] Returning ${results.length} pools`)
  return results
}
