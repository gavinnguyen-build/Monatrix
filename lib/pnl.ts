import type { LPPool, LendingPool, StakingPool } from '@/types'

// Calculate estimated PnL for an LP position
// Uses the basic IL formula: IL = 2*sqrt(k) / (1+k) - 1, where k = priceRatio
export function calcIL(priceChangeRatio: number): number {
  const k = priceChangeRatio
  return (2 * Math.sqrt(k)) / (1 + k) - 1
}

export interface PnLResult {
  feeEarnings: number
  ilLoss: number
  netPnL: number
  netPnLPct: number
}

export function calcLPPnL(
  pool: LPPool,
  principal: number,
  daysHeld: number
): PnLResult {
  const feeEarnings = (principal * (pool.fee_apr / 100) * daysHeld) / 365
  // If in_range, full fee accrual. If out of range, no fees
  const effectiveFees = pool.in_range ? feeEarnings : 0
  return {
    feeEarnings: effectiveFees,
    ilLoss: 0, // IL requires price data from oracle — calculated separately
    netPnL: effectiveFees,
    netPnLPct: principal > 0 ? (effectiveFees / principal) * 100 : 0,
  }
}

export function calcLendingPnL(
  pool: LendingPool,
  principal: number,
  daysHeld: number
): PnLResult {
  const earnings = (principal * (pool.apy / 100) * daysHeld) / 365
  return {
    feeEarnings: earnings,
    ilLoss: 0,
    netPnL: earnings,
    netPnLPct: principal > 0 ? (earnings / principal) * 100 : 0,
  }
}

export function calcStakingPnL(
  pool: StakingPool,
  principal: number,
  daysHeld: number
): PnLResult {
  const earnings = (principal * (pool.apy / 100) * daysHeld) / 365
  return {
    feeEarnings: earnings,
    ilLoss: 0,
    netPnL: earnings,
    netPnLPct: principal > 0 ? (earnings / principal) * 100 : 0,
  }
}
