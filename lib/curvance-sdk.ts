'use client'

import { setupChain } from 'curvance'
import type { Market } from 'curvance'
import type { CToken } from 'curvance'
import type { BorrowableCToken } from 'curvance'
import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { useConnectorClient } from 'wagmi'
import { useMemo, useEffect, useState } from 'react'

// ── wagmi walletClient → ethers v6 JsonRpcSigner ──────────────────────────────
// Standard adapter pattern per wagmi docs.
export function clientToSigner(client: any): JsonRpcSigner {
  const { account, chain, transport } = client
  const provider = new BrowserProvider(transport, { chainId: chain.id, name: chain.name })
  return new JsonRpcSigner(provider, account.address)
}

export function useEthersSigner() {
  const { data: client } = useConnectorClient()
  return useMemo(() => (client ? clientToSigner(client) : undefined), [client])
}

// ── Market cache (per signer address) ─────────────────────────────────────────
// setupChain does 1-3 RPC calls — cache per signer to avoid re-calling on every render.
let _markets: Market[] | null = null
let _cacheAddr: string | null = null

async function getMarkets(signer: JsonRpcSigner): Promise<Market[]> {
  const addr = signer.address.toLowerCase()
  if (_cacheAddr === addr && _markets) return _markets
  const { markets } = await setupChain('monad-mainnet', signer)
  _markets = markets
  _cacheAddr = addr
  return markets
}

// ── useCurvanceLending ─────────────────────────────────────────────────────────
// Finds a CToken by its cToken address across all markets, then loads user data.
// Used by CurvanceLendingFlow (deposit + withdraw collateral).
export type CurvanceLendingState = {
  token: CToken | null
  market: Market | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useCurvanceLending(colCTokenAddr: string): CurvanceLendingState {
  const signer = useEthersSigner()
  const [refreshKey, setRefreshKey] = useState(0)
  const [inner, setInner] = useState<Omit<CurvanceLendingState, 'refresh'>>({
    token: null, market: null, loading: false, error: null,
  })

  useEffect(() => {
    if (!signer) {
      setInner({ token: null, market: null, loading: false, error: null })
      return
    }
    setInner(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      const markets = await getMarkets(signer)
      for (const market of markets) {
        const token = market.tokens.find(
          t => t.address.toLowerCase() === colCTokenAddr.toLowerCase()
        )
        if (token) {
          await market.reloadUserData(signer.address as `0x${string}`)
          setInner({ token: token as CToken, market, loading: false, error: null })
          return
        }
      }
      setInner({ token: null, market: null, loading: false, error: 'Token not found in any Curvance market' })
    })().catch(err => setInner(s => ({ ...s, loading: false, error: (err as Error).message ?? 'Unknown error' })))
  }, [signer?.address, colCTokenAddr, refreshKey])

  return { ...inner, refresh: () => setRefreshKey(k => k + 1) }
}

// ── useCurvanceBorrow ──────────────────────────────────────────────────────────
// Finds colToken + loanToken in the same market, loads user data.
// Used by CurvanceBorrowFlow.
export type CurvanceBorrowState = {
  colToken: CToken | null
  loanToken: BorrowableCToken | null
  market: Market | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useCurvanceBorrow(colCTokenAddr: string, loanCTokenAddr: string): CurvanceBorrowState {
  const signer = useEthersSigner()
  const [refreshKey, setRefreshKey] = useState(0)
  const [inner, setInner] = useState<Omit<CurvanceBorrowState, 'refresh'>>({
    colToken: null, loanToken: null, market: null, loading: false, error: null,
  })

  useEffect(() => {
    if (!signer) {
      setInner({ colToken: null, loanToken: null, market: null, loading: false, error: null })
      return
    }
    setInner(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      const markets = await getMarkets(signer)
      for (const market of markets) {
        const colToken = market.tokens.find(
          t => t.address.toLowerCase() === colCTokenAddr.toLowerCase()
        )
        if (colToken) {
          await market.reloadUserData(signer.address as `0x${string}`)
          const loanToken = market.tokens.find(
            t => t.address.toLowerCase() === loanCTokenAddr.toLowerCase()
          )
          setInner({
            colToken: colToken as CToken,
            loanToken: loanToken ? (loanToken as BorrowableCToken) : null,
            market,
            loading: false,
            error: loanToken ? null : `Loan token not found in market "${market.name}"`,
          })
          return
        }
      }
      setInner({ colToken: null, loanToken: null, market: null, loading: false, error: 'Curvance market not found' })
    })().catch(err => setInner(s => ({ ...s, loading: false, error: (err as Error).message ?? 'Unknown error' })))
  }, [signer?.address, colCTokenAddr, loanCTokenAddr, refreshKey])

  return { ...inner, refresh: () => setRefreshKey(k => k + 1) }
}
