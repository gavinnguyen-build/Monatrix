import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fromRow } from '@/lib/normalize'
import type { PoolRow } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('pools')
    .select('*')
    .order('tvl', { ascending: false })

  if (error) {
    console.error('[API/pools] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pools = (data as PoolRow[]).map(fromRow)
  return NextResponse.json(pools, {
    headers: {
      // Cache at CDN for 5 min — reduces DB hits without stale data risk
      'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
    },
  })
}
