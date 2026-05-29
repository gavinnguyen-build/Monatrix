import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fromRow } from '@/lib/normalize'
import { categoryFromType } from '@/lib/url'
import PoolDetailClient from '@/components/PoolDetailClient'
import type { PoolRow } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = new Set(['lp', 'lst', 'lending'])

export default async function CategoryPoolPage({
  params,
}: {
  params: Promise<{ category: string; protocol: string; contract: string }>
}) {
  const { category, protocol, contract } = await params

  if (!VALID_CATEGORIES.has(category)) return notFound()

  const { data } = await supabase
    .from('pools')
    .select('*')
    .eq('contract_address', contract)
    .ilike('protocol', `${protocol}%`)
    .limit(1)
    .maybeSingle()

  if (!data) return notFound()

  const pool = fromRow(data as PoolRow)

  // Verify the category in the URL matches the pool's actual type
  if (categoryFromType(pool.type) !== category) return notFound()

  return <PoolDetailClient pool={pool} />
}
