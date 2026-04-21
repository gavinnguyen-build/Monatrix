import type { LendingPool, BorrowingPool } from '@/types'
import { lendingRisk, borrowingRisk } from '@/lib/risk'
import { createPublicClient, http, defineChain } from 'viem'

// ─── Chain ─────────────────────────────────────────────────────────────────────
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

// ─── Contracts ─────────────────────────────────────────────────────────────────
const READER = '0x878cDfc2F3D96a49A5CbD805FAF4F3080768a6d2' as const
const FALLBACK_ADDR = '0x0000000000000000000000000000000000000001' as `0x${string}`
const SECS_PER_YEAR = 31_536_000

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

// ─── Main ──────────────────────────────────────────────────────────────────────
export async function fetchCurvancePools(): Promise<(LendingPool | BorrowingPool)[]> {
  console.log('[Curvance] Fetching lending & borrowing pools...')

  const client = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

  // Batch 1 (parallel): contract data + native APY + static pause flags
  const [markets, nativeApyRes, staticRes] = await Promise.all([
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
  ])

  const staticHex: string = staticRes

  const nativeApy: Record<string, number> = Object.fromEntries(
    nativeApyRes.native_apy.map(x => [x.symbol.toUpperCase(), x.apy])
  )

  // Collect all cToken addresses across all markets
  const cTokens: `0x${string}`[] = markets.flatMap(m => m.tokens.map(t => t._address))

  // Batch 2: asset() for each cToken → get underlying asset addresses
  const assetResults = await client.multicall({
    contracts: cTokens.map(addr => ({ address: addr, abi: ERC20_ABI, functionName: 'asset' as const })),
    allowFailure: true,
  })
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

  for (const m of markets) {
    const [col, loan] = m.tokens
    if (!col || !loan) continue

    const colInfo  = tokenInfo[col._address.toLowerCase()]
    const loanInfo = tokenInfo[loan._address.toLowerCase()]
    if (!colInfo || !loanInfo || colInfo.symbol === '?' || loanInfo.symbol === '?') {
      console.warn(`[Curvance] Missing token info for market ${m._address}`)
      continue
    }

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
    const supApr = Number(loan.supplyRate)  / 1e18 * SECS_PER_YEAR * 100
    const borApr = Number(loan.borrowRate)  / 1e18 * SECS_PER_YEAR * 100

    // utilizationRate: 1e18 = 100%
    const utilFrac = Number(loan.utilizationRate) / 1e18
    const utilPct  = utilFrac * 100

    // Deposit APY: max of collateral native yield and loan supply APR
    const colNative  = nativeApy[colSym.toUpperCase()] ?? 0
    const depositApy = Math.max(colNative, supApr)

    const pairKey = `${colSym}/${loanSym}`
    const id = `curvance-${colSym.toLowerCase()}-${loanSym.toLowerCase()}`

    console.log(
      `[Curvance] ${pairKey}: TVL=$${tvl.toFixed(0)}` +
      ` native=${colNative.toFixed(2)}% supApr=${supApr.toFixed(2)}%` +
      ` depositApy=${depositApy.toFixed(2)}% borApr=${borApr.toFixed(2)}%` +
      ` util=${utilPct.toFixed(1)}%`
    )

    // Pool capacity: check static pause flags (offset+7 = depositPaused, offset+11 = borrowPaused)
    const lendingFull = cTokenFlag(staticHex, loan._address, 7)
    const borrowFull  = cTokenFlag(staticHex, loan._address, 11)

    // Lending pool (supply side — deposit loanSym, earn interest)
    results.push({
      id,
      protocol: 'Curvance',
      type: 'lending',
      tvl,
      volume_24h: 0,
      asset: pairKey,
      apy: depositApy,
      utilization: utilPct,
      risk_score: lendingRisk({ protocol: 'Curvance', tvl, utilization: utilFrac }),
      updated_at: now,
      status: lendingFull ? 'full' : 'active',
    })

    // Borrowing pool (borrow side)
    if (borApr > 0) {
      results.push({
        id: `${id}-borrow`,
        protocol: 'Curvance',
        type: 'borrowing',
        tvl: loanDebt,
        volume_24h: 0,
        asset: pairKey,
        apy: borApr,
        utilization: utilPct,
        risk_score: borrowingRisk({ protocol: 'Curvance', tvl, utilization: utilFrac }),
        updated_at: now,
        status: borrowFull ? 'full' : 'active',
      })
    }
  }

  console.log(`[Curvance] Returning ${results.length} pools`)
  return results
}
