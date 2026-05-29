'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Pool } from '@/types'
import { PoolPage } from '@/components/PoolPage'

export default function PoolDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string | undefined

  const [pool, setPool] = useState<Pool | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/pools/${encodeURIComponent(id)}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then(data => { setPool(data); setLoading(false) })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [id])

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

        {loading && <LoadingSkeleton />}
        {notFound && (
          <div className="text-center py-16">
            <p className="text-slate-400 text-sm">Pool not found.</p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-4 text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors"
            >
              Back to pools
            </button>
          </div>
        )}
        {pool && <PoolPage pool={pool} />}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 bg-[#1a2535] rounded-xl w-64" />
      <div className="h-20 bg-[#1a2535] rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-48 bg-[#1a2535] rounded-2xl" />
        <div className="h-48 bg-[#1a2535] rounded-2xl" />
      </div>
    </div>
  )
}
