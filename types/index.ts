export interface BasePool {
  id: string
  protocol: string
  type: 'lending' | 'borrowing' | 'staking' | 'liquid_staking' | 'lp'
  tvl: number
  volume_24h: number
  risk_score: number
  updated_at: string
  status?: 'active' | 'full'
}

export interface LendingPool extends BasePool {
  type: 'lending'
  asset: string
  apy: number
  utilization: number
}

// Borrow rate paid by borrowers (same fields as LendingPool, apy = borrow APY)
export interface BorrowingPool extends BasePool {
  type: 'borrowing'
  asset: string
  apy: number
  utilization: number
}

export interface StakingPool extends BasePool {
  type: 'staking'
  asset: string
  apy: number
  lock_period: number | null
}

// Liquid staking: no lock, receive a receipt token (e.g. stMON, sMON)
export interface LiquidStakingPool extends BasePool {
  type: 'liquid_staking'
  asset: string
  apy: number
  lock_period: null
  // exchange_rate: stored separately in DB for protocols without a DefiLlama APY feed.
  // Used to compute APY from rate change across cron runs (e.g. Apriori aprMON).
  exchange_rate?: number
}

export interface LPPool extends BasePool {
  type: 'lp'
  token0: string
  token1: string
  fee_tier: number
  fee_apr: number
  reward_apr: number
  total_apr: number
  in_range: boolean
  il_risk: 'low' | 'medium' | 'high'
}

export type Pool = LendingPool | BorrowingPool | StakingPool | LiquidStakingPool | LPPool

export interface UserPosition {
  pool_id: string
  wallet: string
  amount_usd: number
  entry_date: string
  token0_amount?: number
  token1_amount?: number
}

export interface PoolRow {
  id: string
  protocol: string
  type: string
  tvl: number | null
  volume_24h: number | null
  risk_score: number | null
  asset: string | null
  apy: number | null
  utilization: number | null
  lock_period: number | null
  token0: string | null
  token1: string | null
  fee_tier: number | null
  fee_apr: number | null
  reward_apr: number | null
  total_apr: number | null
  in_range: boolean | null
  il_risk: string | null
  updated_at: string
  status: string | null
}
