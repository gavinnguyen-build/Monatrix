'use client'

import { useRouter } from 'next/navigation'
import { PoolPage } from '@/components/PoolPage'
import type { Pool } from '@/types'

export default function PoolDetailClient({ pool }: { pool: Pool }) {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
        >
          ← Pools
        </button>
        <PoolPage pool={pool} />
      </div>
    </div>
  )
}
