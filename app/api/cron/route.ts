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

  // Phase 1: REST-only adapters (no RPC calls, no GeckoTerminal)
  const [cloberResult, morphoResult] = await Promise.allSettled([
    fetchCloberPools(),
    fetchMorphoPools(),
  ])
  collect('Clober', cloberResult)
  collect('Morpho', morphoResult)

  // Phase 2: RPC-heavy adapters — sequential to stay under RPC rate limit
  // PancakeSwap runs first (uses GeckoTerminal), then Uniswap (also uses GeckoTerminal)
  // with natural spacing from RPC calls between them to avoid GeckoTerminal 429
  // PancakeSwap runs first (uses GeckoTerminal ~5 requests with 3s delays → last at ~t=12s).
  // Kuru + KuruVaults run next (RPC-heavy, ~30s total), pushing Uniswap's GeckoTerminal
  // requests to ~t=55s after PancakeSwap's last page — well outside the 30s rate limit window.
  for (const [name, fn] of [
    ['PancakeSwap', fetchPancakeSwapPools],
    ['Apriori', fetchAprioriPools],
    ['Kuru', fetchKuruPools],
    ['KuruVaults', fetchKuruVaultPools],
    ['Uniswap', fetchUniswapPools],
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

  // Deduplicate by id — last-write wins (handles duplicate IDs across adapters or pages)
  const rowMap = new Map<string, ReturnType<typeof toRow>>()
  for (const pool of pools) rowMap.set(pool.id, toRow(pool))
  const rows = [...rowMap.values()]
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

  // Delete stale pools not in this run's result set.
  // ID-based (not timestamp-based) so it's immune to race conditions with
  // other cron instances (e.g. Vercel prod) writing at the same time.
  // Guard: only delete if we fetched enough data — prevents mass deletion when adapters fail.
  if (rows.length >= 100) {
    const freshIds = rows.map(r => r.id)

    // Fetch all current IDs from DB, then delete the ones not in freshIds
    const { data: currentRows } = await supabaseAdmin.from('pools').select('id')
    const staleIds = (currentRows ?? [])
      .map(r => r.id as string)
      .filter(id => !freshIds.includes(id))

    if (staleIds.length > 0) {
      const { error: deleteError, count: deleted } = await supabaseAdmin
        .from('pools')
        .delete({ count: 'exact' })
        .in('id', staleIds)
      if (deleteError) console.warn('[Cron] Stale pool cleanup failed:', deleteError.message)
      else console.log(`[Cron] Deleted ${deleted} stale pools (${staleIds.join(', ')})`)
    } else {
      console.log('[Cron] No stale pools to delete')
    }
  }

  return NextResponse.json({ ok: true, count: pools.length, pools: pools.map(p => p.id), errors })
}
