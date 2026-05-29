import type { Pool, PoolRow } from '@/types'

export function toRow(pool: Pool): PoolRow {
  const base: PoolRow = {
    id: pool.id,
    protocol: pool.protocol,
    type: pool.type,
    tvl: pool.tvl,
    volume_24h: pool.volume_24h,
    risk_score: pool.risk_score,
    asset: null,
    apy: null,
    utilization: null,
    lock_period: null,
    token0: null,
    token1: null,
    fee_tier: null,
    fee_apr: null,
    reward_apr: null,
    total_apr: null,
    in_range: null,
    il_risk: null,
    updated_at: pool.updated_at,
    status: pool.status ?? 'active',
    contract_address: pool.contract_address ?? null,
  }

  if (pool.type === 'lending' || pool.type === 'borrowing') {
    return { ...base, asset: pool.asset, apy: pool.apy, utilization: pool.utilization }
  }

  if (pool.type === 'staking' || pool.type === 'liquid_staking') {
    return { ...base, asset: pool.asset, apy: pool.apy, lock_period: pool.lock_period }
  }

  // lp
  return {
    ...base,
    token0: pool.token0,
    token1: pool.token1,
    fee_tier: pool.fee_tier,
    fee_apr: pool.fee_apr,
    reward_apr: pool.reward_apr,
    total_apr: pool.total_apr,
    in_range: pool.in_range,
    il_risk: pool.il_risk,
  }
}

export function fromRow(row: PoolRow): Pool {
  const status = (row.status === 'full' ? 'full' : 'active') as 'active' | 'full'

  if (row.type === 'lending' || row.type === 'borrowing') {
    return {
      id: row.id,
      protocol: row.protocol,
      type: row.type,
      tvl: row.tvl ?? 0,
      volume_24h: row.volume_24h ?? 0,
      risk_score: row.risk_score ?? 5,
      updated_at: row.updated_at,
      status,
      contract_address: row.contract_address ?? undefined,
      asset: row.asset ?? '',
      apy: row.apy ?? 0,
      utilization: row.utilization ?? 0,
    }
  }

  if (row.type === 'staking' || row.type === 'liquid_staking') {
    return {
      id: row.id,
      protocol: row.protocol,
      type: row.type as 'staking' | 'liquid_staking',
      tvl: row.tvl ?? 0,
      volume_24h: row.volume_24h ?? 0,
      risk_score: row.risk_score ?? 5,
      updated_at: row.updated_at,
      status,
      contract_address: row.contract_address ?? undefined,
      asset: row.asset ?? '',
      apy: row.apy ?? 0,
      lock_period: row.lock_period ?? null,
    } as Pool
  }

  return {
    id: row.id,
    protocol: row.protocol,
    type: 'lp',
    tvl: row.tvl ?? 0,
    volume_24h: row.volume_24h ?? 0,
    risk_score: row.risk_score ?? 5,
    updated_at: row.updated_at,
    status,
    contract_address: row.contract_address ?? undefined,
    token0: row.token0 ?? '',
    token1: row.token1 ?? '',
    fee_tier: row.fee_tier ?? 0,
    fee_apr: row.fee_apr ?? 0,
    reward_apr: row.reward_apr ?? 0,
    total_apr: row.total_apr ?? 0,
    in_range: row.in_range ?? true,
    il_risk: (row.il_risk as 'low' | 'medium' | 'high') ?? 'medium',
  }
}
