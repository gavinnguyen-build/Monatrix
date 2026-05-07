import type { LendingPool, BorrowingPool } from '@/types'
import { lendingRisk, borrowingRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain, parseAbi } from 'viem'

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

// Yield-bearing collateral tokens
const GMON     = '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' as const
const SHMON    = '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as const
const SMON     = '0xA3227C5969757783154C60bF0bC1944180ed81B9' as const
const EARNASD  = '0x103222f020e98Bba0AD9809A011FDF8e6F067496' as const
const LOAZND   = '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90' as const

const RAY = 10n ** 27n
const SECS_PER_YEAR = 31_536_000

// Monad ~400ms block time → 7 days ≈ 1,640,000 blocks
const BLOCKS_PER_7_DAYS  = 1_640_000
const BLOCKS_PER_14_DAYS = 3_280_000
const BLOCKS_PER_30_DAYS = 7_028_571

// ─── Reserves ──────────────────────────────────────────────────────────────────
interface Reserve {
  sym: string
  addr: `0x${string}`
  dec: number
  borrowable: boolean
}

const RESERVES: Reserve[] = [
  { sym: 'USDC',     addr: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', dec: 6,  borrowable: true },
  { sym: 'WMON',     addr: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', dec: 18, borrowable: true },
  { sym: 'USDT0',    addr: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', dec: 6,  borrowable: true },
  { sym: 'WBTC',     addr: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', dec: 8,  borrowable: true },
  { sym: 'WETH',     addr: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', dec: 18, borrowable: true },
  { sym: 'AUSD',     addr: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', dec: 6,  borrowable: true },
  { sym: 'sMON',     addr: SMON,    dec: 18, borrowable: false },
  { sym: 'shMON',    addr: SHMON,   dec: 18, borrowable: false },
  { sym: 'gMON',     addr: GMON,    dec: 18, borrowable: false },
  { sym: 'earnAUSD', addr: EARNASD, dec: 6,  borrowable: false },
  { sym: 'loAZND',   addr: LOAZND,  dec: 18, borrowable: false },
]

// ─── ABIs ──────────────────────────────────────────────────────────────────────
const ORACLE_ABI = parseAbi([
  'function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)',
  'function getAssetPrice(address asset) external view returns (uint256)',
])
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
const ERC4626_ABI = parseAbi([
  'function convertToAssets(uint256 shares) external view returns (uint256)',
])

// ─── Underlying APY from on-chain PPS comparison ──────────────────────────────
// Yield-bearing collateral tokens earn their native yield even while deposited.
// Window per token (calibrated against Neverland UI):
//   gMON   → 30d  (12.34% closest to target ~12.94%)
//   shMON  → 14d  (13.73% = exact target)
//   loAZND → 7d   (best available; underlying source not yet identified)
//   earnAUSD → 7d oracle price change (convertToAssets reverts)
// sMON is handled separately via Kintsu public API.
async function fetchUnderlyingApys(curBlock: number): Promise<Record<string, number>> {
  try {
    const histClient = createPublicClient({
      chain: monad,
      transport: http('https://rpc2.monad.xyz'),  // Goldsky: historical state
    })
    const ONE_18 = BigInt(1e18)
    const block7  = BigInt(curBlock - BLOCKS_PER_7_DAYS)
    const block14 = BigInt(curBlock - BLOCKS_PER_14_DAYS)
    const block30 = BigInt(curBlock - BLOCKS_PER_30_DAYS)

    // nowResults: indices [gMON=0, shMON=1, loAZND=2, earnAUSD_oracle=3]
    const [nowResults, res7, res14, res30] = await Promise.all([
      histClient.multicall({ contracts: [
        { address: GMON,         abi: ERC4626_ABI, functionName: 'convertToAssets' as const, args: [ONE_18] as const },
        { address: SHMON,        abi: ERC4626_ABI, functionName: 'convertToAssets' as const, args: [ONE_18] as const },
        { address: LOAZND,       abi: ERC4626_ABI, functionName: 'convertToAssets' as const, args: [ONE_18] as const },
        { address: PRICE_ORACLE, abi: ORACLE_ABI,  functionName: 'getAssetPrice'   as const, args: [EARNASD] as const },
      ]}),
      // 7d ago: loAZND + earnAUSD oracle
      histClient.multicall({ blockNumber: block7, contracts: [
        { address: LOAZND,       abi: ERC4626_ABI, functionName: 'convertToAssets' as const, args: [ONE_18] as const },
        { address: PRICE_ORACLE, abi: ORACLE_ABI,  functionName: 'getAssetPrice'   as const, args: [EARNASD] as const },
      ]}),
      // 14d ago: shMON
      histClient.multicall({ blockNumber: block14, contracts: [
        { address: SHMON,        abi: ERC4626_ABI, functionName: 'convertToAssets' as const, args: [ONE_18] as const },
      ]}),
      // 30d ago: gMON
      histClient.multicall({ blockNumber: block30, contracts: [
        { address: GMON,         abi: ERC4626_ABI, functionName: 'convertToAssets' as const, args: [ONE_18] as const },
      ]}),
    ])

    const apys: Record<string, number> = {}

    const gNow    = nowResults[0].status === 'success' ? nowResults[0].result as bigint : null
    const shNow   = nowResults[1].status === 'success' ? nowResults[1].result as bigint : null
    const loNow   = nowResults[2].status === 'success' ? nowResults[2].result as bigint : null
    const earnNow = nowResults[3].status === 'success' ? nowResults[3].result as bigint : null

    const lo7    = res7[0].status  === 'success' ? res7[0].result  as bigint : null
    const earn7  = res7[1].status  === 'success' ? res7[1].result  as bigint : null
    const sh14   = res14[0].status === 'success' ? res14[0].result as bigint : null
    const g30    = res30[0].status === 'success' ? res30[0].result as bigint : null

    // gMON: 30d window
    if (gNow && g30 && g30 > 0n)
      apys['gMON']    = (Number(gNow)   / Number(g30)   - 1) * (365 / 30) * 100
    // shMON: 14d window (matches Neverland UI exactly)
    if (shNow && sh14 && sh14 > 0n)
      apys['shMON']   = (Number(shNow)  / Number(sh14)  - 1) * (365 / 14) * 100
    // loAZND: 7d window (best available approximation)
    if (loNow && lo7 && lo7 > 0n)
      apys['loAZND']  = (Number(loNow)  / Number(lo7)   - 1) * (365 / 7)  * 100
    // earnAUSD: 7d oracle price change
    if (earnNow && earn7 && earn7 > 0n)
      apys['earnAUSD'] = (Number(earnNow) / Number(earn7) - 1) * (365 / 7) * 100

    return apys
  } catch (e) {
    console.warn('[Neverland] fetchUnderlyingApys failed:', e)
    return {}
  }
}

export async function fetchNeverlandPools(): Promise<(LendingPool | BorrowingPool)[]> {
  console.log('[Neverland] Fetching lending & borrowing pools...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // ── Batch 1: prices + DUST price from LP + current block + Kintsu sMON APY ─
  const [pricesResult, lpReserves, curBlockBig, kintsuRes] = await Promise.all([
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
    client.getBlockNumber(),
    // sMON staking APY: Neverland uses Kintsu's own published APY (not on-chain PPS).
    // On-chain totalPooled/totalSupply gives ~14% due to withdrawal queue mechanics,
    // but Kintsu API (7d avg) gives ~11% which matches Neverland UI exactly.
    fetch('https://kintsu.xyz/api/public/apy?days=7')
      .then(r => r.json())
      .catch(() => null) as Promise<{ data: { apy: number }[] } | null>,
  ])

  const curBlock = Number(curBlockBig)

  // LP: token0=USDC(6dec), token1=DUST(18dec)
  const dustPrice = (Number(lpReserves[0]) / 1e6) / (Number(lpReserves[1]) / 1e18)
  console.log(`[Neverland] DUST price: $${dustPrice.toFixed(4)}`)

  // sMON staking APY from Kintsu API (7d avg — matches Neverland UI)
  const smonStakingApy = kintsuRes?.data?.length
    ? (kintsuRes.data.reduce((sum: number, row: { apy: number }) => sum + row.apy, 0) / kintsuRes.data.length) * 100
    : 0
  console.log(`[Neverland] sMON staking APY (Kintsu API 7d avg): ${smonStakingApy.toFixed(2)}%`)

  // Fetch underlying APYs in parallel with batch 2
  const [underlyingApys, batch2] = await Promise.all([
    fetchUnderlyingApys(curBlock),
    client.multicall({
      contracts: [
        ...RESERVES.map(r => ({
          address: DATA_PROVIDER as `0x${string}`,
          abi: DP_RESERVE_ABI,
          functionName: 'getReserveData' as const,
          args: [r.addr] as const,
        })),
        ...RESERVES.map(r => ({
          address: DATA_PROVIDER as `0x${string}`,
          abi: DP_RESERVE_ABI,
          functionName: 'getReserveTokensAddresses' as const,
          args: [r.addr] as const,
        })),
      ],
    }),
  ])

  const reserveDataResults = batch2.slice(0, RESERVES.length)
  const tokenAddrResults   = batch2.slice(RESERVES.length)

  // Extract aToken and variableDebt addresses
  const aTokens      = tokenAddrResults.map(r =>
    r.status === 'success' ? (r.result as [`0x${string}`, `0x${string}`, `0x${string}`])[0] : null
  )
  const varDebtTokens = tokenAddrResults.map(r =>
    r.status === 'success' ? (r.result as [`0x${string}`, `0x${string}`, `0x${string}`])[2] : null
  )

  // ── Batch 3: DUST rewards for aTokens (supply) + variableDebt (borrow) ───
  const zero = '0x0000000000000000000000000000000000000000' as `0x${string}`
  const rewardsCalls = [
    ...aTokens.map(a => ({
      address: REWARDS_CTRL as `0x${string}`,
      abi: REWARDS_ABI,
      functionName: 'getRewardsData' as const,
      args: [a ?? zero, DUST_TOKEN] as const,
    })),
    ...varDebtTokens.map(v => ({
      address: REWARDS_CTRL as `0x${string}`,
      abi: REWARDS_ABI,
      functionName: 'getRewardsData' as const,
      args: [v ?? zero, DUST_TOKEN] as const,
    })),
  ]

  const rewardsResults = await client.multicall({ contracts: rewardsCalls })
  const supplyRewards = rewardsResults.slice(0, RESERVES.length)
  const borrowRewards = rewardsResults.slice(RESERVES.length)

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
    const tvlUsd    = Number(totalAToken)  / 10 ** r.dec * price
    const borrowUsd = Number(totalVarDebt) / 10 ** r.dec * price
    const utilization = tvlUsd > 0 ? borrowUsd / tvlUsd * 100 : 0

    const supplyBase = Number(liquidityRate  * 10000n / RAY) / 100
    const borrowBase = Number(variableBorrow * 10000n / RAY) / 100

    // DUST reward APY for suppliers
    let dustSupplyApy = 0
    const rw = supplyRewards[i]
    if (rw.status === 'success' && aTokens[i]) {
      const [, eps, , distEnd] = rw.result as [bigint, bigint, bigint, bigint]
      if (Number(distEnd) > nowTs && tvlUsd > 0) {
        dustSupplyApy = (Number(eps) / 1e18 * SECS_PER_YEAR * dustPrice) / tvlUsd * 100
      }
    }

    // DUST reward APY for borrowers (reduces net borrow cost)
    let dustBorrowApy = 0
    const bw = borrowRewards[i]
    if (bw.status === 'success' && varDebtTokens[i]) {
      const [, eps, , distEnd] = bw.result as [bigint, bigint, bigint, bigint]
      if (Number(distEnd) > nowTs && borrowUsd > 0) {
        dustBorrowApy = (Number(eps) / 1e18 * SECS_PER_YEAR * dustPrice) / borrowUsd * 100
      }
    }

    // Underlying yield: sMON uses Kintsu API; others use on-chain PPS
    const underlyingApy = r.sym === 'sMON' ? smonStakingApy : (underlyingApys[r.sym] ?? 0)
    if (underlyingApy > 0) {
      const src = r.sym === 'sMON' ? 'Kintsu API' : 'on-chain PPS'
      console.log(`[Neverland] ${r.sym} underlying APY (${src}): ${underlyingApy.toFixed(2)}%`)
    }

    const netSupplyApy = supplyBase + dustSupplyApy + underlyingApy
    const netBorrowApy = Math.max(0, borrowBase - dustBorrowApy)
    const symLower = r.sym.toLowerCase()

    // ── Lending pool (supply side) ──────────────────────────────────────────
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
    console.log(
      `[Neverland] lending-${symLower}: TVL=$${tvlUsd.toFixed(0)} base=${supplyBase.toFixed(2)}%` +
      ` dust=${dustSupplyApy.toFixed(2)}% underlying=${underlyingApy.toFixed(2)}% net=${netSupplyApy.toFixed(2)}%`
    )
    results.push(lending)

    // ── Borrowing pool (borrow side) ────────────────────────────────────────
    if (r.borrowable && borrowBase > 0) {
      const borrowing: BorrowingPool = {
        id: `neverland-borrowing-${symLower}`,
        protocol: 'Neverland',
        type: 'borrowing',
        tvl: borrowUsd,
        volume_24h: 0,
        asset: r.sym,
        apy: netBorrowApy,
        utilization,
        risk_score: borrowingRisk({ protocol: 'Neverland', tvl: tvlUsd, utilization: utilization / 100 }),
        updated_at: now,
      }
      console.log(
        `[Neverland] borrowing-${symLower}: borrowed=$${borrowUsd.toFixed(0)}` +
        ` base=${borrowBase.toFixed(2)}% dustReward=${dustBorrowApy.toFixed(2)}% net=${netBorrowApy.toFixed(2)}%`
      )
      results.push(borrowing)
    }
  }

  console.log(`[Neverland] Returning ${results.length} pools`)
  return results
}
