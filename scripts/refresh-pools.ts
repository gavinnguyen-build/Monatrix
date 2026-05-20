/**
 * Standalone pool refresh script — runs directly in GitHub Actions (no Vercel timeout).
 * Same logic as app/api/cron/route.ts but as a plain Node.js script.
 *
 * Usage: npx tsx scripts/refresh-pools.ts
 * Env vars required: MONAD_RPC_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { fetchCloberPools }              from '../lib/adapters/clober'
import { fetchKuruPools, fetchKuruVaultPools } from '../lib/adapters/kuru'
import { fetchMorphoPools }              from '../lib/adapters/morpho'
import { fetchUniswapPools }             from '../lib/adapters/uniswap'
import { fetchAprioriPools }             from '../lib/adapters/apriori'
import { fetchNeverlandPools }           from '../lib/adapters/neverland'
import { fetchCurvancePools }            from '../lib/adapters/curvance'
import { fetchFastlanePools }            from '../lib/adapters/fastlane'
import { fetchKintsuPools }              from '../lib/adapters/kintsu'
import { fetchMagmaPools }               from '../lib/adapters/magma'
import { fetchPancakeSwapPools }         from '../lib/adapters/pancakeswap'
import { createClient }                  from '@supabase/supabase-js'
import { toRow }                         from '../lib/normalize'
import type { Pool }                     from '../types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  console.log('[Cron] Starting pool refresh...')
  const start = Date.now()

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

  // Phase 1: REST-only adapters in parallel
  const [cloberResult, morphoResult] = await Promise.allSettled([
    fetchCloberPools(),
    fetchMorphoPools(),
  ])
  collect('Clober', cloberResult)
  collect('Morpho', morphoResult)

  // Phase 2: RPC-heavy adapters — sequential to stay under RPC rate limit
  for (const [name, fn] of [
    ['PancakeSwap', fetchPancakeSwapPools],
    ['Apriori',     fetchAprioriPools],
    ['Kuru',        fetchKuruPools],
    ['KuruVaults',  fetchKuruVaultPools],
    ['Uniswap',     fetchUniswapPools],
    ['Neverland',   fetchNeverlandPools],
    ['Curvance',    fetchCurvancePools],
    ['Fastlane',    fetchFastlanePools],
    ['Kintsu',      fetchKintsuPools],
    ['Magma',       fetchMagmaPools],
  ] as const) {
    collect(name, await Promise.allSettled([fn()]).then(r => r[0]))
  }

  if (pools.length === 0) {
    console.error('[Cron] All adapters failed — not updating Supabase')
    process.exit(1)
  }

  // Deduplicate by id
  const rowMap = new Map<string, ReturnType<typeof toRow>>()
  for (const pool of pools) rowMap.set(pool.id, toRow(pool))
  const rows = [...rowMap.values()]

  const { error } = await supabaseAdmin
    .from('pools')
    .upsert(rows, { onConflict: 'id' })

  if (error) {
    console.error('[Cron] Supabase upsert error:', error)
    process.exit(1)
  }

  // Persist exchange_rate for Apriori
  const aprioriPool = pools.find(p => p.id === 'apriori-aprmon') as { exchange_rate?: number } | undefined
  if (aprioriPool?.exchange_rate != null) {
    const { error: rateErr } = await supabaseAdmin
      .from('pools')
      .update({ exchange_rate: aprioriPool.exchange_rate } as never)
      .eq('id', 'apriori-aprmon')
    if (rateErr) console.warn('[Cron] exchange_rate update failed:', rateErr.message)
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[Cron] Done: ${pools.length} pools upserted in ${elapsed}s | errors: ${errors.length}`)
  if (errors.length > 0) console.error('[Cron] Errors:', errors)
}

main().catch(e => { console.error(e); process.exit(1) })
