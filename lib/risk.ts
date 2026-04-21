// Risk scoring: 1=Low, 2=Medium, 3=High, 4=Very High
// Final score = max of all applicable dimensions (one High = whole pool is High)

export type RiskLevel = 1 | 2 | 3 | 4

// ─── Protocol risk (manual, based on audit/age/track record) ─────────────────
const PROTOCOL_RISK: Record<string, RiskLevel> = {
  Clober:       1, // open source orderbook, battle-tested design
  Morpho:       1, // well-audited, $1B+ TVL on other chains
  PancakeSwap:  1, // audited, $1B+ TVL across chains, battle-tested V3
  Uniswap:      1, // audited, $100B+ TVL historically, battle-tested V2/V3/V4
  Kuru:         2, // hybrid AMM/CLOB, upgradeable contracts, newer
  Curvance:     2, // isolated pair lending, audited but newer on Monad
  Neverland:    2, // Aave V3 fork on Monad, newer protocol
  Apriori:      2, // staking, newer protocol, limited track record
  Fastlane:     2, // limited public audit info
  Kintsu:       2, // liquid staking on Monad, newer protocol
  Magma:        2, // liquid staking on Monad, newer protocol
  Pinot:        2,
}

function protocolRisk(protocol: string): RiskLevel {
  return PROTOCOL_RISK[protocol] ?? 3 // unknown protocol → High by default
}

// ─── Shared dimensions ────────────────────────────────────────────────────────
function tvlRisk(tvl: number): RiskLevel {
  if (tvl >= 500_000) return 1
  if (tvl >= 50_000)  return 2
  return 3
}

// ─── LP-specific ──────────────────────────────────────────────────────────────
const STABLES = new Set(['USDC', 'USDT', 'AUSD', 'USD1', 'DAI', 'USDS'])

function ilRisk(token0: string, token1: string): RiskLevel {
  const s0 = STABLES.has(token0.toUpperCase())
  const s1 = STABLES.has(token1.toUpperCase())
  if (s0 && s1) return 1
  if (s0 || s1) return 2
  return 3
}

function volTvlRisk(vol24h: number, tvl: number): RiskLevel {
  if (tvl === 0) return 3
  const ratio = vol24h / tvl
  if (ratio >= 0.1 && ratio <= 5) return 1   // healthy utilization
  if (ratio > 5 && ratio <= 20)   return 2   // elevated but plausible
  if (ratio > 20)                 return 3   // suspiciously thin pool
  return 2                                    // < 0.1x — stagnant
}

export function lpRisk(params: {
  protocol: string
  token0: string
  token1: string
  tvl: number
  vol24h: number
}): RiskLevel {
  return Math.max(
    protocolRisk(params.protocol),
    tvlRisk(params.tvl),
    ilRisk(params.token0, params.token1),
    volTvlRisk(params.vol24h, params.tvl),
  ) as RiskLevel
}

// ─── Lending-specific ─────────────────────────────────────────────────────────
function utilizationRisk(utilization: number): RiskLevel {
  // utilization is 0–1 (e.g. 0.85 = 85%)
  if (utilization < 0.70) return 1
  if (utilization < 0.90) return 2
  return 4 // >90% → Very High: withdrawals may be delayed
}

export function lendingRisk(params: {
  protocol: string
  tvl: number
  utilization: number
}): RiskLevel {
  return Math.max(
    protocolRisk(params.protocol),
    tvlRisk(params.tvl),
    utilizationRisk(params.utilization),
  ) as RiskLevel
}

// ─── Borrowing-specific ───────────────────────────────────────────────────────
export function borrowingRisk(params: {
  protocol: string
  tvl: number
  utilization: number
}): RiskLevel {
  // High utilization = good for borrowers (liquid market) but also higher rate volatility
  return Math.max(
    protocolRisk(params.protocol),
    tvlRisk(params.tvl),
    utilizationRisk(params.utilization),
  ) as RiskLevel
}

// ─── Staking-specific ─────────────────────────────────────────────────────────
function lockRisk(lockDays: number | null): RiskLevel {
  if (lockDays === null || lockDays === 0) return 1
  if (lockDays < 30) return 2
  return 3
}

export function stakingRisk(params: {
  protocol: string
  tvl: number
  lockDays: number | null
}): RiskLevel {
  return Math.max(
    protocolRisk(params.protocol),
    tvlRisk(params.tvl),
    lockRisk(params.lockDays),
  ) as RiskLevel
}
