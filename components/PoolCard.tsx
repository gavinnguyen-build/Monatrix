import type { Pool, LPPool, LendingPool, StakingPool } from '@/types'
import { ILWarning } from './ILWarning'
import { RiskBadge } from './RiskBadge'

interface PoolCardProps {
  pool: Pool
}

function formatApr(value: number): string {
  return value > 0 ? `${value.toFixed(2)}%` : '—'
}

function formatTvl(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PoolCard({ pool }: PoolCardProps) {
  const isLP = pool.type === 'lp'
  const lpPool = pool as LPPool
  const otherPool = pool as LendingPool | StakingPool

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 hover:border-purple-500/40 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{pool.protocol}</p>
          <h3 className="font-semibold text-white">
            {isLP
              ? `${lpPool.token0}/${lpPool.token1}`
              : otherPool.asset}
          </h3>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
            {pool.type.toUpperCase()}
          </span>
        </div>
        <RiskBadge score={pool.risk_score} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <p className="text-xs text-gray-500">TVL</p>
          <p className="text-sm font-medium text-white">{formatTvl(pool.tvl)}</p>
        </div>

        {isLP ? (
          <>
            <div>
              <p className="text-xs text-gray-500">Fee APR</p>
              <p className="text-sm font-medium text-green-400">{formatApr(lpPool.fee_apr)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total APR</p>
              <p className="text-sm font-bold text-green-400">{formatApr(lpPool.total_apr)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">IL Risk</p>
              <p className={`text-sm font-medium capitalize ${
                lpPool.il_risk === 'low' ? 'text-green-400' :
                lpPool.il_risk === 'medium' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {lpPool.il_risk}
              </p>
            </div>
          </>
        ) : (
          <div>
            <p className="text-xs text-gray-500">APY</p>
            <p className="text-sm font-bold text-green-400">{formatApr(otherPool.apy)}</p>
          </div>
        )}
      </div>

      {/* IL Warning */}
      {isLP && lpPool.il_risk !== 'low' && (
        <div className="mt-3">
          <ILWarning ilRisk={lpPool.il_risk} />
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-gray-800/60 text-xs text-gray-600">
        Updated {new Date(pool.updated_at).toLocaleString()}
      </div>
    </div>
  )
}
