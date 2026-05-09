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
const READER        = '0x878cDfc2F3D96a49A5CbD805FAF4F3080768a6d2' as const
const FALLBACK_ADDR = '0x0000000000000000000000000000000000000001' as `0x${string}`
const SECS_PER_YEAR = 31_536_000

// On-chain APY overrides: yield-bearing collateral tokens where native_apy API is incomplete
const VUSD_ADDR    = '0x8d3F9f9Eb2f5E8B48EFBB4074440D1E2A34Bc365' as const  // vUSD (ERC4626)
const EARNASD_ADDR = '0x103222f020e98Bba0AD9809A011FDF8e6F067496' as const  // earnAUSD (Neverland aToken)
// Neverland contracts needed for earnAUSD DUST rewards
const NV_DP        = '0xfd0b6b6f736376f7b99ee989c749007c7757fdba' as const
const NV_ORACLE    = '0x94bba11004b9877d13bb5e1ae29319b6f7bdedd4' as const
const NV_REWARDS   = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec' as const
const NV_DUST      = '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c' as const
const NV_LP_DUST   = '0x86dBF00485871C901C5129bD525348Db96c2eB2d' as const  // USDC/DUST V2 pool

// On-chain APY overrides: additional yield-bearing tokens
const YZM_ADDR    = '0x3a2c4aAae6776dC1c31316De559598f2f952E2cB' as const  // YZM (ERC4626, 6 dec)
const SYZUSD_ADDR = '0x484be0540aD49f351eaa04eeB35dF0f937D4E73f' as const  // syzUSD (oracle 14d)
const WSRUSD_ADDR = '0x4809010926aec940b550D34a46A52739f996D75D' as const  // wsrUSD (oracle 7d)

const BLOCKS_PER_7D  = 1_640_000
const BLOCKS_PER_14D = 3_280_000
const BLOCKS_PER_30D = 7_028_571

// ABIs for on-chain APY computation
const OCA_ERC4626 = parseAbi(['function convertToAssets(uint256) view returns (uint256)'])
const OCA_ORACLE  = parseAbi([
  'function getAssetPrice(address) view returns (uint256)',
])
const OCA_PRICE   = parseAbi([
  'function getPrice(address,bool,bool) view returns (uint256,uint256)',
])
const OCA_DP      = parseAbi([
  'function getReserveData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40)',
  'function getReserveTokensAddresses(address) view returns (address,address,address)',
])
const OCA_REWARDS = parseAbi(['function getRewardsData(address,address) view returns (uint256,uint256,uint256,uint256)'])
const OCA_V2PAIR  = parseAbi(['function getReserves() view returns (uint112,uint112,uint32)'])

// ─── ABIs ──────────────────────────────────────────────────────────────────────
const DYNAMIC_ABI = [{
  name: 'getDynamicMarketData',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{
    type: 'tuple[]',
    components: [
      { name: '_address', type: 'address' },
      {
        name: 'tokens', type: 'tuple[]', components: [
          { name: '_address',            type: 'address' },
          { name: 'totalSupply',         type: 'uint256' },
          { name: 'collateral',          type: 'uint256' },
          { name: 'debt',                type: 'uint256' },
          { name: 'sharePrice',          type: 'uint256' },
          { name: 'assetPrice',          type: 'uint256' },
          { name: 'sharePriceLower',     type: 'uint256' },
          { name: 'assetPriceLower',     type: 'uint256' },
          { name: 'borrowRate',          type: 'uint256' },
          { name: 'predictedBorrowRate', type: 'uint256' },
          { name: 'utilizationRate',     type: 'uint256' },
          { name: 'supplyRate',          type: 'uint256' },
          { name: 'liquidity',           type: 'uint256' },
        ],
      },
    ],
  }],
}] as const

const ERC20_ABI = [
  { name: 'asset',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'symbol',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string'  }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8'   }] },
] as const

// ─── Types ─────────────────────────────────────────────────────────────────────
type DynToken = {
  _address: `0x${string}`
  totalSupply: bigint
  collateral: bigint
  debt: bigint
  sharePrice: bigint
  assetPrice: bigint
  sharePriceLower: bigint
  assetPriceLower: bigint
  borrowRate: bigint
  predictedBorrowRate: bigint
  utilizationRate: bigint
  supplyRate: bigint
  liquidity: bigint
}

type DynMarket = {
  _address: `0x${string}`
  tokens: readonly DynToken[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
// Find a cToken address in the raw getStaticMarketData hex and read a flag word.
// From on-chain analysis: offset+7 from cToken address = depositPaused flag,
//                         offset+11 = borrowPaused flag (1n = paused/at-cap).
function cTokenFlag(staticHex: string, cTokenAddr: string, wordOffset: number): boolean {
  const padded = '000000000000000000000000' + cTokenAddr.slice(2).toLowerCase()
  const charPos = staticHex.indexOf(padded)
  if (charPos === -1 || charPos % 64 !== 0) return false
  const start = charPos + wordOffset * 64
  return BigInt('0x' + staticHex.slice(start, start + 64)) === 1n
}

// ─── On-chain APY computation ───────────────────────────────────────────────────
// Returns overrides for symbols that can't be fully derived from native_apy API.
async function fetchOnChainApys(
  client: ReturnType<typeof createPublicClient>,
  curBlock: bigint,
): Promise<Record<string, number>> {
  // Historical block reads require Goldsky RPC (rpc2) which supports full state history
  const histClient = createPublicClient({
    chain: defineChain({ id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc2.monad.xyz'] } }, contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}` } } }),
    transport: http('https://rpc2.monad.xyz'),
  })

  const block7  = curBlock > BigInt(BLOCKS_PER_7D)  ? curBlock - BigInt(BLOCKS_PER_7D)  : 0n
  const block14 = curBlock > BigInt(BLOCKS_PER_14D) ? curBlock - BigInt(BLOCKS_PER_14D) : 0n
  const block30 = curBlock > BigInt(BLOCKS_PER_30D) ? curBlock - BigInt(BLOCKS_PER_30D) : 0n

  // ── vUSD: ERC4626, 30d PPS window (6 decimals) ───────────────────────────────
  const [vNow, vPast30] = await Promise.all([
    client.readContract({ address: VUSD_ADDR, abi: OCA_ERC4626, functionName: 'convertToAssets', args: [1_000_000n] })
      .catch(() => null) as Promise<bigint | null>,
    histClient.readContract({ address: VUSD_ADDR, abi: OCA_ERC4626, functionName: 'convertToAssets', args: [1_000_000n], blockNumber: block30 })
      .catch(() => null) as Promise<bigint | null>,
  ])
  let vusdApy = 0
  if (vNow && vPast30 && vPast30 > 0n) {
    vusdApy = (Number(vNow - vPast30) / Number(vPast30)) * (365 / 30) * 100
    console.log(`[Curvance/OCA] vUSD: now=${vNow} past30=${vPast30} → APY=${vusdApy.toFixed(2)}%`)
  }

  // ── earnAUSD: Neverland oracle 7d price change + DUST rewards ─────────────────
  // Step 1: oracle price now vs 7d ago
  const [priceNow, price7] = await Promise.all([
    client.readContract({ address: NV_ORACLE as `0x${string}`, abi: OCA_ORACLE, functionName: 'getAssetPrice', args: [EARNASD_ADDR] })
      .catch(() => null) as Promise<bigint | null>,
    histClient.readContract({ address: NV_ORACLE as `0x${string}`, abi: OCA_ORACLE, functionName: 'getAssetPrice', args: [EARNASD_ADDR], blockNumber: block7 })
      .catch(() => null) as Promise<bigint | null>,
  ])
  const oracleApy = (priceNow && price7 && price7 > 0n)
    ? (Number(priceNow - price7) / Number(price7)) * (365 / 7) * 100
    : 0

  // Step 2: DUST rewards → need aToken address, then getRewardsData
  // getReserveTokensAddresses(earnAUSD underlying asset) — earnAUSD IS the aToken itself
  // earnAUSD underlying = AUSD (0x00000000efe302beaa2b3e6e1b18d08d69a9012a)
  const AUSD = '0x00000000efe302beaa2b3e6e1b18d08d69a9012a' as `0x${string}`
  let dustRewardApy = 0
  try {
    // getReserveTokensAddresses returns (aToken, stableDebtToken, variableDebtToken)
    const addrs = await client.readContract({
      address: NV_DP as `0x${string}`, abi: OCA_DP, functionName: 'getReserveTokensAddresses', args: [AUSD],
    }) as [`0x${string}`, `0x${string}`, `0x${string}`]
    const aToken = addrs[0]

    // getRewardsData(aToken, dustAddress) → (index, eps, lastUpdate, distribution_end)
    const [, eps] = await client.readContract({
      address: NV_REWARDS as `0x${string}`, abi: OCA_REWARDS, functionName: 'getRewardsData', args: [aToken, NV_DUST as `0x${string}`],
    }) as [bigint, bigint, bigint, bigint]

    // DUST price from USDC/DUST V2 pool reserves (reserve0=USDC 6dec, reserve1=DUST 18dec)
    const [r0, r1] = await client.readContract({
      address: NV_LP_DUST as `0x${string}`, abi: OCA_V2PAIR, functionName: 'getReserves',
    }) as [bigint, bigint, number]
    const dustPrice = r0 > 0n ? (Number(r0) / 1e6) / (Number(r1) / 1e18) : 0

    // earnAUSD TVL from reserve data (totalAToken = totalCollateral, in base units 8dec)
    const reserveData = await client.readContract({
      address: NV_DP as `0x${string}`, abi: OCA_DP, functionName: 'getReserveData', args: [AUSD],
    }) as unknown as bigint[]
    // reserveData[0] = totalAToken in underlying units (AUSD = 6 dec)
    const totalSupplyUsd = Number(reserveData[0]) / 1e6  // AUSD ≈ $1

    if (totalSupplyUsd > 0 && dustPrice > 0) {
      const epsPerSec = Number(eps) / 1e18   // DUST/sec
      dustRewardApy = (epsPerSec * SECS_PER_YEAR * dustPrice) / totalSupplyUsd * 100
    }
    console.log(`[Curvance/OCA] earnAUSD: oracle=${oracleApy.toFixed(2)}% dust=${dustRewardApy.toFixed(2)}% total=${(oracleApy+dustRewardApy).toFixed(2)}%`)
  } catch (e) {
    console.warn('[Curvance/OCA] earnAUSD DUST rewards failed:', e)
  }

  const earnAusdApy = oracleApy + dustRewardApy

  // ── YZM: ERC4626 convertToAssets 7d (6 decimals) ─────────────────────────────
  let yzmApy = 0
  try {
    const [yNow, yPast] = await Promise.all([
      client.readContract({ address: YZM_ADDR, abi: OCA_ERC4626, functionName: 'convertToAssets', args: [1_000_000n] }) as Promise<bigint>,
      histClient.readContract({ address: YZM_ADDR, abi: OCA_ERC4626, functionName: 'convertToAssets', args: [1_000_000n], blockNumber: block7 }) as Promise<bigint>,
    ])
    if (yPast > 0n) yzmApy = (Number(yNow - yPast) / Number(yPast)) * (365 / 7) * 100
    console.log(`[Curvance/OCA] YZM: now=${yNow} past7=${yPast} → APY=${yzmApy.toFixed(2)}%`)
  } catch (e) { console.warn('[Curvance/OCA] YZM failed:', e) }

  // ── syzUSD: oracle price change 14d via ProtocolReader ───────────────────────
  let syzusdApy = 0
  try {
    const [sNow] = await client.readContract({ address: READER, abi: OCA_PRICE, functionName: 'getPrice', args: [SYZUSD_ADDR, true, false] }) as [bigint, bigint]
    const [sPast] = await histClient.readContract({ address: READER, abi: OCA_PRICE, functionName: 'getPrice', args: [SYZUSD_ADDR, true, false], blockNumber: block14 }) as [bigint, bigint]
    if (sPast > 0n) syzusdApy = (Number(sNow - sPast) / Number(sPast)) * (365 / 14) * 100
    console.log(`[Curvance/OCA] syzUSD: now=${sNow} past14=${sPast} → APY=${syzusdApy.toFixed(2)}%`)
  } catch (e) { console.warn('[Curvance/OCA] syzUSD failed:', e) }

  // ── wsrUSD: oracle price change 7d via ProtocolReader ────────────────────────
  let wsrusdApy = 0
  try {
    const [wNow] = await client.readContract({ address: READER, abi: OCA_PRICE, functionName: 'getPrice', args: [WSRUSD_ADDR, true, false] }) as [bigint, bigint]
    const [wPast] = await histClient.readContract({ address: READER, abi: OCA_PRICE, functionName: 'getPrice', args: [WSRUSD_ADDR, true, false], blockNumber: block7 }) as [bigint, bigint]
    if (wPast > 0n) wsrusdApy = (Number(wNow - wPast) / Number(wPast)) * (365 / 7) * 100
    console.log(`[Curvance/OCA] wsrUSD: now=${wNow} past7=${wPast} → APY=${wsrusdApy.toFixed(2)}%`)
  } catch (e) { console.warn('[Curvance/OCA] wsrUSD failed:', e) }

  return {
    VUSD:     vusdApy,
    EARNAUSD: earnAusdApy,
    YZM:      yzmApy,
    SYZUSD:   syzusdApy,
    WSRUSD:   wsrusdApy,
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchCurvancePools(): Promise<(LendingPool | BorrowingPool)[]> {
  console.log('[Curvance] Fetching lending & borrowing pools...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Batch 1 (parallel): contract data + native APY + static pause flags + current block
  const [markets, nativeApyRes, staticRes, curBlock] = await Promise.all([
    client.readContract({
      address: READER,
      abi: DYNAMIC_ABI,
      functionName: 'getDynamicMarketData',
    }) as Promise<readonly DynMarket[]>,
    fetch('https://api.curvance.com/v1/monad/native_apy').then(r => r.json()) as Promise<{
      native_apy: { symbol: string; apy: number }[]
    }>,
    fetch('https://rpc.monad.xyz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: READER, data: '0x9c6d7ad4' }, 'latest'] }),
    }).then(r => r.json()).then((j: { result?: string }) => (j.result ?? '0x').slice(2)),
    client.getBlockNumber(),
  ])

  const staticHex: string = staticRes

  const nativeApyBase: Record<string, number> = Object.fromEntries(
    nativeApyRes.native_apy.map(x => [x.symbol.toUpperCase(), x.apy])
  )

  // Collect all cToken addresses across all markets
  const cTokens: `0x${string}`[] = markets.flatMap(m => m.tokens.map(t => t._address))

  // Batch 2 (parallel): asset() for each cToken + on-chain APY overrides
  const [assetResults, onChainApys] = await Promise.all([
    client.multicall({
      contracts: cTokens.map(addr => ({ address: addr, abi: ERC20_ABI, functionName: 'asset' as const })),
      allowFailure: true,
    }),
    fetchOnChainApys(client, curBlock).catch(e => {
      console.warn('[Curvance/OCA] fetchOnChainApys failed:', e)
      return {} as Record<string, number>
    }),
  ])

  const nativeApy: Record<string, number> = { ...nativeApyBase, ...onChainApys }

  const underlyings = assetResults.map(r =>
    r.status === 'success' ? r.result as `0x${string}` : null
  )

  // Batch 3 (parallel): symbol() + decimals() on underlying assets
  const [symResults, decResults] = await Promise.all([
    client.multicall({
      contracts: underlyings.map(u => ({
        address: u ?? FALLBACK_ADDR,
        abi: ERC20_ABI,
        functionName: 'symbol' as const,
      })),
      allowFailure: true,
    }),
    client.multicall({
      contracts: underlyings.map(u => ({
        address: u ?? FALLBACK_ADDR,
        abi: ERC20_ABI,
        functionName: 'decimals' as const,
      })),
      allowFailure: true,
    }),
  ])

  // Build token info: cToken addr (lowercase) → { symbol, decimals }
  const tokenInfo: Record<string, { symbol: string; decimals: number }> = {}
  cTokens.forEach((addr, i) => {
    tokenInfo[addr.toLowerCase()] = {
      symbol:   symResults[i].status === 'success' ? symResults[i].result as string : '?',
      decimals: decResults[i].status === 'success' ? Number(decResults[i].result)  : 18,
    }
  })

  const results: (LendingPool | BorrowingPool)[] = []
  const now = new Date().toISOString()

  // Borrow pools explicitly excluded (e.g. permanently paused). Currently none.
  const BORROW_EXCLUDED = new Set<string>([])

  for (const m of markets) {
    const [col, loan] = m.tokens
    if (!col || !loan) continue

    const colInfo  = tokenInfo[col._address.toLowerCase()]
    const loanInfo = tokenInfo[loan._address.toLowerCase()]
    if (!colInfo || !loanInfo || colInfo.symbol === '?' || loanInfo.symbol === '?') {
      console.warn(`[Curvance] Missing token info for market ${m._address}`)
      continue
    }

    // Skip empty markets (no liquidity on either side)
    if (col.liquidity === 0n && loan.liquidity === 0n && loan.debt === 0n) continue

    const colSym  = colInfo.symbol
    const loanSym = loanInfo.symbol
    const colDec  = colInfo.decimals
    const loanDec = loanInfo.decimals

    const colPrice  = Number(col.assetPrice)  / 1e18
    const loanPrice = Number(loan.assetPrice) / 1e18

    // TVL: col side (deposited collateral) + loan side (supplied + outstanding borrows)
    const colTvl   = Number(col.liquidity)  / 10 ** colDec  * colPrice
    const loanLiq  = Number(loan.liquidity) / 10 ** loanDec * loanPrice
    const loanDebt = Number(loan.debt)      / 10 ** loanDec * loanPrice
    const tvl      = colTvl + loanLiq + loanDebt

    // Rates: supplyRate / borrowRate are per-second scaled by 1e18
    const colSupRate  = Number(col.supplyRate)   / 1e18 * SECS_PER_YEAR * 100
    const loanSupRate = Number(loan.supplyRate)  / 1e18 * SECS_PER_YEAR * 100
    const colBorApr   = Number(col.borrowRate)   / 1e18 * SECS_PER_YEAR * 100  // borrow col using loan as collateral
    const loanBorApr  = Number(loan.borrowRate)  / 1e18 * SECS_PER_YEAR * 100  // borrow loan using col as collateral

    // utilizationRate: 1e18 = 100%
    const utilFrac = Number(loan.utilizationRate) / 1e18
    const utilPct  = utilFrac * 100

    // Curvance cToken symbols have a 'c' prefix (cgMON, cshMON, etc.)
    // Strip it to match the native_apy API which uses bare symbols (GMON, SHMON, etc.)
    const colBase   = colSym.startsWith('c') && colSym.length > 1 ? colSym.slice(1) : colSym
    const colNative = nativeApy[colBase.toUpperCase()] ?? 0

    const pairKey = `${colSym}/${loanSym}`
    const id = `curvance-${colSym.toLowerCase()}-${loanSym.toLowerCase()}`

    // depositApy = best yield available across all sources in this market:
    // - colNative: native staking yield on collateral (from Curvance native_apy API)
    // - colSupRate: col-side lending rate (near 0 for yield-bearing col, non-zero for WMON/WBTC col)
    // - loanSupRate: loan-side lending rate (dominant for active markets like sMON/WMON)
    const depositApy = Math.max(colNative, colSupRate, loanSupRate)

    console.log(
      `[Curvance] ${pairKey}: TVL=$${tvl.toFixed(0)}` +
      ` native=${colNative.toFixed(2)}% colSup=${colSupRate.toFixed(2)}% loanSup=${loanSupRate.toFixed(2)}%` +
      ` depositApy=${depositApy.toFixed(2)}% loanBor=${loanBorApr.toFixed(2)}% colBor=${colBorApr.toFixed(2)}% util=${utilPct.toFixed(1)}%`
    )

    // Pool capacity: check static pause flags (offset+7 = depositPaused, offset+11 = borrowPaused)
    const lendingFull     = cTokenFlag(staticHex, loan._address, 7)
    const loanBorrowFull  = cTokenFlag(staticHex, loan._address, 11)
    const colBorrowFull   = cTokenFlag(staticHex, col._address, 11)

    // For bidirectional markets, split TVL: main pool = loan-side, reverse pool = col-side
    const isBidir = colBorApr > 0
    results.push({
      id,
      protocol: 'Curvance',
      type: 'lending',
      tvl: isBidir ? loanLiq + loanDebt : tvl,
      volume_24h: 0,
      asset: pairKey,
      apy: depositApy,
      utilization: utilPct,
      risk_score: lendingRisk({ protocol: 'Curvance', tvl, utilization: utilFrac }),
      updated_at: now,
      status: lendingFull ? 'full' : 'active',
    })

    // Borrow loan token (using col as collateral) — e.g. borrow WBTC against eBTC
    if (loanBorApr > 0 && !BORROW_EXCLUDED.has(`${id}-borrow`)) {
      results.push({
        id: `${id}-borrow`,
        protocol: 'Curvance',
        type: 'borrowing',
        tvl: loanDebt,
        volume_24h: 0,
        asset: pairKey,
        apy: loanBorApr,
        utilization: utilPct,
        risk_score: borrowingRisk({ protocol: 'Curvance', tvl, utilization: utilFrac }),
        updated_at: now,
        status: loanBorrowFull ? 'full' : 'active',
      })
    }

    // Bidirectional markets: col-borrow pool + reverse lending pool
    const colDebt = Number(col.debt) / 10 ** colDec * colPrice
    const colUtilFrac = Number(col.utilizationRate) / 1e18
    if (colBorApr > 0) {
      // Borrow col token using loan as collateral (e.g. borrow eBTC against WBTC)
      results.push({
        id: `${id}-col-borrow`,
        protocol: 'Curvance',
        type: 'borrowing',
        tvl: colDebt,
        volume_24h: 0,
        asset: `${loanSym}/${colSym}`,  // col=loan, borrow=col
        apy: colBorApr,
        utilization: colUtilFrac * 100,
        risk_score: borrowingRisk({ protocol: 'Curvance', tvl, utilization: colUtilFrac }),
        updated_at: now,
        status: colBorrowFull ? 'full' : 'active',
      })

      // Reverse lending pool — deposit the col token as collateral (TVL = col-side deposits)
      const reverseId   = `curvance-${loanSym.toLowerCase()}-${colSym.toLowerCase()}`
      const loanBase    = loanSym.startsWith('c') && loanSym.length > 1 ? loanSym.slice(1) : loanSym
      const loanNative  = nativeApy[loanBase.toUpperCase()] ?? 0
      const reverseApy  = Math.max(loanNative, colSupRate)
      results.push({
        id: reverseId,
        protocol: 'Curvance',
        type: 'lending',
        tvl: colTvl,
        volume_24h: 0,
        asset: `${loanSym}/${colSym}`,
        apy: reverseApy,
        utilization: colUtilFrac * 100,
        risk_score: lendingRisk({ protocol: 'Curvance', tvl, utilization: colUtilFrac }),
        updated_at: now,
        status: colBorrowFull ? 'full' : 'active',
      })
    }
  }

  console.log(`[Curvance] Returning ${results.length} pools`)
  return results
}
