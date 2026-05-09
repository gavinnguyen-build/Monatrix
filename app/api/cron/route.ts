import { NextRequest, NextResponse } from 'next/server'
import { fetchCloberPools } from '@/lib/adapters/clober'
import { fetchKuruPools, fetchKuruVaultPools } from '@/lib/adapters/kuru'
import { fetchMorphoPools } from '@/lib/adapters/morpho'
import { fetchUniswapPools } from '@/lib/adapters/uniswap'
import { fetchAprioriPools } from '@/lib/adapters/apriori'
import { fetchNeverlandPools } from '@/lib/adapters/neverland'
import { fetchCurvancePools } from '@/lib/adapters/curvance'
import { fetchFastlanePools } from '@/lib/adapters/fastlane'
import { fetchKintsuPools } from '@/lib/adapters/kintsu'
import { fetchMagmaPools } from '@/lib/adapters/magma'
import { fetchPancakeSwapPools } from '@/lib/adapters/pancakeswap'
import { supabaseAdmin } from '@/lib/supabase'
import { toRow } from '@/lib/normalize'
import type { Pool } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Support both local curl (x-cron-secret) and Vercel Cron (Authorization: Bearer)
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Starting pool refresh...')

  // REST-only adapters run in parallel (no RPC calls, no rate limit risk)
  // RPC-heavy adapters run sequentially after to avoid exceeding 25 req/s on QuickNode
  const errors: string[] = []
  const pools: Pool[] = []

  function collect(name: string, result: PromiseSettledResult<Pool[]>) {
    if (result.status === 'fulfilled') {
      pools.push(...result.value)
    } else {
      const msg = `${name}: ${result.reason}`
      console.error('[Cron] Adapter failed —', msg)
      errors.push(msg)
    }
  }

  // Phase 1: REST-only adapters (no RPC calls)
  const [cloberResult, morphoResult, pancakeResult] = await Promise.allSettled([
    fetchCloberPools(),
    fetchMorphoPools(),
    fetchPancakeSwapPools(),
  ])
  collect('Clober', cloberResult)
  collect('Morpho', morphoResult)
  collect('PancakeSwap', pancakeResult)

  // Phase 2: RPC-heavy adapters — sequential to stay under RPC rate limit
  // Uniswap now makes RPC calls (tick bitmap TVL) so it runs here too
  for (const [name, fn] of [
    ['Apriori', fetchAprioriPools],
    ['Uniswap', fetchUniswapPools],
    ['Kuru', fetchKuruPools],
    ['KuruVaults', fetchKuruVaultPools],
    ['Neverland', fetchNeverlandPools],
    ['Curvance', fetchCurvancePools],
    ['Fastlane', fetchFastlanePools],
    ['Kintsu', fetchKintsuPools],
    ['Magma', fetchMagmaPools],
  ] as const) {
    collect(name, await Promise.allSettled([fn()]).then(r => r[0]))
  }

  if (pools.length === 0) {
    console.error('[Cron] All adapters failed — not updating Supabase')
    return NextResponse.json({ error: 'No data fetched' }, { status: 500 })
  }

  const rows = pools.map(toRow)
  const { error } = await supabaseAdmin
    .from('pools')
    .upsert(rows, { onConflict: 'id' })

  if (error) {
    console.error('[Cron] Supabase upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Persist exchange_rate for Apriori separately (column may not exist on first deploy;
  // run migration.sql to add it: ALTER TABLE pools ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC)
  const aprioriPool = pools.find(p => p.id === 'apriori-aprmon') as { exchange_rate?: number } | undefined
  if (aprioriPool?.exchange_rate != null) {
    const { error: rateErr } = await supabaseAdmin
      .from('pools')
      .update({ exchange_rate: aprioriPool.exchange_rate } as never)
      .eq('id', 'apriori-aprmon')
    if (rateErr) console.warn('[Cron] exchange_rate update failed (run migration.sql):', rateErr.message)
    else console.log(`[Cron] Stored exchange_rate=${aprioriPool.exchange_rate.toFixed(6)} for apriori-aprmon`)
  }

  console.log(`[Cron] Upserted ${pools.length} pools`)

  // Note: stale pool deletion removed — auto-deleting production data from a cron job is risky.
  // Pool IDs are deterministic; if a pool needs to be removed, do it manually via Supabase dashboard.

  return NextResponse.json({ ok: true, count: pools.length, pools: pools.map(p => p.id), errors })
}
