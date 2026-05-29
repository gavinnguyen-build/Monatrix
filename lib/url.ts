import type { Pool } from '@/types'

export function categoryFromType(type: string): string {
  if (type === 'lp') return 'lp'
  if (type === 'liquid_staking' || type === 'staking') return 'lst'
  return 'lending'  // lending or borrowing
}

// "PancakeSwap" / "PancakeSwap V3" → "pancakeswap"
// "Uniswap V4" → "uniswap"
// rule: lowercase → strip trailing version → collapse spaces
export function normalizeProtocol(protocol: string): string {
  return protocol
    .toLowerCase()
    .replace(/\s+v\d+$/i, '')
    .replace(/\s+/g, '')
}

export function buildPoolUrl(pool: Pool): string {
  if (!pool.contract_address) return `/pools/${pool.id}`
  const category = categoryFromType(pool.type)
  const proto = normalizeProtocol(pool.protocol)
  return `/${category}/${proto}/${pool.contract_address}`
}
