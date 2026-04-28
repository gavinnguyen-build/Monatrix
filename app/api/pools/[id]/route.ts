import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fromRow } from '@/lib/normalize'
import type { PoolRow } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabase
    .from('pools')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  const pool = fromRow(data as PoolRow)
  return NextResponse.json(pool)
}
