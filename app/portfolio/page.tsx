'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useDisconnect, useReadContracts, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useRouter } from 'next/navigation'
import { ConnectModal } from '@/components/WalletButton'
import { fetchPortfolio, type Position, type TokenAmount } from '@/lib/portfolio'
import { saveV4TokenId, loadV4TokenIds } from '@/lib/v4positions'
import { NEVERLAND_DATA_PROVIDER, NEVERLAND_DUST_REWARDS } from '@/lib/contracts'

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  const abs = Math.abs(n)
  const s = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M`
          : abs >= 1_000     ? `$${(abs / 1_000).toFixed(2)}K`
          : `$${abs.toFixed(2)}`
  return n < 0 ? `-${s}` : s
}

function fmtTokenAmt(amount: number, sym: string): string {
  const abs = Math.abs(amount)
  const dec = abs === 0 ? 4 : abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8
  return `${abs.toLocaleString('en-US', { maximumFractionDigits: dec })} ${sym}`
}

function fmtRewardUsd(usd: number): string {
  return usd < 0.01 ? '(<$0.01)' : `(${fmtUsd(usd)})`
}

const PROTOCOL_COLOR: Record<string, string> = {
  Magma:       'bg-orange-500/10  text-orange-400   border-orange-500/20',
  Fastlane:    'bg-blue-500/10    text-blue-400     border-blue-500/20',
  Kintsu:      'bg-cyan-500/10    text-cyan-400     border-cyan-500/20',
  Apriori:     'bg-violet-500/10  text-violet-400   border-violet-500/20',
  Morpho:      'bg-sky-500/10     text-sky-400      border-sky-500/20',
  Neverland:   'bg-emerald-500/10 text-emerald-400  border-emerald-500/20',
  Curvance:    'bg-amber-500/10   text-amber-400    border-amber-500/20',
  Kuru:        'bg-pink-500/10    text-pink-400     border-pink-500/20',
  Clober:      'bg-red-500/10     text-red-400      border-red-500/20',
  Uniswap:     'bg-fuchsia-500/10 text-fuchsia-400  border-fuchsia-500/20',
  PancakeSwap: 'bg-yellow-500/10  text-yellow-400   border-yellow-500/20',
}

const TYPE_COLOR: Record<string, string> = {
  'Liquidity Pool': 'bg-blue-500/10    text-blue-400   border-blue-500/20',
  'Staking':        'bg-purple-500/10  text-purple-400 border-purple-500/20',
  'Yield':          'bg-teal-500/10    text-teal-400   border-teal-500/20',
  'Lending':        'bg-green-500/10   text-green-400  border-green-500/20',
  'Borrowing':      'bg-red-500/10     text-red-400    border-red-500/20',
}

const PROTOCOL_LOGO: Record<string, string> = {
  Magma:       '/logos/protocols/magma.jpg',
  Fastlane:    '/logos/protocols/fastlane.jpg',
  Kintsu:      '/logos/protocols/kintsu.jpg',
  Apriori:     '/logos/protocols/apriori.jpg',
  Morpho:      '/logos/protocols/morpho.jpg',
  Neverland:   '/logos/protocols/neverland.jpg',
  Curvance:    '/logos/protocols/curvance.jpg',
  Kuru:        '/logos/protocols/kuru.jpg',
  Clober:      '/logos/protocols/clober.jpg',
  Uniswap:     '/logos/protocols/uniswap.jpg',
  PancakeSwap: '/logos/protocols/pancakeswap.jpg',
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="w-6 h-6 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-3">
            {[...Array(2)].map((_, j) => (
              <div key={j} className="flex gap-4">
                <Skeleton className="h-4 w-24 flex-1" />
                <Skeleton className="h-4 w-20 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Token amounts cell ──────────────────────────────────────────────────────
function AmountsCell({ items }: { items: TokenAmount[] }) {
  return (
    <div className="space-y-0.5">
      {items.map(a => (
        <p key={a.sym} className="text-xs text-slate-300 whitespace-nowrap">
          {fmtTokenAmt(a.amount, a.sym)}
          {' '}<span className="text-slate-500">{fmtRewardUsd(a.usd)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Neverland DUST claim row ─────────────────────────────────────────────────
const DUST_TOKEN      = '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c' as `0x${string}`
const NEV_UNDERLYINGS: `0x${string}`[] = [
  '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
  '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
  '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
  '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
  '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242',
  '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
  '0xA3227C5969757783154C60bF0bC1944180ed81B9',
  '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c',
  '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081',
  '0x103222f020e98Bba0AD9809A011FDF8e6F067496',
  '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90',
]

function NeverlandDustClaim({ address }: { address: string }) {
  const addr = address as `0x${string}`

  const { data: aTokenResults } = useReadContracts({
    contracts: NEV_UNDERLYINGS.map(u => ({
      address: NEVERLAND_DATA_PROVIDER.address,
      abi: NEVERLAND_DATA_PROVIDER.abi,
      functionName: 'getReserveTokensAddresses' as const,
      args: [u] as const,
    })),
    query: { enabled: !!address },
  })
  const aTokenAddrs = (aTokenResults ?? []).flatMap(r =>
    r.status === 'success' ? [(r.result as [`0x${string}`, `0x${string}`, `0x${string}`])[0]] : []
  )

  const { data: dustRaw, refetch: refetchDust } = useReadContract({
    address: NEVERLAND_DUST_REWARDS.address,
    abi: NEVERLAND_DUST_REWARDS.abi,
    functionName: 'getUserRewards',
    args: aTokenAddrs.length > 0 ? [aTokenAddrs, addr, DUST_TOKEN] : undefined,
    query: { enabled: aTokenAddrs.length > 0, refetchInterval: 30_000 },
  } as Parameters<typeof useReadContract>[0])
  const dustAmt = dustRaw ? Number(dustRaw as bigint) / 1e18 : 0

  const claimWrite = useWriteContract()
  const claimTx    = useWaitForTransactionReceipt({ hash: claimWrite.data })
  const isPending  = claimWrite.isPending || claimTx.isLoading
  const isSuccess  = claimTx.isSuccess
  const claimError = claimWrite.error ?? claimTx.error

  useEffect(() => {
    if (isSuccess) refetchDust()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  function handleClaim() {
    if (!dustRaw || aTokenAddrs.length === 0) return
    claimWrite.writeContract({
      address: NEVERLAND_DUST_REWARDS.address,
      abi: NEVERLAND_DUST_REWARDS.abi,
      functionName: 'claimRewards',
      args: [aTokenAddrs, dustRaw as bigint, addr, DUST_TOKEN],
    })
  }

  if (dustAmt < 0.0001 && !isSuccess) return null

  return (
    <tr className="border-b border-white/[0.03] last:border-0 bg-amber-500/[0.03]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-amber-300">DUST Rewards</span>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">Reward</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="text-xs text-amber-300">{dustAmt.toFixed(4)} DUST</p>
      </td>
      <td className="px-3 py-3 hidden sm:table-cell">
        <p className="text-xs text-emerald-400">claimable</p>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={e => { e.stopPropagation(); handleClaim() }}
            disabled={isPending || isSuccess || dustAmt < 0.001}
            className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
          >
            {isSuccess ? '✓ Claimed' : isPending ? (claimWrite.isPending ? 'Confirm…' : 'Pending…') : 'Claim'}
          </button>
          {claimWrite.data && (
            <a href={`https://monadexplorer.com/tx/${claimWrite.data}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-[#CC3BFF] hover:text-[#BFA2FF] truncate max-w-[100px]">
              {claimWrite.data.slice(0, 8)}… ↗
            </a>
          )}
          {claimError && (
            <p className="text-[10px] text-rose-400 max-w-[120px] text-right">
              {(claimError as Error).message?.split('\n')[0]?.slice(0, 60)}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Protocol section ────────────────────────────────────────────────────────
function ProtocolSection({
  protocol, positions, onClickPool, address,
}: {
  protocol: string
  positions: Position[]
  onClickPool: (poolId: string) => void
  address?: string
}) {
  const logo  = PROTOCOL_LOGO[protocol]
  const pColor = PROTOCOL_COLOR[protocol] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  const total  = positions.reduce((s, p) => s + p.amountUsd, 0)
  const supplyUsd = positions.filter(p => p.amountUsd >= 0).reduce((s, p) => s + p.amountUsd, 0)
  const debtUsd   = positions.filter(p => p.amountUsd < 0).reduce((s, p) => s + p.amountUsd, 0)
  const hasDebt   = debtUsd < 0

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      {/* Protocol header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          {logo ? (
            <img src={logo} alt={protocol} className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${pColor}`}>
              {protocol[0]}
            </div>
          )}
          <span className="text-sm font-semibold text-white">{protocol}</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-white">{fmtUsd(total)}</p>
          {hasDebt && (
            <p className="text-[10px] text-slate-500">
              Supply {fmtUsd(supplyUsd)} · Debt <span className="text-red-400">{fmtUsd(debtUsd)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] table-fixed">
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-2 font-medium">Pool</th>
              <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-3 py-2 font-medium">Balance</th>
              <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-3 py-2 font-medium hidden sm:table-cell">Rewards</th>
              <th className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos, i) => {
              const isDebt   = pos.amountUsd < 0
              const typeColor = pos.positionType ? (TYPE_COLOR[pos.positionType] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20') : null
              const hasRewards = pos.rewards && pos.rewards.some(r => r.amount > 0)

              return (
                <tr
                  key={`${pos.poolId}-${i}`}
                  onClick={() => onClickPool(pos.poolId)}
                  className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                >
                  {/* Pool name + type badge */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-white">{pos.label}</span>
                          {pos.positionId && (
                            <span className="text-[10px] text-slate-500 font-mono">{pos.positionId}</span>
                          )}
                        </div>
                        {typeColor && pos.positionType && (
                          <span className={`inline-block mt-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${typeColor}`}>
                            {pos.positionType}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Balance — per-token or single */}
                  <td className="px-3 py-3">
                    {pos.amounts ? (
                      <AmountsCell items={pos.amounts} />
                    ) : (
                      <p className={`text-xs ${isDebt ? 'text-red-400' : 'text-slate-300'}`}>
                        {Math.abs(pos.amount).toLocaleString('en-US', { maximumFractionDigits: 4 })} {pos.tokenSym}
                      </p>
                    )}
                  </td>

                  {/* Rewards */}
                  <td className="px-3 py-3 hidden sm:table-cell">
                    {pos.rewards ? (
                      hasRewards ? (
                        <AmountsCell items={pos.rewards} />
                      ) : pos.rewardUsd && pos.rewardUsd >= 0.01 ? (
                        <p className="text-xs text-emerald-400">+{fmtUsd(pos.rewardUsd)} claimable</p>
                      ) : (
                        <p className="text-xs text-slate-600">No fees yet</p>
                      )
                    ) : pos.rewardUsd && pos.rewardUsd >= 0.01 ? (
                      <p className="text-xs text-emerald-400">+{fmtUsd(pos.rewardUsd)} claimable</p>
                    ) : (
                      <p className="text-xs text-slate-600">—</p>
                    )}
                  </td>

                  {/* USD value */}
                  <td className="px-4 py-3 text-right">
                    <p className={`text-sm font-semibold ${isDebt ? 'text-red-400' : 'text-white'}`}>
                      {fmtUsd(pos.amountUsd)}
                    </p>
                    <p className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">View →</p>
                  </td>
                </tr>
              )
            })}
            {/* DUST reward row — always shown in Neverland section when wallet connected */}
            {protocol === 'Neverland' && address && (
              <NeverlandDustClaim address={address} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Track V4 position panel ─────────────────────────────────────────────────
// V4 tokenIds are stored in localStorage per domain. Use this to import
// positions created on a different domain (e.g. localhost → Vercel).
function TrackV4Panel({ address, onTracked }: { address: string; onTracked: () => void }) {
  const [open, setOpen]     = useState(false)
  const [input, setInput]   = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const saved = loadV4TokenIds(address)

  function handleAdd() {
    const raw = input.trim()
    if (!raw || isNaN(Number(raw))) { setErrMsg('Nhập số tokenId hợp lệ'); setStatus('err'); return }
    setStatus('saving')
    setErrMsg('')
    try {
      saveV4TokenId(address, BigInt(raw))
      setInput('')
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 2000)
      onTracked()
    } catch {
      setErrMsg('Lưu thất bại'); setStatus('err')
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-fuchsia-400">⬡</span>
          Track Uniswap V4 position by tokenId
        </span>
        <span className="text-slate-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <p className="text-[11px] text-slate-500">
            V4 positions are stored by tokenID. Enter the ID to track if the position is not tracked yet.
          </p>

          {/* Existing tracked IDs */}
          {saved.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {saved.map(id => (
                <span key={id} className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-mono">
                  #{id}
                </span>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Token ID (vd: 32485)"
              className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-fuchsia-500/50"
            />
            <button
              onClick={handleAdd}
              disabled={status === 'saving'}
              className="px-4 py-2 text-xs font-semibold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 rounded-lg hover:bg-fuchsia-500/30 transition-all disabled:opacity-50"
            >
              {status === 'saving' ? '...' : status === 'ok' ? '✓' : 'Track'}
            </button>
          </div>
          {status === 'err' && <p className="text-[11px] text-red-400">{errMsg}</p>}
          {status === 'ok'  && <p className="text-[11px] text-emerald-400">Đã lưu! Bấm Refresh để load vị trí.</p>}
        </div>
      )}
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState() {
  const router = useRouter()
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">📭</div>
      <p className="text-slate-400 text-sm mb-1">No positions found for this wallet</p>
      <p className="text-slate-600 text-xs mb-6">Deposits will appear here automatically after your first transaction</p>
      <button
        onClick={() => router.push('/')}
        className="px-4 py-2 text-sm font-semibold bg-[#CC3BFF] text-white rounded-lg hover:opacity-90 transition-all"
      >
        Browse Pools
      </button>
    </div>
  )
}

// ─── Kuru vault WebSocket — VaultParams for accurate TVL ─────────────────────
// MarginAccount only shows idle funds. Active limit orders (≈2/3 of vault) are
// tracked via the Kuru WS frontendOrderbook feed (vaultParams field).
const KURU_MON_USDC_MARKET = '0x065c9d28e428a0db40191a54d33d5b7c71a9c394'
const KURU_SIZE_PRECISION  = 1e10
const KURU_PRICE_PRECISION = 1e18

interface KuruVaultParams {
  vaultAskMon:  number  // MON in active ask orders
  vaultBidMon:  number  // MON-equivalent in active bid orders (at bid price)
  vaultBestBid: number  // best bid price (USDC per MON)
}

function useKuruVaultWs(): KuruVaultParams | null {
  const [params, setParams] = useState<KuruVaultParams | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout>

    try {
      ws = new WebSocket('wss://ws.kuru.io/')

      ws.onopen = () => {
        ws!.send(JSON.stringify({
          type: 'subscribe',
          channel: 'frontendOrderbook',
          market: KURU_MON_USDC_MARKET,
        }))
        // Give up after 6s if no usable snapshot
        timer = setTimeout(() => ws?.close(), 6000)
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string)
          // snapshot: { type: 'snapshot', data: { vp: { ... } } }
          // or sometimes top-level vp
          const vp = msg?.data?.vp ?? msg?.vp
          if (!vp) return

          const askMon  = Number(vp.vault_ask_order_size  ?? 0) / KURU_SIZE_PRECISION
          const bidMon  = Number(vp.vault_bid_order_size  ?? 0) / KURU_SIZE_PRECISION
          const bestBid = Number(vp.vault_best_bid        ?? 0) / KURU_PRICE_PRECISION

          console.log('[KuruWS] VaultParams:', { askMon, bidMon, bestBid })
          setParams({ vaultAskMon: askMon, vaultBidMon: bidMon, vaultBestBid: bestBid })
          clearTimeout(timer)
          ws?.close()
        } catch { /* ignore parse errors */ }
      }

      ws.onerror = () => ws?.close()
    } catch { /* WebSocket not available (SSR guard) */ }

    return () => { clearTimeout(timer); ws?.close() }
  }, [])

  return params
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [connectOpen, setConnectOpen] = useState(false)
  const router         = useRouter()

  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading]     = useState(false)
  const [loaded, setLoaded]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Kuru WS params — active limit order sizes (not visible in MarginAccount)
  const kuruWsParams = useKuruVaultWs()

  // Adjust Kuru positions with active order amounts from WS
  const displayPositions = useMemo(() => {
    if (!kuruWsParams) return positions
    return positions.map(pos => {
      if (pos.protocol !== 'Kuru' || !pos._kuruMeta) return pos
      const { fraction, vaultMonIdle, vaultQuoteIdle, monPrice, quotePrice, quoteSym } = pos._kuruMeta
      // Active orders from WS
      const activeMon  = kuruWsParams.vaultAskMon
      const activeUsdc = kuruWsParams.vaultBidMon * kuruWsParams.vaultBestBid
      // Full vault totals
      const totalMon   = vaultMonIdle + activeMon
      const totalUsdc  = vaultQuoteIdle + activeUsdc
      // User's share
      const userMon    = totalMon   * fraction
      const userUsdc   = totalUsdc  * fraction
      const newUsd     = userMon * monPrice + userUsdc * quotePrice
      if (newUsd < 0.01) return pos
      if (Math.abs(newUsd - pos.amountUsd) > 0.01) {
        console.log(`[KuruWS] ${pos.label}: $${pos.amountUsd.toFixed(2)} → $${newUsd.toFixed(2)} (active: ${activeMon.toFixed(2)} MON + ${activeUsdc.toFixed(2)} USDC)`)
      }
      return {
        ...pos,
        amountUsd: newUsd,
        amounts: [
          { sym: 'MON',    amount: userMon,  usd: userMon  * monPrice   },
          { sym: quoteSym, amount: userUsdc, usd: userUsdc * quotePrice },
        ],
      }
    })
  }, [positions, kuruWsParams])

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPortfolio(address)
      setPositions(data)
      setLoaded(true)
    } catch (e) {
      console.error('[Portfolio] fetch error:', e)
      setError('Failed to load positions. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (isConnected && address && !loaded && !loading) load()
  }, [isConnected, address, loaded, loading, load])

  useEffect(() => {
    if (!isConnected) { setPositions([]); setLoaded(false); setError(null) }
  }, [isConnected])

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-bold text-white mb-3">Your Portfolio</h1>
        <p className="text-slate-400 mb-8 max-w-sm mx-auto">
          Connect your wallet to see all your DeFi positions across Monad protocols in one place.
        </p>
        <button
          onClick={() => setConnectOpen(true)}
          className="px-6 py-3 font-semibold bg-[#CC3BFF] text-white rounded-xl hover:opacity-90 transition-all"
        >
          Connect Wallet
        </button>
        {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}
      </div>
    )
  }

  // Group positions by protocol (preserve order: sorted by USD)
  // Use displayPositions — includes WS-adjusted Kuru vault amounts
  const protocolGroups: [string, Position[]][] = []
  const seen = new Map<string, Position[]>()
  for (const pos of displayPositions) {
    if (!seen.has(pos.protocol)) {
      seen.set(pos.protocol, [])
      protocolGroups.push([pos.protocol, seen.get(pos.protocol)!])
    }
    seen.get(pos.protocol)!.push(pos)
  }

  const supplyUsd = displayPositions.filter(p => p.amountUsd >= 0).reduce((s, p) => s + p.amountUsd, 0)
  const debtUsd   = displayPositions.filter(p => p.amountUsd < 0).reduce((s, p) => s + p.amountUsd, 0)
  const netUsd    = supplyUsd + debtUsd
  const hasDebt   = debtUsd < 0

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          <button
            onClick={() => disconnect()}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
          >
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </button>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-white/10 text-slate-300 rounded-xl hover:border-white/20 hover:text-white transition-all disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin' : ''}>↻</span>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !loaded && <LoadingSkeleton />}

      {/* Loaded */}
      {loaded && !loading && (
        <>
          {/* Net value card */}
          <div className="mb-5 p-5 rounded-2xl border border-white/10 bg-white/[0.03]">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              {hasDebt ? 'Net Value' : 'Total Value'}
            </p>
            <p className="text-4xl font-bold text-white">{fmtUsd(netUsd)}</p>
            {hasDebt ? (
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span className="text-slate-400">Supply <span className="text-white font-medium">{fmtUsd(supplyUsd)}</span></span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">Borrow <span className="text-red-400 font-medium">{fmtUsd(debtUsd)}</span></span>
              </div>
            ) : displayPositions.length > 0 && (
              <p className="text-sm text-slate-500 mt-1">{displayPositions.length} position{displayPositions.length !== 1 ? 's' : ''}</p>
            )}
          </div>

          {displayPositions.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Protocol summary strip */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-none">
                {protocolGroups.map(([protocol, pts]) => {
                  const total = pts.reduce((s, p) => s + p.amountUsd, 0)
                  const logo  = PROTOCOL_LOGO[protocol]
                  const pColor = PROTOCOL_COLOR[protocol] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                  return (
                    <div key={protocol} className="shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      {logo ? (
                        <img src={logo} alt={protocol} className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${pColor}`}>
                          {protocol[0]}
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-500 leading-none mb-0.5">{protocol}</p>
                        <p className={`text-xs font-semibold ${total < 0 ? 'text-red-400' : 'text-white'}`}>{fmtUsd(total)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Per-protocol sections */}
              <div className="space-y-3">
                {protocolGroups.map(([protocol, pts]) => (
                  <ProtocolSection
                    key={protocol}
                    protocol={protocol}
                    positions={pts}
                    onClickPool={poolId => router.push('/pools/' + poolId)}
                    address={address}
                  />
                ))}
              </div>
            </>
          )}

          {/* V4 tokenId tracker — always visible when connected + loaded */}
          {address && (
            <TrackV4Panel address={address} onTracked={load} />
          )}
        </>
      )}
    </div>
  )
}
