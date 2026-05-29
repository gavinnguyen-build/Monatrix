import { permanentRedirect, notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fromRow } from '@/lib/normalize'
import { buildPoolUrl } from '@/lib/url'
import PoolDetailClient from '@/components/PoolDetailClient'
import type { PoolRow } from '@/types'

export const dynamic = 'force-dynamic'

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data } = await supabase
    .from('pools')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) return notFound()

  const pool = fromRow(data as PoolRow)

  // Redirect to canonical URL if contract_address is available
  if ((data as PoolRow).contract_address) {
    permanentRedirect(buildPoolUrl(pool))
  }

  return <PoolDetailClient pool={pool} />
}
