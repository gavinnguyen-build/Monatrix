'use client'

import { useState, useEffect } from 'react'
import { useAccount, useDisconnect, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSendTransaction, usePublicClient } from 'wagmi'
import { ConnectModal } from '@/components/WalletButton'
import { parseEther, parseUnits, formatUnits, encodeFunctionData, encodeAbiParameters, maxUint256 } from 'viem'
import type { Pool, LendingPool, BorrowingPool, LiquidStakingPool, LPPool } from '@/types'
import { APRIORI, FASTLANE, KINTSU, MAGMA, ERC20_ABI, ERC4626_ABI, MORPHO_VAULTS, NEVERLAND, NEVERLAND_ORACLE, NEVERLAND_DATA_PROVIDER, NEVERLAND_RESERVES, NEVERLAND_BORROW_RESERVES, CURVANCE_MARKETS, CURVANCE_BORROW_MARKETS, CURVANCE_BORROW_ABI, KURU_VAULTS, KURU_VAULT_ABI, KURU_MARGIN_ACCOUNT, TOKENS, CLOBER_LV, CLOBER_POOLS, UNISWAP_V2_ROUTER, UNISWAP_V2_PAIR_ABI, UNISWAP_V2_POOLS, UNISWAP_V3_NPM, UNISWAP_V3_POOL_ABI, UNISWAP_V3_POOLS, UNISWAP_V4_POSITION_MANAGER, UNISWAP_V4_STATE_VIEW, UNISWAP_V4_POOLS, PERMIT2, PANCAKESWAP_V3_NPM, PANCAKESWAP_V3_POOL_ABI, PANCAKESWAP_V3_POOLS, UNISWAP_V3_SWAP_ROUTER, GMON_WMON_V3_POOL_ADDRESS } from '@/lib/contracts'
import { addLiquidity, CHAIN_IDS } from '@clober/v2-sdk'
import { saveV4TokenId } from '@/lib/v4positions'
import { useCurvanceLending, useCurvanceBorrow } from '@/lib/curvance-sdk'
import Decimal from 'decimal.js'

const NEXT_ID_ABI = [{ name: 'nextTokenId', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const

// ── Token name map ────────────────────────────────────────────────────────────
export const TOKEN_NAMES: Record<string, string> = {
  shmon: 'shMON', gmon: 'gMON', smon: 'sMON', aprmon: 'aprMON',
  wmon: 'WMON', wbtc: 'WBTC', weth: 'WETH', ausd: 'AUSD',
  usdc: 'USDC', usdt0: 'USDT0', mon: 'MON', earnausd: 'earnAUSD',
}
const fmtToken = (s: string) => TOKEN_NAMES[s.toLowerCase()] ?? s.toUpperCase()

// ── Protocol colors ───────────────────────────────────────────────────────────
export const PROTOCOL_BG: Record<string, string> = {
  Curvance: 'bg-purple-600', Morpho: 'bg-emerald-600', Neverland: 'bg-blue-600',
  Kuru: 'bg-amber-500', PancakeSwap: 'bg-pink-500', Clober: 'bg-red-500',
  Uniswap: 'bg-fuchsia-500', Fastlane: 'bg-violet-600', Kintsu: 'bg-teal-500',
  Magma: 'bg-orange-500', Apriori: 'bg-indigo-600',
}

// ── LST receipt tokens ────────────────────────────────────────────────────────
export const LST_RECEIPT: Record<string, string> = {
  Magma: 'gMON', Fastlane: 'shMON', Kintsu: 'sMON', Apriori: 'aprMON',
}

export const TOKEN_LOGO: Record<string, string> = {
  MON:    '/logos/tokens/MON.jpg',
  gMON:   '/logos/tokens/gMON.png',
  shMON:  '/logos/tokens/shMON.png',
  sMON:   '/logos/tokens/sMON.webp',
  aprMON: '/logos/tokens/aprMon.png',
}

// ── Amount input ──────────────────────────────────────────────────────────────
export function AmountInput({ label, token, value, onChange, max, logo }: {
  label: string; token: string; value: string
  onChange: (v: string) => void; max?: string; logo?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-400">{label}</span>
        {max && (
          <button
            type="button"
            onClick={() => onChange(max)}
            className="text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors"
          >
            MAX · {Number(max).toFixed(4)} {token}
          </button>
        )}
      </div>
      <div className="flex items-center bg-[#0a1220] border border-[#1a2535] rounded-xl focus-within:border-[#2a3a52] transition-colors overflow-hidden">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-transparent px-4 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="flex items-center gap-1.5 px-4 py-3 border-l border-[#1a2535] bg-[#0d1520] shrink-0">
          {logo && <img src={logo} alt={token} className="w-5 h-5 rounded-full object-cover" />}
          <span className="text-sm font-semibold text-slate-300">{token}</span>
        </div>
      </div>
    </div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const n = i + 1
        const done = current > n
        const active = current === n
        return (
          <div key={n} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex items-center gap-2 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done ? 'bg-emerald-500 text-black'
                : active ? 'bg-[#CC3BFF] text-white'
                : 'bg-[#1a2535] text-slate-500'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs ${active || done ? 'text-slate-300' : 'text-slate-600'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-[#1a2535] mx-3" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────
export function Btn({ label, onClick, disabled }: {
  label: string; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3 text-sm font-semibold rounded-xl transition-all ${
        disabled
          ? 'bg-[#1a2535] text-slate-500 cursor-not-allowed'
          : 'bg-[#CC3BFF] hover:opacity-90 active:scale-[0.98] text-white'
      }`}
    >
      {label}
    </button>
  )
}

// ── LST Flow (1 step: deposit MON → receive receipt token) ────────────────────
export function LSTFlow({ pool, address }: { pool: LiquidStakingPool; address?: string }) {
  const [tab, setTab] = useState<'stake' | 'unstake'>('stake')
  return (
    <div className="space-y-4">
      {/* Stake / Unstake tabs */}
      <div className="flex rounded-xl overflow-hidden border border-[#1a2535]">
        {(['stake', 'unstake'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors capitalize ${
              tab === t
                ? 'bg-[#CC3BFF] text-white'
                : 'bg-[#0a1220] text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'stake' ? 'Stake' : 'Unstake'}
          </button>
        ))}
      </div>

      {tab === 'stake'
        ? <LSTStakeTab pool={pool} address={address} />
        : <LSTUnstakeTab pool={pool} address={address} />
      }
    </div>
  )
}

function LSTStakeTab({ pool, address }: { pool: LiquidStakingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const { data: bal } = useBalance({ address: address as `0x${string}` | undefined })
  const receipt = LST_RECEIPT[pool.protocol] ?? pool.asset
  const balStr = bal ? (Number(bal.value) / 10 ** bal.decimals).toString() : undefined

  // Exchange rate: convertToShares(1e18) for ERC4626 protocols
  const isKintsu = pool.protocol === 'Kintsu'
  const { data: sharesPerMon } = useReadContract({
    address: pool.protocol === 'Fastlane' ? FASTLANE.address
      : pool.protocol === 'Magma' ? MAGMA.address
      : APRIORI.address,
    abi: pool.protocol === 'Fastlane' ? FASTLANE.abi
      : pool.protocol === 'Magma' ? MAGMA.abi
      : APRIORI.abi,
    functionName: 'convertToShares',
    args: [parseEther('1')],
    query: { enabled: !isKintsu },
  } as Parameters<typeof useReadContract>[0])

  // Kintsu: derive from totalPooled / totalSupply
  const { data: kintsuPooled } = useReadContract({
    address: KINTSU.address, abi: KINTSU.abi, functionName: 'totalPooled',
    query: { enabled: isKintsu },
  })
  const { data: kintsuSupply } = useReadContract({
    address: KINTSU.address, abi: KINTSU.abi, functionName: 'totalSupply',
    query: { enabled: isKintsu },
  })

  // Compute estimated shares to display
  const parsedMon = amount && Number(amount) > 0 ? parseEther(amount) : 0n
  let estimatedShares: bigint | null = null
  if (parsedMon > 0n) {
    if (isKintsu && kintsuPooled && kintsuSupply && (kintsuPooled as bigint) > 0n) {
      estimatedShares = (parsedMon * (kintsuSupply as bigint)) / (kintsuPooled as bigint)
    } else if (!isKintsu && sharesPerMon) {
      estimatedShares = (parsedMon * (sharesPerMon as bigint)) / parseEther('1')
    }
  }

  const { writeContract, data: txHash, isPending: isSigning, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })
  const isPending = isSigning || isConfirming
  const error = writeError ?? receiptError

  function handleDeposit() {
    if (!address || !amount || Number(amount) <= 0) return
    const value = parseEther(amount)
    const receiver = address as `0x${string}`
    if (pool.protocol === 'Fastlane') {
      writeContract({ address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'deposit', args: [value, receiver], value })
    } else if (pool.protocol === 'Kintsu') {
      writeContract({ address: KINTSU.address, abi: KINTSU.abi, functionName: 'deposit', args: [0n, receiver], value })
    } else if (pool.protocol === 'Magma') {
      writeContract({ address: MAGMA.address, abi: MAGMA.abi, functionName: 'depositMON', args: [receiver, 0n], value })
    } else if (pool.protocol === 'Apriori') {
      writeContract({ address: APRIORI.address, abi: APRIORI.abi, functionName: 'deposit', args: [value, receiver], value })
    }
  }

  const btnLabel = isSuccess ? `✓ Staked ${amount} MON`
    : isSigning ? 'Confirm in wallet…'
    : isConfirming ? 'Transaction pending…'
    : 'Stake MON'

  return (
    <div className="space-y-4">
      <AmountInput label="You stake" token="MON" value={amount} onChange={setAmount} max={balStr} logo={TOKEN_LOGO.MON} />
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">You receive</span>
        <div className="flex items-center gap-1.5">
          {TOKEN_LOGO[receipt] && <img src={TOKEN_LOGO[receipt]} alt={receipt} className="w-5 h-5 rounded-full object-cover" />}
          <span className="text-sm font-semibold text-white">
            {estimatedShares != null
              ? `≈ ${Number(formatUnits(estimatedShares, 18)).toFixed(4)} ${receipt}`
              : `— ${receipt}`}
          </span>
        </div>
      </div>
      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">APY</span>
        <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
      </div>
      <Btn label={btnLabel} onClick={handleDeposit} disabled={!address || !amount || Number(amount) <= 0 || isPending || isSuccess} />
      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

function LSTUnstakeTab({ pool, address }: { pool: LiquidStakingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const [magmaMode, setMagmaMode] = useState<'traditional' | 'pool'>('traditional')
  const [magmaSubTab, setMagmaSubTab] = useState<'request' | 'claim'>('request')
  const [fastlaneMode, setFastlaneMode] = useState<'traditional' | 'pool'>('traditional')
  const [fastlaneSubTab, setFastlaneSubTab] = useState<'request' | 'claim'>('request')
  const [kintsuSubTab, setKintsuSubTab] = useState<'request' | 'claim'>('request')
  const [kintsuClaimingIdx, setKintsuClaimingIdx] = useState<number | null>(null)
  const [kintsuSimResults, setKintsuSimResults] = useState<Map<number, boolean>>(new Map())
  const [aprioriMode, setAprioriMode]   = useState<'traditional' | 'pool'>('traditional')
  const [aprioriSubTab, setAprioriSubTab] = useState<'request' | 'claim'>('request')
  const addr = address as `0x${string}` | undefined
  const publicClient = usePublicClient()
  const receipt = LST_RECEIPT[pool.protocol] ?? pool.asset

  const fastlane = pool.protocol === 'Fastlane'
  const kintsu   = pool.protocol === 'Kintsu'
  const magma    = pool.protocol === 'Magma'
  const apriori  = pool.protocol === 'Apriori'

  // Read LST balance
  const lstContract = fastlane ? FASTLANE : kintsu ? KINTSU : magma ? MAGMA : APRIORI
  const { data: lstBal } = useReadContract({
    address: lstContract.address,
    abi: lstContract.abi,
    functionName: 'balanceOf',
    args: addr ? [addr] : undefined,
    query: { enabled: !!addr },
  } as Parameters<typeof useReadContract>[0])
  const lstBalStr = lstBal != null ? formatUnits(lstBal as bigint, 18) : undefined
  // Floor to 6 decimal places (bigint math) to avoid round-up when user clicks MAX
  const lstBalFloor = lstBal != null
    ? formatUnits((lstBal as bigint) / 10n**12n * 10n**12n, 18)
    : undefined

  // When user clicks MAX, amount = lstBalFloor (floor-truncated).
  // If parsedSharesRaw >= floor(lstBal) → treat as "use all" and pass exact lstBal to avoid dust.
  // Also cap at lstBal for any over-entry.
  const lstBalFloorRaw = lstBal != null ? (lstBal as bigint) / 10n**12n * 10n**12n : 0n
  const parsedSharesRaw = amount && Number(amount) > 0 ? parseUnits(amount, 18) : 0n
  const parsedShares = lstBal != null && parsedSharesRaw >= lstBalFloorRaw && lstBalFloorRaw > 0n
    ? (lstBal as bigint)            // at or above floor-max → use full balance (no dust)
    : parsedSharesRaw > (lstBal as bigint ?? 0n)
      ? (lstBal as bigint)          // above balance → cap
      : parsedSharesRaw

  // ── Fastlane-specific reads ────────────────────────────────────────────────
  // Pending traditional unstake for this wallet
  const { data: unstakeRequest } = useReadContract({
    address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'getUnstakeRequest',
    args: addr ? [addr] : undefined,
    query: { enabled: fastlane && !!addr },
  } as Parameters<typeof useReadContract>[0])
  const flPendingMon = unstakeRequest ? (unstakeRequest as [bigint, bigint])[0] : 0n
  const flCompletionEpoch = unstakeRequest ? (unstakeRequest as [bigint, bigint])[1] : 0n
  const flHasPending = flPendingMon > 0n

  // Preview: traditional (no fee) — always read 1 shMON for rate display
  const { data: flTraditionalRate1 } = useReadContract({
    address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'previewUnstake',
    args: [parseEther('1')],
    query: { enabled: fastlane },
  } as Parameters<typeof useReadContract>[0])
  // Preview: traditional for entered amount
  const { data: flTraditionalOut } = useReadContract({
    address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'previewUnstake',
    args: parsedShares > 0n ? [parsedShares] : undefined,
    query: { enabled: fastlane && parsedShares > 0n },
  } as Parameters<typeof useReadContract>[0])

  // Preview: pool/atomic (with fee) — always read 1 shMON for rate display
  const { data: flInstantRate1 } = useReadContract({
    address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'previewRedeem',
    args: [parseEther('1')],
    query: { enabled: fastlane },
  } as Parameters<typeof useReadContract>[0])
  // Preview: pool/atomic for entered amount
  const { data: flInstantOut } = useReadContract({
    address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'previewRedeem',
    args: parsedShares > 0n ? [parsedShares] : undefined,
    query: { enabled: fastlane && parsedShares > 0n },
  } as Parameters<typeof useReadContract>[0])

  // Current atomic fee rate (RAY = 1e27)
  const { data: flFeeRay } = useReadContract({
    address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'getCurrentUnstakeFeeRateRay',
    query: { enabled: fastlane },
  } as Parameters<typeof useReadContract>[0])

  // Derived display values for Fastlane
  const flTradRate = flTraditionalRate1 ? (Number(flTraditionalRate1 as bigint) / 1e18).toFixed(4) : '—'
  const flInstRate = flInstantRate1 ? (Number(flInstantRate1 as bigint) / 1e18).toFixed(4) : '—'
  const flTradReceive = parsedShares > 0n && flTraditionalOut
    ? (Number(flTraditionalOut as bigint) / 1e18).toFixed(5) : '—'
  const flInstReceive = parsedShares > 0n && flInstantOut
    ? (Number(flInstantOut as bigint) / 1e18).toFixed(5) : '—'
  const flFeeAmt = parsedShares > 0n && flTraditionalOut && flInstantOut
    ? ((Number(flTraditionalOut as bigint) - Number(flInstantOut as bigint)) / 1e18).toFixed(5)
    : flFeeRay
      ? (Number(flFeeRay as bigint) / 1e27 * 100).toFixed(3) + '%'
      : '—'
  const flYouReceiveDisplay = parsedShares > 0n
    ? (fastlaneMode === 'traditional' ? flTradReceive : flInstReceive)
    : '0'

  // ── Kintsu-specific reads ─────────────────────────────────────────────────
  // All pending unlock requests for wallet (UnlockRequest[])
  const { data: kintsuRequests, refetch: refetchKintsuRequests } = useReadContract({
    address: KINTSU.address, abi: KINTSU.abi, functionName: 'getAllUserUnlockRequests',
    args: addr ? [addr] : undefined,
    query: { enabled: kintsu && !!addr, refetchInterval: 30_000 },
  } as Parameters<typeof useReadContract>[0])
  type KintsuUnlockRequest = { shares: bigint; spotValue: bigint; batchId: bigint; exitFeeInBips: number }
  const kintsuReqList: KintsuUnlockRequest[] = Array.isArray(kintsuRequests) ? (kintsuRequests as KintsuUnlockRequest[]) : []
  const kintsuHasRequests = kintsuReqList.length > 0
  // spotValue == 0 → batch not submitted yet (awaiting)
  // spotValue > 0  → batch submitted; contract enforces cooldown (~13h after submission)
  // Simulate redeem() for each submitted request to know if cooldown has actually passed.
  const KINTSU_BID      = 20014  // ~5.56h batch interval, used only for wait-time estimate
  const KINTSU_CT       = 1763911741
  const kintsuAwaitingCount  = kintsuReqList.filter(r => r.spotValue === 0n).length

  useEffect(() => {
    if (!addr || !kintsu || !publicClient) return
    const submitted = kintsuReqList.map((r, i) => ({ r, i })).filter(({ r }) => r.spotValue > 0n)
    if (submitted.length === 0) return
    Promise.all(submitted.map(async ({ i }) => {
      try {
        await publicClient.simulateContract({
          address: KINTSU.address, abi: KINTSU.abi, functionName: 'redeem',
          args: [BigInt(i), addr], account: addr,
        })
        return [i, true] as const
      } catch {
        return [i, false] as const
      }
    })).then(results => setKintsuSimResults(new Map(results)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kintsuReqList, addr, kintsu])

  // Rate: convertToAssets(1 sMON) → MON (for display; does NOT include exit fee)
  const { data: kintsuRate1 } = useReadContract({
    address: KINTSU.address, abi: KINTSU.abi, functionName: 'convertToAssets',
    args: [parseEther('1')],
    query: { enabled: kintsu },
  } as Parameters<typeof useReadContract>[0])
  // Preview MON for entered sMON amount
  const { data: kintsuAssetsOut } = useReadContract({
    address: KINTSU.address, abi: KINTSU.abi, functionName: 'convertToAssets',
    args: parsedShares > 0n ? [parsedShares] : undefined,
    query: { enabled: kintsu && parsedShares > 0n },
  } as Parameters<typeof useReadContract>[0])

  const kintsuRateStr    = kintsuRate1    ? (Number(kintsuRate1    as bigint) / 1e18).toFixed(4) : '—'
  const kintsuReceiveStr = kintsuAssetsOut ? (Number(kintsuAssetsOut as bigint) / 1e18).toFixed(5) : '—'

  // ── Magma/Apriori ERC7540 reads ──────────────────────────────────────────
  const isMagmaOrApriori = magma || apriori
  const erc7540Abi  = magma ? MAGMA.abi  : APRIORI.abi
  const erc7540Addr = magma ? MAGMA.address : APRIORI.address
  const { data: pendingShares } = useReadContract({
    address: erc7540Addr, abi: erc7540Abi, functionName: 'pendingRedeemRequest',
    args: addr ? [0n, addr] : undefined,
    query: { enabled: !!addr && isMagmaOrApriori },
  } as Parameters<typeof useReadContract>[0])
  const { data: claimableShares } = useReadContract({
    address: erc7540Addr, abi: erc7540Abi, functionName: 'claimableRedeemRequest',
    args: addr ? [0n, addr] : undefined,
    query: { enabled: !!addr && isMagmaOrApriori },
  } as Parameters<typeof useReadContract>[0])
  const hasPending   = (pendingShares  as bigint ?? 0n) > 0n
  const hasClaimable = (claimableShares as bigint ?? 0n) > 0n

  // Magma: estimate pending MON via convertToShares(1e18)
  const { data: magmaSharesPerMon } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'convertToShares',
    args: [parseEther('1')],
    query: { enabled: magma && hasPending },
  } as Parameters<typeof useReadContract>[0])
  const pendingGmon = hasPending ? Number(formatUnits(pendingShares as bigint, 18)) : 0
  const pendingMonEst = magmaSharesPerMon && hasPending && (magmaSharesPerMon as bigint) > 0n
    ? pendingGmon / (Number(magmaSharesPerMon as bigint) / 1e18) : null

  // ── Apriori-specific reads ────────────────────────────────────────────────
  // Rate: convertToAssets(1 aprMON) → MON
  const { data: aprRate1 } = useReadContract({
    address: APRIORI.address, abi: APRIORI.abi, functionName: 'convertToAssets',
    args: [parseEther('1')],
    query: { enabled: apriori },
  } as Parameters<typeof useReadContract>[0])
  // Rate for entered amount
  const { data: aprAssetsOut } = useReadContract({
    address: APRIORI.address, abi: APRIORI.abi, functionName: 'convertToAssets',
    args: parsedShares > 0n ? [parsedShares] : undefined,
    query: { enabled: apriori && parsedShares > 0n },
  } as Parameters<typeof useReadContract>[0])
  // All user requests on-chain (paginated, 50 max)
  const { data: aprRequests, refetch: refetchAprRequests } = useReadContract({
    address: APRIORI.address, abi: APRIORI.abi, functionName: 'getUserRequestData',
    args: addr ? [addr, 0n, 50n] : undefined,
    query: { enabled: apriori && !!addr },
  } as Parameters<typeof useReadContract>[0])

  type AprRequest = { id: bigint; claimed: boolean; claimable: boolean; shares: bigint; assets: bigint; timestamp: bigint; unlockEpoch: bigint }
  const aprReqList = (aprRequests as AprRequest[] | undefined) ?? []
  const aprClaimable = aprReqList.filter(r => r.claimable && !r.claimed)
  const aprPending   = aprReqList.filter(r => !r.claimable && !r.claimed)

  const aprRateStr = aprRate1 ? (Number(aprRate1 as bigint) / 1e18).toFixed(4) : '—'
  const aprReceiveStr = parsedShares > 0n && aprAssetsOut
    ? (Number(aprAssetsOut as bigint) / 1e18).toFixed(5) : '—'

  // ── Magma-specific reads ───────────────────────────────────────────────────
  // Step 1: get user's active requestId (0 = no request)
  const { data: magmaRequestId } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'ownerRequestId',
    args: addr ? [addr] : undefined,
    query: { enabled: magma && !!addr },
  } as Parameters<typeof useReadContract>[0])
  const mgReqId = (magmaRequestId as bigint) ?? 0n
  const mgHasRequest = mgReqId > 0n

  // Step 2: pending shares (waiting period not over yet)
  const { data: mgPendingShares } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'pendingRedeemRequest',
    args: mgHasRequest && addr ? [mgReqId, addr] : undefined,
    query: { enabled: magma && mgHasRequest && !!addr },
  } as Parameters<typeof useReadContract>[0])

  // Step 2: claimable shares (ready to claim)
  const { data: mgClaimableShares } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'claimableRedeemRequest',
    args: mgHasRequest && addr ? [mgReqId, addr] : undefined,
    query: { enabled: magma && mgHasRequest && !!addr },
  } as Parameters<typeof useReadContract>[0])

  // Rate: convertToAssets(1 gMON) for mode card display
  const { data: mgRate1 } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'convertToAssets',
    args: [parseEther('1')],
    query: { enabled: magma },
  } as Parameters<typeof useReadContract>[0])

  // Preview MON for entered amount
  const { data: mgAssetsOut } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'convertToAssets',
    args: parsedShares > 0n ? [parsedShares] : undefined,
    query: { enabled: magma && parsedShares > 0n },
  } as Parameters<typeof useReadContract>[0])

  // Preview MON for claimable shares (for Claim tab display)
  const mgClaimableSharesBig = (mgClaimableShares as bigint) ?? 0n
  const { data: mgClaimableAssets } = useReadContract({
    address: MAGMA.address, abi: MAGMA.abi, functionName: 'convertToAssets',
    args: mgClaimableSharesBig > 0n ? [mgClaimableSharesBig] : undefined,
    query: { enabled: magma && mgClaimableSharesBig > 0n },
  } as Parameters<typeof useReadContract>[0])

  // Magma instant unstake: gMON allowance to SwapRouter
  const { data: mgInstantAllowance } = useReadContract({
    address: MAGMA.address, abi: ERC20_ABI, functionName: 'allowance',
    args: addr ? [addr, UNISWAP_V3_SWAP_ROUTER.address] : undefined,
    query: { enabled: magma && !!addr },
  } as Parameters<typeof useReadContract>[0])
  const mgInstantIsApproved = parsedShares > 0n
    ? (mgInstantAllowance as bigint ?? 0n) >= parsedShares
    : true

  // gMON/WMON pool slot0 — same pattern as UniswapV3Flow (slot0?.[0] = sqrtPriceX96)
  // WMON=token0 (0x3b... < 0x84... = gMON), gMON=token1
  // price = (sqrtPriceX96/2^96)^2 = gMON per WMON → invert to get WMON per gMON
  const { data: gMonSlot0 } = useReadContract({
    address: GMON_WMON_V3_POOL_ADDRESS,
    abi: UNISWAP_V3_POOL_ABI,
    functionName: 'slot0',
    query: { enabled: magma, refetchInterval: 30_000 },
  })
  const gMonSqrtP96 = (gMonSlot0 as readonly [bigint, ...unknown[]] | undefined)?.[0] ?? 0n
  const gMonPoolRate = gMonSqrtP96 > 0n
    ? (() => {
        const gMonPerWmon = Math.pow(Number(gMonSqrtP96) / 2 ** 96, 2)
        return gMonPerWmon > 0 ? 1 / gMonPerWmon : null
      })()
    : null
  // NAV-based rate from convertToAssets(1 gMON) — used as fallback if pool read not yet loaded
  const navRate = mgRate1 ? Number(mgRate1 as bigint) / 1e18 : null
  const mgInstantBaseRate = gMonPoolRate ?? navRate
  // Displayed rate: pool rate (or NAV) minus ~1% pool fee
  const mgInstantRateStr = mgInstantBaseRate ? (mgInstantBaseRate * 0.99).toFixed(4) : '—'
  // YOU RECEIVE: use convertToAssets(parsedShares) × 0.99 — exact NAV redemption value minus pool fee
  // Falls back to pool-rate-based estimate if mgAssetsOut not loaded yet
  const mgInstantReceiveStr = parsedShares > 0n
    ? mgAssetsOut
      ? (Number(mgAssetsOut as bigint) / 1e18 * 0.99).toFixed(5)
      : mgInstantBaseRate
        ? (Number(parsedShares) / 1e18 * mgInstantBaseRate * 0.99).toFixed(5)
        : '—'
    : '—'

  // Derived Magma display values
  const mgRateStr = mgRate1 ? (Number(mgRate1 as bigint) / 1e18).toFixed(4) : '—'
  const mgReceiveStr = parsedShares > 0n && mgAssetsOut ? (Number(mgAssetsOut as bigint) / 1e18).toFixed(5) : '—'
  const mgHasPending = (mgPendingShares as bigint ?? 0n) > 0n
  const mgHasClaimable = mgClaimableSharesBig > 0n
  const mgPendingSharesBig = (mgPendingShares as bigint) ?? 0n
  const mgPendingGmon = mgHasPending ? (Number(mgPendingSharesBig) / 1e18).toFixed(4) : '0'
  const mgPendingMonEst = mgHasPending && mgRate1
    ? ((Number(mgPendingSharesBig) / 1e18) * (Number(mgRate1 as bigint) / 1e18)).toFixed(5) : '—'
  const mgClaimableMonEst = mgHasClaimable && mgClaimableAssets
    ? (Number(mgClaimableAssets as bigint) / 1e18).toFixed(5) : '—'

  // ── Write hooks ──────────────────────────────────────────────────────────
  const { writeContract, data: txHash, isPending: isSigning, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })
  const isPending = isSigning || isConfirming
  const error = writeError ?? receiptError

  const { writeContract: claimWrite, data: claimTxHash, isPending: claimIsSigning, error: claimWriteError } = useWriteContract()
  const { isLoading: claimIsConfirming, isSuccess: claimIsSuccess, error: claimReceiptError } = useWaitForTransactionReceipt({ hash: claimTxHash })
  const claimPending = claimIsSigning || claimIsConfirming
  const claimError   = claimWriteError ?? claimReceiptError

  // After Kintsu requestUnlock succeeds: refetch + switch to Claim tab so user sees new pending request
  useEffect(() => {
    if (isSuccess && kintsu) {
      refetchKintsuRequests()
      setKintsuSubTab('claim')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])
  // After Kintsu claim succeeds: refetch request list (contract uses swap-and-pop so indices shift)
  useEffect(() => {
    if (claimIsSuccess && kintsuClaimingIdx !== null) {
      refetchKintsuRequests()
      setKintsuClaimingIdx(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimIsSuccess])

  // Magma instant unstake: approve gMON to SwapRouter
  const { writeContract: mgApproveWrite, data: mgApproveTxHash, isPending: mgApproveIsSigning, error: mgApproveWriteError } = useWriteContract()
  const { isLoading: mgApproveIsConfirming, isSuccess: mgApproveIsSuccess, error: mgApproveReceiptError } = useWaitForTransactionReceipt({ hash: mgApproveTxHash })
  const mgApprovePending = mgApproveIsSigning || mgApproveIsConfirming
  const mgApproveError   = mgApproveWriteError ?? mgApproveReceiptError

  function handleMagmaInstantApprove() {
    if (!addr) return
    mgApproveWrite({ address: MAGMA.address, abi: ERC20_ABI, functionName: 'approve', args: [UNISWAP_V3_SWAP_ROUTER.address, maxUint256] })
  }

  function handleUnstake() {
    if (!addr || parsedShares === 0n) return
    if (fastlane) {
      if (fastlaneMode === 'traditional') {
        writeContract({ address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'requestUnstake', args: [parsedShares] })
      } else {
        writeContract({ address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'redeem', args: [parsedShares, addr, addr] })
      }
    } else if (kintsu) {
      // requestUnlock(shares uint96, minSpotValue uint96=0 for no slippage protection)
      // Use 99.5% of shares to avoid precision overflow: spotValue stored must not exceed pool's available MON
      const safeKintsuShares = parsedShares * 9950n / 10000n
      writeContract({ address: KINTSU.address, abi: KINTSU.abi, functionName: 'requestUnlock', args: [safeKintsuShares as unknown as bigint, 0n as unknown as bigint] })
    } else if (magma) {
      if (magmaMode === 'pool') {
        // Instant: gMON → WMON → native MON via Uniswap V3 SwapRouter02 multicall
        // SwapRouter02 has NO deadline in exactInputSingle (unlike SwapRouter01)
        const swapCalldata = encodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER.abi,
          functionName: 'exactInputSingle',
          args: [{ tokenIn: MAGMA.address, tokenOut: TOKENS.WMON, fee: 10000, recipient: UNISWAP_V3_SWAP_ROUTER.address, amountIn: parsedShares, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
        })
        const unwrapCalldata = encodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER.abi,
          functionName: 'unwrapWETH9',
          args: [0n, addr],
        })
        writeContract({ address: UNISWAP_V3_SWAP_ROUTER.address, abi: UNISWAP_V3_SWAP_ROUTER.abi, functionName: 'multicall', args: [[swapCalldata, unwrapCalldata]] })
      } else {
        writeContract({ address: MAGMA.address, abi: MAGMA.abi, functionName: 'requestRedeem', args: [parsedShares, addr, addr] })
      }
    } else if (apriori) {
      writeContract({ address: APRIORI.address, abi: APRIORI.abi, functionName: 'requestRedeem', args: [parsedShares, addr, addr] })
    }
  }

  function handleAprioriClaim(ids: bigint[]) {
    if (!addr || ids.length === 0) return
    claimWrite({ address: APRIORI.address, abi: APRIORI.abi, functionName: 'redeem', args: [ids, addr] })
  }

  function handleMagmaClaim() {
    if (!addr || !mgHasClaimable || mgReqId === 0n) return
    claimWrite({ address: MAGMA.address, abi: MAGMA.abi, functionName: 'redeemMON', args: [mgReqId, addr, addr] })
  }
  function handleKintsuClaim(unlockIndex: bigint) {
    if (!addr) return
    setKintsuClaimingIdx(Number(unlockIndex))
    claimWrite({ address: KINTSU.address, abi: KINTSU.abi, functionName: 'redeem', args: [unlockIndex, addr] })
  }
  function handleFastlaneComplete() {
    if (!addr) return
    claimWrite({ address: FASTLANE.address, abi: FASTLANE.abi, functionName: 'completeUnstake', args: [] })
  }

  // ── Fastlane UI ──────────────────────────────────────────────────────────
  if (fastlane) {
    const btnLabel = isSuccess
      ? (fastlaneMode === 'traditional' ? '✓ Unstake requested' : '✓ Unstaked')
      : isSigning ? 'Confirm in wallet…'
      : isConfirming ? 'Transaction pending…'
      : parsedShares === 0n ? 'Enter an amount to unstake'
      : fastlaneMode === 'traditional' ? 'Request Unstake (shMON)'
      : 'Unstake Now (Pool)'

    return (
      <div className="space-y-3">
        {/* Request / Claim sub-tabs */}
        <div className="grid grid-cols-2 bg-[#0d1624] rounded-xl p-1">
          {(['request', 'claim'] as const).map(t => (
            <button key={t} onClick={() => setFastlaneSubTab(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                fastlaneSubTab === t ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'claim' && flHasPending && (
                <span className="ml-1.5 bg-amber-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">1</span>
              )}
            </button>
          ))}
        </div>

        {/* ── REQUEST tab ── */}
        {fastlaneSubTab === 'request' && (
          <>
            {/* Amount input — shMON */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Enter amount to unstake</span>
                {lstBalFloor && (
                  <button onClick={() => setAmount(lstBalFloor)}
                    className="text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors">MAX</button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text" inputMode="decimal" placeholder="0"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-medium text-white placeholder-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <img src={TOKEN_LOGO.shMON} alt="shMON" className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-sm font-semibold text-white">shMON</span>
                </div>
              </div>
              {lstBalStr && (
                <p className="text-xs text-slate-500 text-right">{Number(lstBalStr).toFixed(4)} shMON</p>
              )}
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-[#0d1624] border border-[#1a2535] flex items-center justify-center text-slate-400 text-sm">↓</div>
            </div>

            {/* You receive — MON */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-2">
              <span className="text-xs text-slate-400">You receive</span>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-2xl font-medium text-white">{flYouReceiveDisplay}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <img src={TOKEN_LOGO.MON} alt="MON" className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-sm font-semibold text-white">MON</span>
                </div>
              </div>
            </div>

            {/* Mode selector cards */}
            <div className="grid grid-cols-2 gap-2">
              {/* Use shMON (traditional) */}
              <button
                onClick={() => setFastlaneMode('traditional')}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  fastlaneMode === 'traditional'
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-[#1a2535] bg-[#0d1624] hover:border-[#2a3a52]'
                }`}
              >
                <p className="text-sm font-semibold text-white mb-2">Use shMON</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rate:</span>
                    <span className="text-white">1:{flTradRate}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wait:</span>
                    <span className="text-white">~1 day</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">You receive:</span>
                    <span className="text-white font-medium">{parsedShares > 0n ? flTradReceive : '—'} MON</span>
                  </div>
                </div>
              </button>

              {/* Use Pool (atomic/instant) */}
              <button
                onClick={() => setFastlaneMode('pool')}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  fastlaneMode === 'pool'
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-[#1a2535] bg-[#0d1624] hover:border-[#2a3a52]'
                }`}
              >
                <p className="text-sm font-semibold text-white mb-2">Use Pool</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Fee:</span>
                    <span className="text-white">
                      {parsedShares > 0n && flTraditionalOut && flInstantOut
                        ? `${((Number(flTraditionalOut as bigint) - Number(flInstantOut as bigint)) / 1e18).toFixed(5)} MON`
                        : flFeeRay ? `${(Number(flFeeRay as bigint) / 1e27 * 100).toFixed(3)}%` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rate:</span>
                    <span className="text-white">1:{flInstRate}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wait:</span>
                    <span className="text-emerald-400 font-medium">Instant</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">You receive:</span>
                    <span className="text-white font-medium">{parsedShares > 0n ? flInstReceive : '—'} MON</span>
                  </div>
                </div>
              </button>
            </div>

            {/* Pending info note (if exists) */}
            {flHasPending && fastlaneMode === 'traditional' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-400">
                  ⚠ You already have a pending request. A new request will merge with it and reset the waiting period.
                  Switch to the Claim tab to check status.
                </p>
              </div>
            )}

            {/* Action button */}
            <Btn label={btnLabel} onClick={handleUnstake} disabled={!addr || parsedShares === 0n || isPending || isSuccess} />

            {txHash && (
              <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
              </a>
            )}
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
              </p>
            )}
          </>
        )}

        {/* ── CLAIM tab ── */}
        {fastlaneSubTab === 'claim' && (
          <div className="space-y-3">
            {!flHasPending ? (
              <p className="text-xs text-slate-500 text-center py-6">No pending unstake requests.</p>
            ) : (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs text-amber-400 font-medium">Unstake in progress (~22-27h)</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Pending receive</span>
                    <span className="text-white font-medium">≈ {(Number(flPendingMon) / 1e18).toFixed(5)} MON</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Completion epoch</span>
                    <span className="text-slate-300">{flCompletionEpoch.toString()}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Once the epoch passes, click Complete Unstake to receive your MON.
                  </p>
                </div>

                <Btn
                  label={claimIsSuccess ? '✓ MON Claimed' : claimIsSigning ? 'Confirm in wallet…' : claimIsConfirming ? 'Transaction pending…' : 'Complete Unstake'}
                  onClick={handleFastlaneComplete}
                  disabled={claimPending || claimIsSuccess}
                />
                {claimTxHash && (
                  <a href={`https://monadexplorer.com/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                    {claimTxHash.slice(0, 20)}…{claimTxHash.slice(-8)} ↗
                  </a>
                )}
                {claimError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                    {(claimError as Error).message?.split('\n')[0]?.slice(0, 120)}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Apriori UI ────────────────────────────────────────────────────────────
  if (apriori) {
    const claimableIds = aprClaimable.map(r => r.id)
    const btnLabel = aprioriSubTab === 'claim'
      ? (claimIsSuccess ? '✓ Claimed' : claimIsSigning ? 'Confirm in wallet…' : claimIsConfirming ? 'Claiming…' : `Claim ${aprClaimable.length} Request${aprClaimable.length !== 1 ? 's' : ''}`)
      : isSuccess ? '✓ Request submitted'
      : isSigning ? 'Confirm in wallet…'
      : isConfirming ? 'Transaction pending…'
      : parsedShares === 0n ? 'Enter an amount'
      : aprioriMode === 'traditional' ? 'Request Unstake (aPriori)'
      : 'Coming soon'

    return (
      <div className="space-y-3">
        {/* Request / Claim sub-tabs */}
        <div className="grid grid-cols-2 bg-[#0d1624] rounded-xl p-1">
          {(['request', 'claim'] as const).map(t => (
            <button key={t} onClick={() => setAprioriSubTab(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                aprioriSubTab === t ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'claim' && aprClaimable.length > 0 && (
                <span className="ml-1.5 bg-emerald-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {aprClaimable.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── REQUEST tab ── */}
        {aprioriSubTab === 'request' && (
          <>
            {/* Amount input */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Unstake aprMON</span>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>🗂</span>
                  <span>{lstBalStr ? Number(lstBalStr).toFixed(4) : '0'} aprMON</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <img src={TOKEN_LOGO.aprMON} alt="aprMON" className="w-8 h-8 rounded-full object-cover shrink-0" />
                <input
                  type="text" inputMode="decimal" placeholder="0.0"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-medium text-white placeholder-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {lstBalFloor && (
                  <button onClick={() => setAmount(lstBalFloor)}
                    className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-semibold rounded-lg transition-colors">
                    Max
                  </button>
                )}
              </div>
            </div>

            {/* Mode cards */}
            <div className="grid grid-cols-2 gap-2">
              {/* Use aPriori (traditional) */}
              <button onClick={() => setAprioriMode('traditional')}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  aprioriMode === 'traditional'
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-[#1a2535] bg-[#0d1624] hover:border-[#2a3a52]'
                }`}>
                <p className="text-sm font-semibold text-white mb-2">Use aPriori</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rate:</span>
                    <span className="text-white">1:{aprRateStr}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wait time:</span>
                    <span className="text-white">about 12 hours</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">You receive:</span>
                    <span className="text-white font-medium">
                      {parsedShares > 0n ? aprReceiveStr : '0'} MON
                    </span>
                  </div>
                </div>
              </button>

              {/* Use Pool (instant — disabled until ABI provided) */}
              <button onClick={() => setAprioriMode('pool')}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  aprioriMode === 'pool'
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-[#1a2535] bg-[#0d1624] hover:border-[#2a3a52]'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white">Use Pool</p>
                  <span className="text-slate-500 text-xs">⚙</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rate:</span>
                    <span className="text-slate-500">-</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wait time:</span>
                    <span className="text-white font-medium">Instant</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">You receive:</span>
                    <span className="text-slate-500">-</span>
                  </div>
                </div>
              </button>
            </div>

            {/* Action button */}
            <Btn
              label={btnLabel}
              onClick={() => {
                if (!addr || parsedShares === 0n) return
                if (aprioriMode === 'traditional') {
                  writeContract({ address: APRIORI.address, abi: APRIORI.abi, functionName: 'requestRedeem', args: [parsedShares, addr, addr] })
                }
                // pool mode: TODO when ABI provided
              }}
              disabled={!addr || parsedShares === 0n || isPending || isSuccess || aprioriMode === 'pool'}
            />
            {txHash && (
              <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
              </a>
            )}
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
              </p>
            )}

            {/* Pending requests summary */}
            {aprPending.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-amber-400 font-medium">Pending requests ({aprPending.length})</p>
                {aprPending.slice(0, 3).map(r => (
                  <div key={r.id.toString()} className="flex justify-between text-xs">
                    <span className="text-slate-400">≈ {(Number(r.assets) / 1e18).toFixed(4)} MON</span>
                    <span className="text-slate-500">epoch {r.unlockEpoch.toString()}</span>
                  </div>
                ))}
                <p className="text-xs text-slate-500 pt-1">Switch to Claim tab when ready.</p>
              </div>
            )}

            {aprioriMode === 'traditional' && (
              <div className="flex justify-between text-xs text-slate-500 px-1">
                <span>Estimated wait time:</span>
                <span>about 12 hours</span>
              </div>
            )}
          </>
        )}

        {/* ── CLAIM tab ── */}
        {aprioriSubTab === 'claim' && (
          <div className="space-y-3">
            {aprReqList.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">No unstake requests found.</p>
            )}

            {aprPending.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-medium">Pending ({aprPending.length})</p>
                {aprPending.map(r => (
                  <div key={r.id.toString()} className="bg-[#0d1624] border border-[#1a2535] rounded-xl px-4 py-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">≈ {(Number(r.assets) / 1e18).toFixed(5)} MON</span>
                      <span className="text-amber-400">Pending</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Unlock epoch: {r.unlockEpoch.toString()}</span>
                      <span>{new Date(Number(r.timestamp) * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {aprClaimable.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-medium">Ready to claim ({aprClaimable.length})</p>
                {aprClaimable.map(r => (
                  <div key={r.id.toString()} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-white font-medium">≈ {(Number(r.assets) / 1e18).toFixed(5)} MON</span>
                      <span className="text-emerald-400 font-medium">✓ Claimable</span>
                    </div>
                  </div>
                ))}
                <Btn
                  label={claimIsSuccess ? '✓ Claimed' : claimIsSigning ? 'Confirm in wallet…' : claimIsConfirming ? 'Claiming…' : `Claim ${aprClaimable.length} Request${aprClaimable.length !== 1 ? 's' : ''}`}
                  onClick={() => handleAprioriClaim(claimableIds)}
                  disabled={claimPending || claimIsSuccess}
                />
                {claimTxHash && (
                  <a href={`https://monadexplorer.com/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                    {claimTxHash.slice(0, 20)}…{claimTxHash.slice(-8)} ↗
                  </a>
                )}
                {claimError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                    {(claimError as Error).message?.split('\n')[0]?.slice(0, 120)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Kintsu UI ─────────────────────────────────────────────────────────────
  if (kintsu) {
    const reqBtnLabel = isSuccess ? '✓ Unlock requested'
      : isSigning ? 'Confirm in wallet…'
      : isConfirming ? 'Transaction pending…'
      : parsedShares === 0n ? 'Enter an amount to unstake'
      : 'Request Unlock (sMON)'

    return (
      <div className="space-y-3">
        {/* Request / Claim sub-tabs */}
        <div className="grid grid-cols-2 bg-[#0d1624] rounded-xl p-1">
          {(['request', 'claim'] as const).map(t => (
            <button key={t} onClick={() => setKintsuSubTab(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                kintsuSubTab === t ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {t === 'request' ? 'Request' : 'Claim'}
              {t === 'claim' && kintsuHasRequests && (
                <span className="ml-1.5 bg-amber-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {kintsuReqList.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── REQUEST tab ── */}
        {kintsuSubTab === 'request' && (
          <>
            {/* sMON input */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Enter amount to unstake</span>
                {lstBalFloor && (
                  <button onClick={() => setAmount(lstBalFloor)}
                    className="text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors">MAX</button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text" inputMode="decimal" placeholder="0"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-medium text-white placeholder-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <img src={TOKEN_LOGO.sMON} alt="sMON" className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-sm font-semibold text-white">sMON</span>
                </div>
              </div>
              {lstBalStr && (
                <p className="text-xs text-slate-500 text-right">{Number(lstBalStr).toFixed(4)} sMON available</p>
              )}
            </div>

            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-[#0d1624] border border-[#1a2535] flex items-center justify-center text-slate-400 text-sm">↓</div>
            </div>

            {/* You receive */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-2">
              <span className="text-xs text-slate-400">You receive (est.)</span>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-2xl font-medium text-white">
                  {parsedShares > 0n ? kintsuReceiveStr : '0'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <img src={TOKEN_LOGO.MON} alt="MON" className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-sm font-semibold text-white">MON</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Rate: 1 sMON ≈ {kintsuRateStr} MON</span>
                <span>~6h batch + ~6h cooldown</span>
              </div>
            </div>

            {kintsuAwaitingCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-400">
                  ⚠ You have {kintsuAwaitingCount} pending request{kintsuAwaitingCount > 1 ? 's' : ''} awaiting batch submission.
                  You can still submit additional requests.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-500 bg-[#0a1220] border border-[#1a2535] rounded-xl px-3 py-2">
              {(() => {
                const nowSec = Math.floor(Date.now() / 1000)
                const batchProgress = (nowSec - KINTSU_CT) % KINTSU_BID
                const timeToNextBatch = KINTSU_BID - batchProgress
                const totalSec = timeToNextBatch + 46800 // +13h cooldown after batch submission
                const wh = Math.floor(totalSec / 3600)
                const wm = Math.floor((totalSec % 3600) / 60)
                const label = wm >= 30 ? `~${wh + 1}h` : `~${wh}h`
                return `Expectation request unstake: ${label}`
              })()}
            </p>

            <Btn label={reqBtnLabel} onClick={handleUnstake} disabled={!addr || parsedShares === 0n || isPending || isSuccess} />
            {txHash && (
              <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
                {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
              </a>
            )}
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
              </p>
            )}
          </>
        )}

        {/* ── CLAIM tab ── */}
        {kintsuSubTab === 'claim' && (
          <>
            {kintsuReqList.length === 0 ? (
              <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-6 text-center">
                <p className="text-sm text-slate-400">No pending unlock requests</p>
                <p className="text-xs text-slate-500 mt-1">Request an unstake on the Request tab first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {kintsuReqList.map((req, i) => {
                  const batchSubmitted = req.spotValue > 0n
                  const simResult = kintsuSimResults.get(i) // true=claimable, false=in cooldown, undefined=checking
                  const isReady = batchSubmitted && simResult === true
                  const inCooldown = batchSubmitted && simResult === false
                  const monAmt = req.spotValue > 0n
                    ? (Number(req.spotValue) * 0.995 / 1e18).toFixed(5)
                    : kintsuRate1
                      ? (Number(req.shares) / 1e18 * Number(kintsuRate1 as bigint) / 1e18 * 0.995).toFixed(5)
                      : '—'
                  const isThisOne = kintsuClaimingIdx === i
                  const thisIsPending = isThisOne && claimPending
                  const thisIsSuccess = isThisOne && claimIsSuccess
                  const badgeClass = isReady
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : inCooldown
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-amber-500/20 text-amber-400'
                  const badgeLabel = isReady
                    ? '✓ Ready to claim'
                    : inCooldown
                      ? '⏳ In cooldown (~13h)'
                      : batchSubmitted ? '⏳ Checking…' : '⏳ Awaiting batch'
                  return (
                    <div key={i} className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white">Request #{i + 1}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>sMON locked: {(Number(req.shares) / 1e18).toFixed(5)}</span>
                        <span>MON value: {monAmt}</span>
                      </div>
                      {isReady ? (
                        <button
                          onClick={() => handleKintsuClaim(BigInt(i))}
                          disabled={thisIsPending || thisIsSuccess || (claimPending && !isThisOne)}
                          className="w-full py-2 rounded-xl bg-teal-500/20 border border-teal-500/30 text-sm font-medium text-teal-300 hover:bg-teal-500/30 transition-colors disabled:opacity-50"
                        >
                          {thisIsSuccess ? '✓ Claimed' : thisIsPending ? (claimIsSigning ? 'Confirm in wallet…' : 'Pending…') : 'Claim MON'}
                        </button>
                      ) : inCooldown ? (
                        <p className="text-xs text-orange-500/70">Cooldown in progress. Check back ~13h after batch submission.</p>
                      ) : !batchSubmitted ? (
                        <p className="text-xs text-slate-500">Awaiting batch submission (~5–6h intervals).</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
            {claimTxHash && (
              <a href={`https://monadexplorer.com/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
                {claimTxHash.slice(0, 20)}…{claimTxHash.slice(-8)} ↗
              </a>
            )}
            {claimError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                {(() => {
                  const msg = (claimError as Error).message ?? ''
                  if (msg.includes('WithdrawDelay') || msg.includes('execution reverted'))
                    return 'Cooldown period not yet finished. Please try again in a few hours.'
                  return msg.split('\n')[0]?.slice(0, 120)
                })()}
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Magma UI ──────────────────────────────────────────────────────────────
  if (magma) {
    const mgYouReceive = magmaMode === 'traditional' ? mgReceiveStr : (parsedShares > 0n ? mgInstantReceiveStr : '0.00')
    // Traditional mode button label
    const tradBtnLabel = isSuccess ? '✓ Request submitted'
      : isSigning ? 'Confirm in wallet…'
      : isConfirming ? 'Transaction pending…'
      : parsedShares === 0n ? 'Enter an amount'
      : 'Request Unstake (gMON)'
    // Pool mode: approve or swap
    const mgInstantEffectiveApproved = mgApproveIsSuccess || mgInstantIsApproved
    const poolApproveBtnLabel = mgApproveIsSuccess ? '✓ Approved'
      : mgApproveIsSigning ? 'Confirm in wallet…'
      : mgApproveIsConfirming ? 'Approving…'
      : 'Approve gMON'
    const poolSwapBtnLabel = isSuccess ? '✓ Unstaked'
      : isSigning ? 'Confirm in wallet…'
      : isConfirming ? 'Transaction pending…'
      : parsedShares === 0n ? 'Enter an amount'
      : 'Instant Unstake'

    return (
      <div className="space-y-3">
        {/* Request / Claim sub-tabs */}
        <div className="grid grid-cols-2 bg-[#0d1624] rounded-xl p-1">
          {(['request', 'claim'] as const).map(t => (
            <button key={t} onClick={() => setMagmaSubTab(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                magmaSubTab === t ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'claim' && mgHasRequest && (
                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 font-bold ${
                  mgHasClaimable ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'
                }`}>1</span>
              )}
            </button>
          ))}
        </div>

        {/* ── REQUEST tab ── */}
        {magmaSubTab === 'request' && (
          <>
            {/* Mode cards — above amount input (matching Magma UI) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Use Magma (traditional) */}
              <button onClick={() => setMagmaMode('traditional')}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  magmaMode === 'traditional'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-[#1a2535] bg-[#0d1624] hover:border-[#2a3a52]'
                }`}>
                <p className="text-sm font-semibold text-white mb-2">Use Magma</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rate:</span>
                    <span className="text-white">1:{mgRateStr}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wait:</span>
                    <span className="text-white">~12 hours</span>
                  </div>
                </div>
              </button>

              {/* Instant via 0x (UniV3 gMON→WMON→MON) */}
              <button onClick={() => setMagmaMode('pool')}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  magmaMode === 'pool'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-[#1a2535] bg-[#0d1624] hover:border-[#2a3a52]'
                }`}>
                <p className="text-sm font-semibold text-white mb-2">Instant via 0x</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Rate:</span>
                    <span className="text-white">1:{mgInstantRateStr}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wait:</span>
                    <span className="text-emerald-400 font-medium">Instant</span>
                  </div>
                </div>
              </button>
            </div>

            {/* Pending warning (Use Magma selected + has pending) */}
            {magmaMode === 'traditional' && mgHasRequest && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-400">
                  ⚠ You already have a pending redemption. Only one redemption is allowed per account at a time.
                  Switch to Claim tab to view status.
                </p>
              </div>
            )}

            {/* Amount input — gMON */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">YOU UNSTAKE</span>
                <div className="flex items-center gap-2">
                  {lstBalFloor && (
                    <button onClick={() => setAmount(lstBalFloor)}
                      className="text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors">MAX</button>
                  )}
                  {lstBalStr && <span className="text-xs text-slate-500">{Number(lstBalStr).toFixed(4)} gMON</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <img src={TOKEN_LOGO.gMON} alt="gMON" className="w-8 h-8 rounded-full object-cover shrink-0" />
                <input
                  type="text" inputMode="decimal" placeholder="0.00"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-2xl font-medium text-white placeholder-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm font-semibold text-slate-300 shrink-0">gMON</span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-[#0d1624] border border-[#1a2535] flex items-center justify-center text-slate-400 text-sm">↓</div>
            </div>

            {/* You receive — MON */}
            <div className="bg-[#0d1624] border border-[#1a2535] rounded-2xl px-4 py-3 space-y-1">
              <span className="text-xs text-slate-400">YOU RECEIVE</span>
              <div className="flex items-center gap-3">
                <img src={TOKEN_LOGO.MON} alt="MON" className="w-8 h-8 rounded-full object-cover shrink-0" />
                <span className="flex-1 text-2xl font-medium text-white">{parsedShares > 0n ? mgYouReceive : '0.00'}</span>
                <span className="text-sm font-semibold text-slate-300 shrink-0">MON</span>
              </div>
            </div>

            {/* Action area */}
            {magmaMode === 'traditional' ? (
              <>
                <Btn
                  label={tradBtnLabel}
                  onClick={handleUnstake}
                  disabled={!addr || parsedShares === 0n || isPending || isSuccess || mgHasRequest}
                />
                {txHash && (
                  <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                    {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
                  </a>
                )}
                {error && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                    {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
                  </p>
                )}
              </>
            ) : (
              <>
                {/* Single button — Approve first, then Swap (like Magma UI) */}
                {!mgInstantEffectiveApproved ? (
                  <>
                    <Btn
                      label={poolApproveBtnLabel}
                      onClick={handleMagmaInstantApprove}
                      disabled={!addr || mgApprovePending || mgApproveIsSuccess}
                    />
                    {mgApproveTxHash && (
                      <a href={`https://monadexplorer.com/tx/${mgApproveTxHash}`} target="_blank" rel="noopener noreferrer"
                        className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                        {mgApproveTxHash.slice(0, 20)}…{mgApproveTxHash.slice(-8)} ↗
                      </a>
                    )}
                    {mgApproveError && (
                      <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                        {(mgApproveError as Error).message?.split('\n')[0]?.slice(0, 120)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <Btn
                      label={poolSwapBtnLabel}
                      onClick={handleUnstake}
                      disabled={!addr || parsedShares === 0n || isPending || isSuccess}
                    />
                    {txHash && (
                      <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                        className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                        {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
                      </a>
                    )}
                    {error && (
                      <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                        {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
                      </p>
                    )}
                  </>
                )}
                <p className="text-xs text-slate-500 text-center">Powered by Uniswap V3 · gMON/WMON 1% pool</p>
              </>
            )}
          </>
        )}

        {/* ── CLAIM tab ── */}
        {magmaSubTab === 'claim' && (
          <div className="space-y-3">
            {!mgHasRequest ? (
              <p className="text-xs text-slate-500 text-center py-6">No pending unstake requests.</p>
            ) : mgHasClaimable ? (
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs text-emerald-400 font-medium">✓ Ready to claim</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Pending redemption (gMON)</span>
                    <span className="text-white font-medium">{(Number(mgClaimableSharesBig) / 1e18).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Estimated assets at redemption (MON)</span>
                    <span className="text-emerald-400 font-medium">{mgClaimableMonEst}</span>
                  </div>
                </div>
                <Btn
                  label={claimIsSuccess ? '✓ MON Claimed' : claimIsSigning ? 'Confirm in wallet…' : claimIsConfirming ? 'Transaction pending…' : 'Claim MON'}
                  onClick={handleMagmaClaim}
                  disabled={claimPending || claimIsSuccess}
                />
                {claimTxHash && (
                  <a href={`https://monadexplorer.com/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] truncate">
                    {claimTxHash.slice(0, 20)}…{claimTxHash.slice(-8)} ↗
                  </a>
                )}
                {claimError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                    {(claimError as Error).message?.split('\n')[0]?.slice(0, 120)}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs text-amber-400 font-medium">Unbonding in progress (~12h)</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Pending redemption (gMON)</span>
                    <span className="text-white font-medium">{mgPendingGmon}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Estimated assets at redemption (MON)</span>
                    <span className="text-white font-medium">{mgPendingMonEst}</span>
                  </div>
                  <p className="text-xs text-slate-500">Return here to claim once unbonding completes.</p>
                </div>
                <Btn
                  label="Claim MON"
                  onClick={handleMagmaClaim}
                  disabled={true}
                />
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Non-Fastlane UI (Magma / Kintsu) ─────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Your balance */}
      {lstBalStr && (
        <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">Your {receipt} balance</span>
          <span className="text-sm font-semibold text-white">{Number(lstBalStr).toFixed(6)} {receipt}</span>
        </div>
      )}

      {/* Magma: pending state */}
      {magma && hasPending && !hasClaimable && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs text-amber-400 font-medium">Unbonding in progress (~12h)</p>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Pending</span>
            <span className="text-white font-medium">{pendingGmon.toFixed(6)} gMON</span>
          </div>
          {pendingMonEst != null && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Estimated receive</span>
              <span className="text-emerald-400 font-medium">≈ {pendingMonEst.toFixed(4)} MON</span>
            </div>
          )}
          <p className="text-xs text-slate-500">Only 1 redemption at a time. Return here to claim when ready.</p>
        </div>
      )}

      {/* Magma: claimable */}
      {magma && hasClaimable && (
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-emerald-400 font-medium">Ready to claim</p>
            <p className="text-xs text-slate-400 mt-1">{Number(formatUnits(claimableShares as bigint, 18)).toFixed(6)} gMON claimable</p>
          </div>
          <Btn
            label={claimIsSuccess ? '✓ Claimed' : claimIsSigning ? 'Confirm in wallet…' : claimIsConfirming ? 'Transaction pending…' : 'Claim MON'}
            onClick={handleMagmaClaim}
            disabled={claimPending || claimIsSuccess}
          />
          {claimTxHash && (
            <a href={`https://monadexplorer.com/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {claimTxHash.slice(0, 20)}…{claimTxHash.slice(-8)} ↗
            </a>
          )}
          {claimError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(claimError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
          <div className="border-t border-[#1a2535] pt-2">
            <p className="text-xs text-slate-500 text-center">Or request another unstake below</p>
          </div>
        </div>
      )}

      {/* Request unstake form */}
      {!(magma && hasPending && !hasClaimable) && (
        <>
          <AmountInput label="Amount to unstake" token={receipt} value={amount} onChange={setAmount} max={lstBalStr} logo={TOKEN_LOGO[receipt]} />

          {apriori && (
            <p className="text-xs text-slate-400 bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3">
              After requesting, visit{' '}
              <a href="https://app.apr.io" target="_blank" rel="noopener noreferrer" className="text-[#CC3BFF] hover:text-[#BFA2FF]">
                app.apr.io ↗
              </a>{' '}
              to claim your MON after the unbonding period.
            </p>
          )}
          <Btn
            label={isSuccess ? '✓ Request submitted' : isSigning ? 'Confirm in wallet…' : isConfirming ? 'Transaction pending…' : `Request Unstake ${receipt}`}
            onClick={handleUnstake}
            disabled={!addr || parsedShares === 0n || isPending || isSuccess}
          />
        </>
      )}

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Morpho lending flow (ERC4626: deposit + withdraw) ─────────────────────────
function MorphoFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const info = MORPHO_VAULTS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Vault config not found for {pool.id}</p>

  const { vault, asset: assetAddr, decimals } = info
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Deposit: wallet asset balance
  const { data: balRaw } = useReadContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const balStr = balRaw !== undefined ? (Number(balRaw) / 10 ** decimals).toFixed(6) : undefined

  // Deposit: allowance
  const { data: allowance } = useReadContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, vault],
    query: { enabled: !!address },
  })

  // Withdraw: vault share balance
  const { data: sharesRaw } = useReadContract({
    address: vault,
    abi: ERC4626_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })

  // Withdraw: convert shares → underlying asset for display & MAX
  const { data: assetsFromShares } = useReadContract({
    address: vault,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: [sharesRaw ?? 0n],
    query: { enabled: !!address && (sharesRaw ?? 0n) > 0n },
  })
  const depositedStr = assetsFromShares !== undefined
    ? (Number(assetsFromShares) / 10 ** decimals).toFixed(6)
    : undefined

  // ── Deposit flow ──
  const isApproved = parsedAmt > 0n && (allowance ?? 0n) >= parsedAmt
  const depStep = isApproved ? 2 : 1

  const approveWrite = useWriteContract()
  const approveTx   = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const depositWrite = useWriteContract()
  const depositTx   = useWaitForTransactionReceipt({ hash: depositWrite.data })

  const depIsPending = approveWrite.isPending || depositWrite.isPending || approveTx.isLoading || depositTx.isLoading
  const depIsSuccess = depositTx.isSuccess
  const depTxHash    = depositWrite.data ?? approveWrite.data
  const depError     = approveWrite.error ?? approveTx.error ?? depositWrite.error ?? depositTx.error

  function handleDeposit() {
    if (!address || parsedAmt === 0n || depIsPending) return
    const receiver = address as `0x${string}`
    if (depStep === 1) {
      approveWrite.writeContract({ address: assetAddr, abi: ERC20_ABI, functionName: 'approve', args: [vault, parsedAmt] })
    } else {
      depositWrite.writeContract({ address: vault, abi: ERC4626_ABI, functionName: 'deposit', args: [parsedAmt, receiver] })
    }
  }

  const depBtnLabel = depIsSuccess                                          ? `✓ Deposited ${amount} ${pool.asset}`
    : approveWrite.isPending || depositWrite.isPending                      ? 'Confirm in wallet…'
    : approveTx.isLoading || depositTx.isLoading                           ? 'Transaction pending…'
    : depStep === 1                                                         ? `Approve ${pool.asset}`
                                                                            : `Deposit ${pool.asset}`

  // ── Withdraw flow (ERC4626 redeem — no approve needed) ──
  const redeemWrite = useWriteContract()
  const redeemTx   = useWaitForTransactionReceipt({ hash: redeemWrite.data })

  const wdIsPending = redeemWrite.isPending || redeemTx.isLoading
  const wdIsSuccess = redeemTx.isSuccess
  const wdTxHash    = redeemWrite.data
  const wdError     = redeemWrite.error ?? redeemTx.error

  // Compute shares to redeem: full redeem when MAX clicked, proportional otherwise
  const isMax = depositedStr !== undefined && amount === depositedStr
  const parsedShares: bigint = (() => {
    if (!sharesRaw || sharesRaw === 0n || parsedAmt === 0n) return 0n
    if (isMax) return sharesRaw
    if (!assetsFromShares || assetsFromShares === 0n) return 0n
    return (sharesRaw * parsedAmt) / assetsFromShares
  })()

  function handleWithdraw() {
    if (!address || parsedShares === 0n || wdIsPending) return
    const addr = address as `0x${string}`
    redeemWrite.writeContract({ address: vault, abi: ERC4626_ABI, functionName: 'redeem', args: [parsedShares, addr, addr] })
  }

  const wdBtnLabel = wdIsSuccess           ? `✓ Withdrawn ${amount} ${pool.asset}`
    : redeemWrite.isPending                ? 'Confirm in wallet…'
    : redeemTx.isLoading                   ? 'Transaction pending…'
                                           : `Withdraw ${pool.asset}`

  const tabCls = (t: 'deposit' | 'withdraw') =>
    `flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === t ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#0a1220] border border-[#1a2535] rounded-xl p-1">
        <button className={tabCls('deposit')}  onClick={() => { setTab('deposit');  setAmount('') }}>Deposit</button>
        <button className={tabCls('withdraw')} onClick={() => { setTab('withdraw'); setAmount('') }}>Withdraw</button>
      </div>

      {tab === 'deposit' ? (
        <>
          <AmountInput label="You deposit" token={pool.asset} value={amount} onChange={setAmount} max={balStr} />

          <div className="flex justify-between text-xs px-0.5">
            <span className="text-slate-500">Supply APY</span>
            <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
          </div>

          <Steps steps={[`Approve ${pool.asset}`, `Deposit ${pool.asset}`]} current={depStep} />

          {approveTx.isSuccess && depStep === 2 && (
            <p className="text-center text-xs text-slate-600">Approval confirmed · now deposit</p>
          )}

          <Btn label={depBtnLabel} onClick={handleDeposit} disabled={!address || parsedAmt === 0n || depIsPending || depIsSuccess} />

          {depTxHash && (
            <a href={`https://monadexplorer.com/tx/${depTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {depTxHash.slice(0, 20)}…{depTxHash.slice(-8)} ↗
            </a>
          )}
          {depError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(depError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </>
      ) : (
        <>
          <AmountInput label="You withdraw" token={pool.asset} value={amount} onChange={setAmount} max={depositedStr} />

          {depositedStr !== undefined && (
            <div className="flex justify-between text-xs px-0.5">
              <span className="text-slate-500">Deposited</span>
              <span className="text-slate-300 font-semibold">{Number(depositedStr).toFixed(4)} {pool.asset}</span>
            </div>
          )}

          <Btn label={wdBtnLabel} onClick={handleWithdraw} disabled={!address || parsedShares === 0n || wdIsPending || wdIsSuccess} />

          {wdTxHash && (
            <a href={`https://monadexplorer.com/tx/${wdTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {wdTxHash.slice(0, 20)}…{wdTxHash.slice(-8)} ↗
            </a>
          )}
          {wdError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(wdError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Neverland lending flow (Aave V3: approve → supply, with MON→WMON wrap) ────
const WMON_ADDR = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`
const WMON_DEPOSIT_ABI = [{ name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] }] as const

function NeverlandFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  const [tab, setTab]             = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount]       = useState('')      // deposit amount
  const [withdrawAmt, setWdAmt]  = useState('')       // withdraw amount

  const info = NEVERLAND_RESERVES[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Reserve config not found for {pool.id}</p>

  const { asset: assetAddr, decimals } = info
  const isNativeMON = assetAddr.toLowerCase() === WMON_ADDR.toLowerCase()
  const displaySym  = isNativeMON ? 'MON' : pool.asset
  const withdrawSym = isNativeMON ? 'WMON' : pool.asset  // withdraw always returns ERC20

  // ── Deposit hooks ────────────────────────────────────────────────────────────
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, decimals) : 0n

  const { data: nativeBal } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address && isNativeMON },
  })
  const { data: erc20BalRaw } = useReadContract({
    address: assetAddr, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  // For native MON (WMON pool): reserve 0.02 MON for gas so wrap tx doesn't fail
  const displayBal = isNativeMON
    ? (nativeBal ? Math.max(0, Number(nativeBal.value) / 10 ** nativeBal.decimals - 0.02).toFixed(6) : undefined)
    : (erc20BalRaw !== undefined ? (Number(erc20BalRaw) / 10 ** decimals).toString() : undefined)

  const { data: allowance } = useReadContract({
    address: assetAddr, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, NEVERLAND.pool],
    query: { enabled: !!address },
  })
  const isApproved       = parsedAmt > 0n && (allowance ?? 0n) >= parsedAmt
  const hasSufficientWMON = (erc20BalRaw ?? 0n) >= parsedAmt
  const currentStep = isNativeMON
    ? (!hasSufficientWMON ? 1 : !isApproved ? 2 : 3)
    : (!isApproved ? 1 : 2)

  const wrapWrite    = useWriteContract()
  const wrapTx       = useWaitForTransactionReceipt({ hash: wrapWrite.data })
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const supplyWrite  = useWriteContract()
  const supplyTx     = useWaitForTransactionReceipt({ hash: supplyWrite.data })

  const isSigning = wrapWrite.isPending || approveWrite.isPending || supplyWrite.isPending
  const isWaiting = wrapTx.isLoading   || approveTx.isLoading   || supplyTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = supplyTx.isSuccess
  const txHash    = supplyWrite.data ?? approveWrite.data ?? wrapWrite.data
  const error     = wrapWrite.error ?? wrapTx.error ?? approveWrite.error ?? approveTx.error ?? supplyWrite.error ?? supplyTx.error

  function handleAction() {
    if (!address || parsedAmt === 0n || isPending) return
    const addr = address as `0x${string}`
    if (isNativeMON && currentStep === 1) {
      wrapWrite.writeContract({ address: WMON_ADDR, abi: WMON_DEPOSIT_ABI, functionName: 'deposit', value: parsedAmt })
    } else if (currentStep === (isNativeMON ? 2 : 1)) {
      approveWrite.writeContract({ address: assetAddr, abi: ERC20_ABI, functionName: 'approve', args: [NEVERLAND.pool, parsedAmt] })
    } else {
      supplyWrite.writeContract({ address: NEVERLAND.pool, abi: NEVERLAND.abi, functionName: 'supply', args: [assetAddr, parsedAmt, addr, 0] })
    }
  }

  const steps    = isNativeMON ? ['Wrap MON', 'Approve WMON', 'Supply WMON'] : [`Approve ${pool.asset}`, `Supply ${pool.asset}`]
  const btnLabel = isSuccess ? `✓ Supplied ${amount} ${displaySym}`
    : isSigning ? 'Confirm in wallet…' : isWaiting ? 'Transaction pending…'
    : isNativeMON && currentStep === 1 ? 'Wrap MON → WMON'
    : isNativeMON && currentStep === 2 ? 'Approve WMON'
    : isNativeMON && currentStep === 3 ? 'Supply WMON'
    : currentStep === 1 ? `Approve ${pool.asset}` : `Supply ${pool.asset}`

  // ── Withdraw hooks ───────────────────────────────────────────────────────────
  // aToken balance = deposited amount (1:1 with underlying in Aave V3)
  const { data: userReserve } = useReadContract({
    address: NEVERLAND_DATA_PROVIDER.address,
    abi: NEVERLAND_DATA_PROVIDER.abi,
    functionName: 'getUserReserveData',
    args: [assetAddr, address as `0x${string}`],
    query: { enabled: !!address },
  })
  const depositedRaw = userReserve ? userReserve[0] : 0n
  const depositedBal = depositedRaw > 0n
    ? Number(formatUnits(depositedRaw, decimals)).toFixed(6)
    : undefined

  const wdParsed   = withdrawAmt && Number(withdrawAmt) > 0 ? parseUnits(withdrawAmt, decimals) : 0n
  // Use maxUint256 when user withdraws ≥99.9% of balance (avoids dust rounding errors)
  const wdIsMax    = depositedRaw > 0n && wdParsed > 0n && wdParsed >= depositedRaw * 999n / 1000n
  const wdWrite    = useWriteContract()
  const wdTx       = useWaitForTransactionReceipt({ hash: wdWrite.data })
  const wdIsPending = wdWrite.isPending || (wdTx.isFetching && !wdTx.isSuccess)
  const wdIsSuccess = wdTx.isSuccess
  const wdError     = wdWrite.error ?? wdTx.error

  function handleWithdraw() {
    if (!address || wdParsed === 0n || wdIsPending) return
    wdWrite.writeContract({
      address: NEVERLAND.pool,
      abi: NEVERLAND.abi,
      functionName: 'withdraw',
      args: [assetAddr, wdIsMax ? maxUint256 : wdParsed, address as `0x${string}`],
    })
  }

  return (
    <div className="space-y-4">
      {/* Deposit / Withdraw tabs */}
      <div className="flex bg-[#0a1220] border border-[#1a2535] rounded-xl p-1 gap-1">
        <button onClick={() => { setTab('deposit') }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'deposit' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          Deposit
        </button>
        <button onClick={() => { setTab('withdraw') }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'withdraw' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          Withdraw
        </button>
      </div>

      {tab === 'deposit' && (
        <div className="space-y-4">
          <AmountInput label="You supply" token={displaySym} value={amount} onChange={setAmount} max={displayBal} />
          <div className="flex justify-between text-xs px-0.5">
            <span className="text-slate-500">Supply APY</span>
            <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
          </div>
          <Steps steps={steps} current={currentStep} />
          {wrapTx.isSuccess && currentStep === 2 && (
            <p className="text-center text-xs text-slate-600">Wrap confirmed · approve WMON next</p>
          )}
          {approveTx.isSuccess && currentStep === (isNativeMON ? 3 : 2) && (
            <p className="text-center text-xs text-slate-600">Approval confirmed · now supply</p>
          )}
          <Btn label={btnLabel} onClick={handleAction} disabled={!address || parsedAmt === 0n || isPending || isSuccess} />
          {txHash && (
            <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
            </a>
          )}
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {translateAaveError((error as Error).message)}
            </p>
          )}
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="space-y-4">
          {depositedBal ? (
            <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-2.5 flex justify-between text-xs">
              <span className="text-slate-500">Deposited</span>
              <span className="text-white font-semibold">{depositedBal} {withdrawSym}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-2">No deposit found for this wallet</p>
          )}
          {depositedBal && (
            <>
              <AmountInput label="You withdraw" token={withdrawSym} value={withdrawAmt} onChange={setWdAmt} max={depositedBal} />
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
                Withdrawing collateral reduces your borrow capacity. Ensure health factor stays above 1.
              </p>
              <Btn
                label={wdIsSuccess ? `✓ Withdrawn ${withdrawAmt} ${withdrawSym}` : wdIsPending ? 'Processing…' : `Withdraw ${withdrawSym}`}
                onClick={handleWithdraw}
                disabled={wdParsed === 0n || wdIsPending || wdIsSuccess}
              />
              {wdWrite.data && (
                <a href={`https://monadexplorer.com/tx/${wdWrite.data}`} target="_blank" rel="noopener noreferrer"
                  className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
                  {wdWrite.data.slice(0, 20)}…{wdWrite.data.slice(-8)} ↗
                </a>
              )}
              {wdError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                  {translateAaveError((wdError as Error).message)}
                </p>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}

// ── Aave V3 error code → human readable message ───────────────────────────────
const AAVE_ERRORS: Record<string, string> = {
  '1':  'Caller is not pool admin',
  '4':  'Reserve is not active',
  '5':  'Reserve is frozen — no new borrows',
  '7':  'Reserve is paused',
  '26': 'Reserve is not active',
  '28': 'Reserve is frozen — no new borrows',
  '29': 'User does not have collateral enabled for this asset',
  '30': 'Health factor too low — reduce borrow amount',
  '32': 'No collateral deposited',
  '35': 'Supply cap exceeded for this asset',
  '36': 'Not enough collateral — deposit more assets as collateral first',
  '39': 'Invalid interest rate mode',
  '43': 'Borrowing is disabled for this asset',
  '50': 'Health factor would drop below liquidation threshold',
}
function translateAaveError(msg: string): string {
  const match = msg?.match(/execution reverted:\s*"?(\d+)"?/)
  if (match) {
    const code = match[1]
    return AAVE_ERRORS[code] ?? `Aave error ${code}`
  }
  return msg?.split('\n')[0]?.slice(0, 120) ?? 'Unknown error'
}

// ── Neverland borrow flow (Aave V3) — Borrow + Repay tabs ────────────────────
// Borrow: no approve needed, just call pool.borrow(). interestRateMode = 2 (variable).
// Repay:  ERC20 approve first (debt + 0.1% buffer), then pool.repay(maxUint256) = repay all.
function NeverlandBorrowFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  const [tab, setTab]     = useState<'borrow' | 'repay'>('borrow')
  const [amount, setAmount] = useState('')

  const info = NEVERLAND_BORROW_RESERVES[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Reserve config not found for {pool.id}</p>

  const { asset: assetAddr, decimals } = info
  const sym       = (pool as BorrowingPool).asset
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // ── Borrow hooks ─────────────────────────────────────────────────────────────
  const { data: accountData } = useReadContract({
    address: NEVERLAND.pool, abi: NEVERLAND.abi, functionName: 'getUserAccountData',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const { data: assetPrice } = useReadContract({
    address: NEVERLAND_ORACLE.address, abi: NEVERLAND_ORACLE.abi, functionName: 'getAssetPrice',
    args: [assetAddr],
    query: { enabled: !!address },
  })

  const maxBorrowBase = (accountData && assetPrice && assetPrice > 0n)
    ? (accountData[0] * accountData[3]) / 11000n - accountData[1]
    : null
  const maxBorrowBigInt = (maxBorrowBase !== null && maxBorrowBase > 0n && assetPrice)
    ? (maxBorrowBase * BigInt(10 ** decimals)) / assetPrice
    : null
  const availableTokens = maxBorrowBigInt !== null ? Number(maxBorrowBigInt) / 10 ** decimals : null
  const hasCollateral   = accountData ? accountData[0] > 0n : false

  const projectedHF = (() => {
    if (!accountData) return null
    const colUSD  = Number(accountData[0])
    const debtUSD = Number(accountData[1])
    const liqThres = Number(accountData[3])
    const newBorrowUSD = (amount && Number(amount) > 0 && assetPrice)
      ? Number(amount) * Number(assetPrice) : 0
    const denom = debtUSD + newBorrowUSD
    if (denom === 0) return Infinity
    return (colUSD * liqThres / 10000) / denom
  })()

  const borrowWrite = useWriteContract()
  const borrowTx    = useWaitForTransactionReceipt({ hash: borrowWrite.data })
  const bwIsPending = borrowWrite.isPending || borrowTx.isLoading
  const bwIsSuccess = borrowTx.isSuccess
  const bwError     = borrowWrite.error ?? borrowTx.error

  function handleBorrow() {
    if (!address || parsedAmt === 0n || bwIsPending) return
    borrowWrite.writeContract({
      address: NEVERLAND.pool, abi: NEVERLAND.abi, functionName: 'borrow',
      args: [assetAddr, parsedAmt, 2n, 0, address as `0x${string}`],
    })
  }

  // ── Repay hooks ──────────────────────────────────────────────────────────────
  // Read exact variable debt, wallet balance, and allowance
  const { data: userReserve } = useReadContract({
    address: NEVERLAND_DATA_PROVIDER.address, abi: NEVERLAND_DATA_PROVIDER.abi,
    functionName: 'getUserReserveData',
    args: [assetAddr, address as `0x${string}`],
    query: { enabled: !!address },
  })
  const debtRaw = userReserve ? userReserve[2] : 0n  // currentVariableDebt

  const { data: assetWalletBal } = useReadContract({
    address: assetAddr, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const insufficientBalance = assetWalletBal !== undefined && debtRaw > 0n && assetWalletBal < debtRaw
  const debtStr = debtRaw > 0n ? Number(formatUnits(debtRaw, decimals)).toFixed(6) : '0'

  const { data: repayAllowance } = useReadContract({
    address: assetAddr, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, NEVERLAND.pool],
    query: { enabled: !!address },
  })
  const isRepayApproved = debtRaw > 0n && (repayAllowance ?? 0n) >= debtRaw

  const repayApproveWrite = useWriteContract()
  const repayApproveTx    = useWaitForTransactionReceipt({ hash: repayApproveWrite.data })
  const repayWrite        = useWriteContract()
  const repayTx           = useWaitForTransactionReceipt({ hash: repayWrite.data })

  const repayStep      = (isRepayApproved || repayApproveTx.isSuccess) ? 2 : 1
  const repayIsPending = repayApproveWrite.isPending || repayApproveTx.isLoading || repayWrite.isPending || repayTx.isLoading
  const repayIsSuccess = repayTx.isSuccess
  const repayError     = repayApproveWrite.error ?? repayApproveTx.error ?? repayWrite.error ?? repayTx.error

  function handleRepay() {
    if (!address || debtRaw === 0n || repayIsPending) return
    if (repayStep === 1) {
      repayApproveWrite.writeContract({
        address: assetAddr, abi: ERC20_ABI, functionName: 'approve',
        args: [NEVERLAND.pool, maxUint256],
      })
    } else {
      repayWrite.writeContract({
        address: NEVERLAND.pool, abi: NEVERLAND.abi, functionName: 'repay',
        args: [assetAddr, assetWalletBal ?? debtRaw, 2n, address as `0x${string}`],
      })
    }
  }

  const repayTxHash    = repayWrite.data ?? repayApproveWrite.data

  return (
    <div className="space-y-4">
      {/* Borrow / Repay tabs */}
      <div className="flex bg-[#0a1220] border border-[#1a2535] rounded-xl p-1 gap-1">
        <button onClick={() => setTab('borrow')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'borrow' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          Borrow
        </button>
        <button onClick={() => setTab('repay')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'repay' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          Repay
        </button>
      </div>

      {tab === 'borrow' && (
        <div className="space-y-4">
          {address && !hasCollateral ? (
            <>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-4 space-y-2">
                <p className="text-sm font-semibold text-amber-400">No collateral in Neverland</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Supply any asset as collateral in a Neverland lending pool first, then return here to borrow.
                </p>
              </div>
              <a href="/?tab=lending&protocol=Neverland"
                className="flex items-center justify-center gap-1.5 w-full rounded-xl py-3 text-sm font-semibold
                  bg-[#1a2535] text-slate-300 hover:text-white border border-[#2a3545] hover:border-blue-500/40 transition-all">
                View Neverland Lending Pools →
              </a>
            </>
          ) : null}
          {!address || hasCollateral ? <>
          {address && hasCollateral && availableTokens !== null && (
            <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Available to borrow</span>
                <span className="text-white font-medium">{availableTokens.toFixed(decimals <= 6 ? 2 : 4)} {sym}</span>
              </div>
              {projectedHF !== null && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Health factor{amount && Number(amount) > 0 ? ' (after borrow)' : ''}</span>
                  <span className={`font-semibold ${projectedHF === Infinity || projectedHF > 2 ? 'text-emerald-400' : projectedHF > 1.2 ? 'text-yellow-400' : 'text-rose-400'}`}>
                    {projectedHF === Infinity ? '∞' : projectedHF.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
          <AmountInput label="Amount to borrow" token={sym} value={amount} onChange={setAmount}
            max={maxBorrowBigInt !== null ? (Number(maxBorrowBigInt * 997n / 1000n) / 10 ** decimals).toFixed(6) : undefined}
          />
          <div className="flex justify-between text-xs px-0.5">
            <span className="text-slate-500">Borrow APR</span>
            <span className="text-rose-400 font-semibold">{pool.apy.toFixed(2)}%</span>
          </div>
          {maxBorrowBigInt !== null && parsedAmt > maxBorrowBigInt && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Exceeds available borrow capacity ({availableTokens?.toFixed(decimals <= 6 ? 2 : 4)} {sym})
            </p>
          )}
          <Btn
            label={bwIsSuccess ? `✓ Borrowed ${amount} ${sym}` : bwIsPending ? 'Confirm in wallet…' : `Borrow ${sym}`}
            onClick={handleBorrow}
            disabled={!address || parsedAmt === 0n || bwIsPending || bwIsSuccess || !hasCollateral || (maxBorrowBigInt !== null && parsedAmt > maxBorrowBigInt)}
          />
          {borrowWrite.data && (
            <a href={`https://monadexplorer.com/tx/${borrowWrite.data}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {borrowWrite.data.slice(0, 20)}…{borrowWrite.data.slice(-8)} ↗
            </a>
          )}
          {bwError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {translateAaveError((bwError as Error).message)}
            </p>
          )}
          </> : null}
        </div>
      )}

      {tab === 'repay' && (
        <div className="space-y-4">
          <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-2.5 flex justify-between text-xs">
            <span className="text-slate-500">Current debt</span>
            <span className={`font-semibold ${debtRaw > 0n ? 'text-rose-400' : 'text-slate-500'}`}>
              {debtStr} {sym}
            </span>
          </div>
          {debtRaw === 0n ? (
            <p className="text-xs text-slate-500 text-center py-2">No outstanding debt for this asset</p>
          ) : (
            <>
              <Steps steps={[`Approve ${sym}`, `Repay ${sym}`]} current={repayStep} />
              {repayApproveTx.isSuccess && repayStep === 2 && (
                <p className="text-center text-xs text-slate-600">Approval confirmed · now repay</p>
              )}
              <Btn
                label={
                  repayIsSuccess ? `✓ Repaid all ${sym}`
                  : repayIsPending ? 'Confirm in wallet…'
                  : repayStep === 1 ? `Approve ${sym}`
                  : `Repay all ${sym}`
                }
                onClick={handleRepay}
                disabled={debtRaw === 0n || repayIsPending || repayIsSuccess || insufficientBalance}
              />
              {repayTxHash && (
                <a href={`https://monadexplorer.com/tx/${repayTxHash}`} target="_blank" rel="noopener noreferrer"
                  className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
                  {repayTxHash.slice(0, 20)}…{repayTxHash.slice(-8)} ↗
                </a>
              )}
              {insufficientBalance && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Insufficient assets to repay. Please acquire more assets first.
                </p>
              )}
              {repayError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
                  {translateAaveError((repayError as Error).message)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Curvance error parser ──────────────────────────────────────────────────────
// Maps known Curvance custom error selectors to human-readable messages.
function parseCurvanceError(e: any): string {
  const msg = (e as Error).message ?? ''
  if (msg.includes('0xf25f18b2'))
    return 'Curvance requires a 20-minute waiting period after depositing or borrowing. Please try again later.'
  if (msg.includes('0xe6c95926'))
    return 'Insufficient liquidity in the Curvance market. Try withdrawing a slightly smaller amount.'
  if (msg.includes('0x5cf9e99a'))
    return 'Amount too small after interest accrual. Try repaying the full balance.'
  return msg.split('\n')[0]?.slice(0, 150) ?? 'Unknown error'
}

// ── Curvance lending flow — via Official Curvance SDK ─────────────────────────
// SDK handles oracle updates, approval checks, and correct flow automatically.
// depositAsCollateral = deposit + post as collateral in 1 tx (correct Curvance flow).
// redeemCollateral = remove from collateral + redeem underlying in 1 tx.
type CurvanceLendingTxState = 'idle' | 'approving' | 'depositing' | 'withdrawing' | 'success' | 'error'

function CurvanceLendingFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  const [amount, setAmount]       = useState('')
  const [tab, setTab]             = useState<'deposit' | 'withdraw'>('deposit')
  const [txState, setTxState]     = useState<CurvanceLendingTxState>('idle')
  const [txHash, setTxHash]       = useState<string>()
  const [txError, setTxError]     = useState<string>()

  const info = CURVANCE_MARKETS[pool.id]

  // SDK hook — always called (hooks must not be conditional)
  const { token, loading: sdkLoading, error: sdkError, refresh } = useCurvanceLending(
    info?.colCToken ?? '0x0000000000000000000000000000000000000001'
  )

  // Bidirectional check: if user has collateral on the opposite side of this market,
  // block deposit to prevent creating a same-market loop (Curvance protocol restriction).
  // This check is market-specific — the user can still deposit the same token in other markets.
  const { data: oppBalance } = useReadContract({
    address: info?.oppColCToken ?? '0x0000000000000000000000000000000000000001',
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!info?.oppColCToken },
  })
  const hasOppCollateral = !!info?.oppColCToken && (oppBalance ?? 0n) > 0n

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Market config not found for {pool.id}</p>
  if (!address) return <p className="text-xs text-slate-500 text-center py-4">Connect wallet to deposit</p>

  const { colSym, colDec } = info

  // Balances from SDK user cache (populated after reloadUserData)
  // ROUND_DOWN prevents depositing/withdrawing more than user actually has
  const walletBal           = token ? token.getUserUnderlyingBalance(false).toFixed(6, Decimal.ROUND_DOWN) : undefined
  const depositedBalDecimal = token ? token.getUserCollateralAssets() : null
  const depositedBal        = depositedBalDecimal?.toFixed(6)  // display only
  // MAX button rounds DOWN — safeAmt in handleWithdraw catches the tiny undershoot and uses exact Decimal
  const depositedMax        = depositedBalDecimal?.toFixed(6, Decimal.ROUND_DOWN)

  const decimalAmt = amount && Number(amount) > 0 ? new Decimal(amount) : null
  const isPending  = txState === 'approving' || txState === 'depositing' || txState === 'withdrawing'
  const isSuccess  = txState === 'success'

  function resetTx() {
    setTxState('idle')
    setTxHash(undefined)
    setTxError(undefined)
  }

  async function handleDeposit() {
    if (!token || !decimalAmt || isPending) return
    resetTx()
    try {
      // Check ERC20 allowance; approve if needed before depositAsCollateral (SDK throws if not approved)
      const amtBig = parseUnits(amount, colDec)
      const currentAllowance = await token.getAllowance(token.address)
      if (currentAllowance < amtBig) {
        setTxState('approving')
        const approveTx = await token.approveUnderlying(decimalAmt)
        setTxHash(approveTx.hash)
        await approveTx.wait()
      }
      setTxState('depositing')
      // depositAsCollateral: deposit + post as collateral in 1 tx (correct Curvance flow)
      const depositTx = await token.depositAsCollateral(decimalAmt)
      setTxHash(depositTx.hash)
      await depositTx.wait()
      setTxState('success')
      setAmount('')
      refresh()
    } catch (e: any) {
      setTxError(parseCurvanceError(e))
      setTxState('error')
    }
  }

  async function handleWithdraw() {
    if (!token || !decimalAmt || isPending) return
    resetTx()
    try {
      setTxState('withdrawing')
      // Cap at exact SDK Decimal when amount ≈ max to prevent BaseCToken__InsufficientLiquidity.
      // toFixed(6, ROUND_DOWN) may still be slightly under — safeAmt uses exact Decimal to be safe.
      const safeAmt = depositedBalDecimal && decimalAmt.gte(depositedBalDecimal.mul('0.999'))
        ? depositedBalDecimal   // full withdrawal — use SDK's own Decimal (exact precision)
        : decimalAmt
      // redeemCollateral: remove from collateral + redeem in 1 tx (no separate approval needed)
      const tx = await token.redeemCollateral(safeAmt)
      setTxHash(tx.hash)
      await tx.wait()
      setTxState('success')
      setAmount('')
      refresh()
    } catch (e: any) {
      setTxError(parseCurvanceError(e))
      setTxState('error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Deposit / Withdraw tabs */}
      <div className="flex bg-[#0a1220] border border-[#1a2535] rounded-xl p-1 gap-1">
        <button
          onClick={() => { setTab('deposit'); resetTx() }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'deposit' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Deposit
        </button>
        <button
          onClick={() => { setTab('withdraw'); resetTx() }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'withdraw' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Withdraw
        </button>
      </div>

      {sdkLoading && (
        <p className="text-center text-xs text-slate-500 py-2">Loading Curvance market data…</p>
      )}
      {!sdkLoading && sdkError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{sdkError}</p>
      )}

      {!sdkLoading && !sdkError && tab === 'deposit' && (
        <>
          {hasOppCollateral && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
              You already have <strong>{info.oppColSym}</strong> deposited as collateral in this market.
              Curvance does not allow depositing both sides of a bidirectional pair in the same market.
              Withdraw your <strong>{info.oppColSym}</strong> first from the {info.oppColSym}/{colSym} pool.
            </p>
          )}
          <AmountInput label="You deposit (collateral)" token={colSym} value={amount} onChange={setAmount} max={walletBal} />
          <div className="flex justify-between text-xs px-0.5">
            <span className="text-slate-500">Deposit APY</span>
            <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
          </div>
          <Btn
            label={
              isSuccess                  ? `✓ Deposited ${amount} ${colSym}`
              : txState === 'approving'  ? 'Approving…'
              : txState === 'depositing' ? 'Depositing…'
              : `Deposit ${colSym}`
            }
            onClick={handleDeposit}
            disabled={!decimalAmt || isPending || isSuccess || hasOppCollateral}
          />
        </>
      )}

      {!sdkLoading && !sdkError && tab === 'withdraw' && (
        <>
          {depositedBal && (
            <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-2.5 flex justify-between text-xs">
              <span className="text-slate-500">Deposited (collateral)</span>
              <span className="text-white font-semibold">{depositedBal} {colSym}</span>
            </div>
          )}
          <AmountInput label="You withdraw" token={colSym} value={amount} onChange={setAmount} max={depositedMax} />
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
            Withdrawing collateral reduces your borrow capacity. Ensure health factor stays above 1.
          </p>
          <Btn
            label={
              isSuccess           ? `✓ Withdrawn ${amount} ${colSym}`
              : txState === 'withdrawing' ? 'Processing…'
              : `Withdraw ${colSym}`
            }
            onClick={handleWithdraw}
            disabled={!decimalAmt || isPending || isSuccess}
          />
        </>
      )}

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {txState === 'error' && txError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {txError}
        </p>
      )}
    </div>
  )
}

// ── Curvance borrow flow — via Official Curvance SDK ──────────────────────────
// SDK reads on-chain state: colToken.getUserCollateral() > 0 → has collateral.
// market.userRemainingCredit → accurate credit limit (0.1% buffer built-in).
// borrowToken.borrow(Decimal) → sends tx with oracle price updates (no approval needed).
// Displays: LTV%, max borrowable (with MAX button), health factor preview.
function CurvanceBorrowFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  const [tab, setTab]            = useState<'borrow' | 'repay'>('borrow')
  const [borrowAmt, setBorrowAmt] = useState('')
  const [txState, setTxState]    = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash]      = useState<string>()
  const [txError, setTxError]    = useState<string>()
  // Max borrowable (async, fetched once after SDK loads)
  const [maxBorrowable, setMaxBorrowable] = useState<Decimal | null>(null)
  // Health factor preview: null = no amount typed, 'loading' = fetching, Decimal = result
  const [healthPreview, setHealthPreview] = useState<Decimal | null | 'loading'>(null)

  const info = CURVANCE_BORROW_MARKETS[pool.id]

  // SDK hook — always called unconditionally (hooks rules)
  const { colToken, loanToken, market, loading: sdkLoading, error: sdkError, refresh } = useCurvanceBorrow(
    info?.colCToken  ?? '0x0000000000000000000000000000000000000001',
    info?.loanCToken ?? '0x0000000000000000000000000000000000000002',
  )

  // Fetch max borrowable once SDK is ready (refetches after each borrow via refresh())
  useEffect(() => {
    if (!loanToken) { setMaxBorrowable(null); return }
    loanToken.getMaxBorrowable().then(setMaxBorrowable).catch(() => setMaxBorrowable(null))
  }, [loanToken])

  // Debounced health factor preview — recalculates 600ms after user stops typing
  useEffect(() => {
    if (!market || !loanToken || !borrowAmt || Number(borrowAmt) <= 0) {
      setHealthPreview(null)
      return
    }
    setHealthPreview('loading')
    const timer = setTimeout(async () => {
      try {
        const health = await market.previewPositionHealthBorrow(loanToken, new Decimal(borrowAmt))
        setHealthPreview(health)   // null = infinite (SDK returns null when health is unlimited)
      } catch {
        setHealthPreview(null)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [borrowAmt, loanToken, market])

  // Early returns AFTER all hooks
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Market config not found for {pool.id}</p>
  if (!address) return <p className="text-xs text-slate-500 text-center py-4">Connect wallet to borrow</p>

  const { colSym, loanSym, loanDec } = info

  // Collateral + credit from SDK
  const hasCollateral  = colToken ? colToken.getUserCollateral(false).greaterThan(0) : false
  const creditLimitUsd = market ? market.userRemainingCredit : null
  // LTV ratio from colToken (e.g. Decimal(0.75) = 75%)
  const ltv = colToken ? colToken.ltv() : null

  const decimalAmt = borrowAmt && Number(borrowAmt) > 0 ? new Decimal(borrowAmt) : null
  // MAX button value: full precision, ROUND_DOWN to avoid exceeding credit
  const maxBorrowStr = maxBorrowable?.gt(0)
    ? maxBorrowable.toDecimalPlaces(Math.min(loanDec, 6), Decimal.ROUND_DOWN).toString()
    : undefined

  // Health factor display (SDK returns HF - 1; add 1 to get standard HF like Aave)
  const hfDecimal = healthPreview !== null && healthPreview !== 'loading' ? healthPreview : null
  const hf = hfDecimal !== null ? hfDecimal.plus(1) : null
  const hfColor = !hf ? '' : hf.gte(1.5) ? 'text-emerald-400' : hf.gte(1.2) ? 'text-amber-400' : 'text-rose-400'
  const hfLabel = !hf ? '' : hf.gte(1.5) ? 'Safe' : hf.gte(1.2) ? 'Moderate' : 'At risk'

  async function handleBorrow() {
    if (!loanToken || !decimalAmt || txState === 'pending') return
    setTxState('pending')
    setTxHash(undefined)
    setTxError(undefined)
    try {
      const tx = await loanToken.borrow(decimalAmt)
      setTxHash(tx.hash)
      await tx.wait()
      setTxState('success')
      setBorrowAmt('')
      setMaxBorrowable(null)
      setHealthPreview(null)
      refresh()
    } catch (e: any) {
      setTxError(parseCurvanceError(e))
      setTxState('error')
    }
  }

  if (sdkLoading) return (
    <p className="text-center text-xs text-slate-500 py-4">Loading Curvance market data…</p>
  )
  if (sdkError) return (
    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{sdkError}</p>
  )

  // Find the lending pool on Monatrix that accepts this collateral token
  const lendingPoolId = Object.entries(CURVANCE_MARKETS)
    .find(([, m]) => m.colCToken.toLowerCase() === info.colCToken.toLowerCase())?.[0]

  if (!hasCollateral) return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-4 space-y-2">
        <p className="text-sm font-semibold text-amber-400">No {colSym} collateral found</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Deposit {colSym} into the Curvance lending pool first to create an eligible position,
          then return here to borrow.
        </p>
      </div>
      {lendingPoolId ? (
        <a href={`/pools/${lendingPoolId}`}
          className="flex items-center justify-center gap-1.5 w-full rounded-xl py-3 text-sm font-semibold
            bg-[#1a2535] text-slate-300 hover:text-white border border-[#2a3545] hover:border-[#CC3BFF]/40 transition-all">
          Deposit {colSym} collateral →
        </a>
      ) : (
        <a href="https://monad.curvance.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full rounded-xl py-3 text-sm font-semibold
            bg-[#1a2535] text-slate-300 hover:text-white border border-[#2a3545] hover:border-[#CC3BFF]/40 transition-all">
          Go to Curvance ↗
        </a>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Borrow / Repay tabs */}
      <div className="flex bg-[#0a1220] border border-[#1a2535] rounded-xl p-1 gap-1">
        <button onClick={() => setTab('borrow')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'borrow' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          Borrow
        </button>
        <button onClick={() => setTab('repay')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'repay' ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          Repay
        </button>
      </div>

      {tab === 'repay' && <CurvanceRepayFlow pool={pool} address={address} />}

      {tab === 'borrow' && <>
      {/* Collateral status + credit limit */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-sm">✓</span>
          <span className="text-xs text-emerald-400 font-medium">{colSym} collateral active</span>
        </div>
        {creditLimitUsd && creditLimitUsd.greaterThan(0) && (
          <span className="text-xs text-slate-400">
            Credit: <span className="text-white font-semibold">${creditLimitUsd.toFixed(2)}</span>
          </span>
        )}
      </div>

      {/* Amount input with MAX = max borrowable */}
      <AmountInput label="Amount to borrow" token={loanSym} value={borrowAmt} onChange={setBorrowAmt} max={maxBorrowStr} />

      {/* Pool stats row */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Borrow APR</span>
          <span className="text-rose-400 font-semibold">{pool.apy.toFixed(2)}%</span>
        </div>
        {ltv && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Max LTV</span>
            <span className="text-white font-semibold">{ltv.mul(100).toFixed(0)}%</span>
          </div>
        )}
        {maxBorrowable !== null && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Max borrow</span>
            <span className="text-white font-semibold">
              {maxBorrowable.gt(0)
                ? `${maxBorrowable.toDecimalPlaces(Math.min(loanDec, 4), Decimal.ROUND_DOWN).toString()} ${loanSym}`
                : <span className="text-slate-500">—</span>}
            </span>
          </div>
        )}

        {/* Health factor preview — only shown when amount typed */}
        {decimalAmt && (
          <div className="flex justify-between text-xs pt-1 border-t border-[#1a2535]">
            <span className="text-slate-500">Health factor after</span>
            <span className={`font-semibold ${hfColor}`}>
              {healthPreview === 'loading' ? (
                <span className="text-slate-500">…</span>
              ) : hf === null ? (
                <span className="text-slate-500">—</span>
              ) : (
                <>{hf.toFixed(2)} <span className="text-slate-500 font-normal">({hfLabel})</span></>
              )}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
        Curvance requires a minimum borrow of ~$10.
      </p>

      <Btn
        label={
          txState === 'success' ? `✓ Borrowed ${borrowAmt} ${loanSym}`
          : txState === 'pending' ? 'Processing…'
          : `Borrow ${loanSym}`
        }
        onClick={handleBorrow}
        disabled={!decimalAmt || txState === 'pending' || txState === 'success'}
      />
      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {txState === 'error' && txError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {txError}
        </p>
      )}
      </>}
    </div>
  )
}

// ── Curvance repay flow ────────────────────────────────────────────────────────
// Step 1: approve loanAsset to loanCToken with 0.2% buffer (raw wagmi — no oracle needed).
// Step 2: SDK loanToken.repay(debtDecimal) — SDK wraps call with Redstone oracle price
//         updates via multicall. This is required by Curvance MarketManager.
export function CurvanceRepayFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  const market = CURVANCE_BORROW_MARKETS[pool.id]
  const [repayState, setRepayState] = useState<'idle' | 'repaying' | 'success' | 'error'>('idle')
  const [repayHash, setRepayHash]   = useState<string>()
  const [repayError, setRepayError] = useState<string>()

  // SDK hook — must be called unconditionally (hooks rules)
  const { loanToken, loading: sdkLoading, error: sdkError } = useCurvanceBorrow(
    market?.colCToken  ?? '0x0000000000000000000000000000000000000001',
    market?.loanCToken ?? '0x0000000000000000000000000000000000000002',
  )

  const loanCToken = (market?.loanCToken ?? '0x0000000000000000000000000000000000000001') as `0x${string}`
  const loanDec    = market?.loanDec ?? 18
  const loanSym    = market?.loanSym ?? '?'

  // Get the ERC20 address of the loan token
  const { data: loanAsset } = useReadContract({
    address: loanCToken,
    abi: CURVANCE_BORROW_ABI,
    functionName: 'asset',
    query: { enabled: !!market },
  })

  // Current outstanding debt
  const { data: debtRaw } = useReadContract({
    address: loanCToken,
    abi: CURVANCE_BORROW_ABI,
    functionName: 'debtBalance',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!market },
  })

  // 0.2% buffer over debt to cover interest accrual between read and tx
  const approveAmt = debtRaw != null ? debtRaw * 1002n / 1000n : 0n

  // Check existing allowance
  const { data: allowance } = useReadContract({
    address: loanAsset,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, loanCToken],
    query: { enabled: !!address && !!loanAsset },
  })

  // Step 1: ERC20 approve (raw wagmi — ERC20 approve does not need Redstone oracle)
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })

  if (!market) return <p className="text-xs text-slate-500 text-center py-4">Market config not found for {pool.id}</p>

  const isApproved    = debtRaw != null && debtRaw > 0n && (allowance ?? 0n) >= approveAmt
  const innerStep     = isApproved ? 2 : 1
  const approving     = approveWrite.isPending || approveTx.isLoading
  const isPending     = approving || repayState === 'repaying'
  const isSuccess     = repayState === 'success'
  const txHashDisplay = repayHash ?? approveWrite.data

  async function handleAction() {
    if (!address || debtRaw == null || debtRaw === 0n || isPending) return

    if (innerStep === 1) {
      // Step 1: ERC20 approve — raw wagmi, tracked via approveTx
      if (!loanAsset) return
      approveWrite.writeContract({ address: loanAsset, abi: ERC20_ABI, functionName: 'approve', args: [loanCToken, approveAmt] })
    } else {
      // Step 2: Repay via Curvance SDK — SDK includes Redstone oracle price updates in the tx
      if (!loanToken) return
      setRepayState('repaying')
      setRepayHash(undefined)
      setRepayError(undefined)
      try {
        // Pass Decimal(0) → SDK fetches buffered debt for approval check, sends repay(0)
        // on-chain. Curvance treats repay(0) as "repay full outstanding debt", preventing
        // the LiquidityManager__InsufficientLoanSize error from interest accrual drift.
        const tx = await loanToken.repay(new Decimal(0))
        setRepayHash(tx.hash)
        await tx.wait()
        setRepayState('success')
      } catch (e: any) {
        setRepayError(parseCurvanceError(e))
        setRepayState('error')
      }
    }
  }

  const debtDisplay = debtRaw != null
    ? Number(formatUnits(debtRaw, loanDec)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : null

  const btnLabel = isSuccess              ? `✓ Repaid ${loanSym}`
    : repayState === 'repaying'           ? 'Processing repay…'
    : approveWrite.isPending              ? 'Confirm in wallet…'
    : approveTx.isLoading                 ? 'Approving…'
    : innerStep === 1                     ? `Approve ${loanSym}`
    : (innerStep === 2 && sdkLoading)     ? 'Loading market data…'
                                          : `Repay ${loanSym}`

  const displayError = repayError
    ?? (approveWrite.error ? (approveWrite.error as Error).message?.split('\n')[0]?.slice(0, 160) : undefined)
    ?? (approveTx.error    ? (approveTx.error    as Error).message?.split('\n')[0]?.slice(0, 160) : undefined)

  return (
    <div className="space-y-4">
      <Steps steps={[`Approve ${loanSym}`, `Repay ${loanSym}`]} current={innerStep} />

      {debtDisplay != null ? (
        <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">Outstanding debt</span>
          <span className="text-sm font-semibold text-rose-400">{debtDisplay} {loanSym}</span>
        </div>
      ) : (
        <div className="text-xs text-slate-500 text-center py-2">Loading debt balance…</div>
      )}

      {approveTx.isSuccess && innerStep === 2 && (
        <p className="text-center text-xs text-slate-600">Approval confirmed · ready to repay</p>
      )}

      {innerStep === 2 && sdkError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          SDK error: {sdkError}
        </p>
      )}

      <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
        Approval includes a 0.2% buffer to cover accrued interest before tx confirms.
      </p>

      <Btn
        label={btnLabel}
        onClick={handleAction}
        disabled={!address || !loanAsset || debtRaw == null || debtRaw === 0n || isPending || isSuccess
          || (innerStep === 2 && (sdkLoading || !loanToken))}
      />

      {isSuccess && (
        <p className="text-xs text-emerald-400 text-center">Debt repaid in full.</p>
      )}

      {txHashDisplay && (
        <a href={`https://monadexplorer.com/tx/${txHashDisplay}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHashDisplay.slice(0, 20)}…{txHashDisplay.slice(-8)} ↗
        </a>
      )}
      {displayError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {displayError}
        </p>
      )}
    </div>
  )
}

// ── Kuru Vault LP flow (MON + USDC/AUSD → KURU-VAULT shares) ─────────────────
// deposit(baseAmount, quoteAmount) payable — native MON via msg.value, quote via transferFrom
// withdraw(shares, receiver, owner) — burns shares, returns proportional MON + quote. No approve.
// Inputs are ratio-linked: changing one auto-fills the other based on vault's current composition.
// Steps: 1. Approve quote (USDC/AUSD), 2. Deposit (send MON + quote together)
export function KuruVaultFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [monAmt, setMonAmt] = useState('')
  const [quoteAmt, setQuoteAmt] = useState('')
  const [lastEdited, setLastEdited] = useState<'mon' | 'quote'>('mon')
  const info = KURU_VAULTS[pool.id]

  const vaultAddr  = info?.address    ?? ('0x0000000000000000000000000000000000000001' as `0x${string}`)
  const quoteToken = info?.quoteToken ?? ('0x0000000000000000000000000000000000000001' as `0x${string}`)
  const quoteDec   = info?.quoteDec   ?? 6
  const quoteSym   = info?.quoteSym   ?? '?'

  const parsedMon   = monAmt   && Number(monAmt)   > 0 ? parseEther(monAmt)             : 0n
  const parsedQuote = quoteAmt && Number(quoteAmt) > 0 ? parseUnits(quoteAmt, quoteDec) : 0n

  // Deposit ratio — use Kuru market lastPrice (MON price in USDC).
  // Kuru SDK uses calculateAmount1ForAmount2 which is price-based, NOT vault-balance-based.
  // The vault may be heavily skewed (e.g. 1.4M MON : 81K USDC) due to filled orders,
  // so reading MarginAccount balances gives a wildly wrong ratio. Market price is correct.
  const [monPrice, setMonPrice] = useState<number | null>(null)
  useEffect(() => {
    fetch('https://api.kuru.io/api/v1/markets?limit=100', { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const markets = (json?.data?.data ?? []) as { baseasset: string; quoteasset: string; lastPrice: number | null; volume24h: number | null }[]
        const MON_ZERO = '0x0000000000000000000000000000000000000000'
        const USDC_ADDR = '0x754704bc059f8c67012fed69bc8a327a5aafb603'
        const best = markets
          .filter(m => m.baseasset === MON_ZERO && m.quoteasset.toLowerCase() === USDC_ADDR && (m.volume24h ?? 0) > 10)
          .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
        const price = best[0]?.lastPrice ?? null
        if (price && price > 0) setMonPrice(price)
      })
      .catch(() => {})
  }, [])

  const ratioReady = monPrice !== null && monPrice > 0

  // Linked inputs — changing one auto-fills the other using market price ratio
  function handleMonChange(v: string) {
    setLastEdited('mon')
    setMonAmt(v)
    if (ratioReady && v && Number(v) > 0) {
      // quoteAmt = monAmt * lastPrice  (MON → USDC)
      const q = Number(v) * monPrice!
      setQuoteAmt(q.toFixed(quoteDec))
    } else if (!v) {
      setQuoteAmt('')
    }
  }
  function handleQuoteChange(v: string) {
    setLastEdited('quote')
    setQuoteAmt(v)
    if (ratioReady && v && Number(v) > 0) {
      // monAmt = quoteAmt / lastPrice  (USDC → MON)
      const b = Number(v) / monPrice!
      setMonAmt(b.toFixed(6))
    } else if (!v) {
      setMonAmt('')
    }
  }

  // MarginAccount balances — idle vault funds (note: active limit orders not included here)
  const NATIVE_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`
  const { data: vaultMonBal   } = useReadContract({ address: KURU_MARGIN_ACCOUNT.address, abi: KURU_MARGIN_ACCOUNT.abi, functionName: 'getBalance', args: [vaultAddr, NATIVE_ADDR], query: { enabled: !!info } })
  const { data: vaultWmonBal  } = useReadContract({ address: KURU_MARGIN_ACCOUNT.address, abi: KURU_MARGIN_ACCOUNT.abi, functionName: 'getBalance', args: [vaultAddr, TOKENS.WMON],   query: { enabled: !!info } })
  const { data: vaultQuoteBal } = useReadContract({ address: KURU_MARGIN_ACCOUNT.address, abi: KURU_MARGIN_ACCOUNT.abi, functionName: 'getBalance', args: [vaultAddr, quoteToken],    query: { enabled: !!info } })
  const vaultBase  = (vaultMonBal  ?? 0n) + (vaultWmonBal ?? 0n)
  const vaultQuote = vaultQuoteBal ?? 0n

  // Native MON balance
  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const monBalWei   = nativeBal?.value ?? 0n
  const monBalStr   = nativeBal ? (Number(monBalWei) / 1e18).toString() : undefined

  // Quote token (USDC/AUSD) balance
  const { data: quoteBalRaw } = useReadContract({
    address: quoteToken, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const quoteBalUnits = quoteBalRaw ?? 0n
  const quoteBalStr   = quoteBalRaw !== undefined
    ? (Number(quoteBalRaw) / 10 ** quoteDec).toString()
    : undefined

  // Balance warnings — bigint comparison avoids float precision issues
  const monInsufficient   = parsedMon   > 0n && !!address ? parsedMon   > monBalWei    : false
  const quoteInsufficient = parsedQuote > 0n && !!address ? parsedQuote > quoteBalUnits : false

  // When both are insufficient (floating-point edge case when ratio-linking),
  // show the auto-computed token — the one the user did NOT directly type.
  const insufficientToken = !monInsufficient && !quoteInsufficient ? null
    : monInsufficient && quoteInsufficient
      ? (lastEdited === 'mon' ? quoteSym : 'MON')
      : monInsufficient ? 'MON' : quoteSym

  // Quote allowance for vault
  const { data: allowance } = useReadContract({
    address: quoteToken, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, vaultAddr],
    query: { enabled: !!address },
  })

  // ── Deposit flow ──
  const isApproved  = parsedQuote > 0n && (allowance ?? 0n) >= parsedQuote
  const currentStep = isApproved ? 2 : 1

  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const depositWrite = useWriteContract()
  const depositTx    = useWaitForTransactionReceipt({ hash: depositWrite.data })

  const depIsSigning = approveWrite.isPending || depositWrite.isPending
  const depIsWaiting = approveTx.isLoading    || depositTx.isLoading
  const depIsPending = depIsSigning || depIsWaiting
  const depIsSuccess = depositTx.isSuccess
  const depTxHash    = depositWrite.data ?? approveWrite.data
  const depError     = approveWrite.error ?? approveTx.error ?? depositWrite.error ?? depositTx.error

  function handleDeposit() {
    if (!address || depIsPending || monInsufficient || quoteInsufficient) return
    if (currentStep === 1) {
      if (parsedQuote === 0n) return
      approveWrite.writeContract({ address: quoteToken, abi: ERC20_ABI, functionName: 'approve', args: [vaultAddr, parsedQuote] })
    } else {
      if (parsedMon === 0n || parsedQuote === 0n) return
      depositWrite.writeContract({
        address: vaultAddr, abi: KURU_VAULT_ABI, functionName: 'deposit',
        args: [parsedMon, parsedQuote],
        value: parsedMon,
      })
    }
  }

  const hasInsufficientBalance = insufficientToken !== null
  const canDeposit = parsedMon > 0n && parsedQuote > 0n && !hasInsufficientBalance
  const depBtnDisabled = !address || depIsPending || depIsSuccess ||
    (currentStep === 1 ? parsedQuote === 0n || quoteInsufficient : !canDeposit)

  const depBtnLabel = depIsSuccess    ? '✓ Deposited'
    : depIsSigning                    ? 'Confirm in wallet…'
    : depIsWaiting                    ? 'Transaction pending…'
    : currentStep === 1               ? `Approve ${quoteSym}`
                                      : `Deposit MON + ${quoteSym}`

  const monValueEst = ratioReady && Number(monAmt) > 0
    ? Number(monAmt) * (Number(vaultQuote) / 10 ** quoteDec) / (Number(vaultBase) / 1e18)
    : 0
  const quoteValue = Number(quoteAmt) > 0 ? Number(quoteAmt) : 0
  const totalValue = monValueEst + quoteValue

  // ── Withdraw flow — burn shares → receive MON + quote proportionally ──
  const [wdSharesInput, setWdSharesInput] = useState('')

  const { data: userShares } = useReadContract({
    address: vaultAddr, abi: KURU_VAULT_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const { data: totalSupply } = useReadContract({
    address: vaultAddr, abi: KURU_VAULT_ABI, functionName: 'totalSupply',
    query: { enabled: true },
  })

  // Estimate vault composition for display (proportional to user's shares)
  const userSharesFrac = (userShares ?? 0n) > 0n && (totalSupply ?? 0n) > 0n
    ? Number(userShares) / Number(totalSupply)
    : 0
  const estMon   = userSharesFrac * (Number(vaultBase)  / 1e18)
  const estQuote = userSharesFrac * (Number(vaultQuote) / 10 ** quoteDec)

  // Share balance formatted for MAX input (18 dec)
  const sharesStr = userShares !== undefined
    ? (Number(userShares) / 1e18).toFixed(6)
    : undefined
  const parsedWdShares = wdSharesInput && Number(wdSharesInput) > 0
    ? parseEther(wdSharesInput)
    : 0n
  const wdSharesMax = userShares ?? 0n
  const isWdMax = parsedWdShares >= wdSharesMax && wdSharesMax > 0n

  const redeemWrite = useWriteContract()
  const redeemTx    = useWaitForTransactionReceipt({ hash: redeemWrite.data })

  const wdIsPending = redeemWrite.isPending || redeemTx.isLoading
  const wdIsSuccess = redeemTx.isSuccess
  const wdTxHash    = redeemWrite.data
  const wdError     = redeemWrite.error ?? redeemTx.error

  function handleWithdraw() {
    if (!address || parsedWdShares === 0n || wdIsPending) return
    const addr = address as `0x${string}`
    // If MAX selected, use exact share balance to avoid rounding dust
    const shares = isWdMax ? wdSharesMax : parsedWdShares
    redeemWrite.writeContract({
      address: vaultAddr, abi: KURU_VAULT_ABI, functionName: 'withdraw',
      args: [shares, addr, addr],
    })
  }

  const wdBtnLabel = wdIsSuccess      ? '✓ Withdrawn'
    : redeemWrite.isPending           ? 'Confirm in wallet…'
    : redeemTx.isLoading              ? 'Transaction pending…'
                                      : 'Withdraw'

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Vault config not found for {pool.id}</p>

  const tabCls = (t: 'deposit' | 'withdraw') =>
    `flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === t ? 'bg-[#1a2535] text-white' : 'text-slate-500 hover:text-slate-300'}`

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#0a1220] border border-[#1a2535] rounded-xl p-1">
        <button className={tabCls('deposit')}  onClick={() => { setTab('deposit');  setMonAmt(''); setQuoteAmt('') }}>Deposit</button>
        <button className={tabCls('withdraw')} onClick={() => { setTab('withdraw'); setWdSharesInput('') }}>Withdraw</button>
      </div>

      {tab === 'deposit' ? (
        <>
          <AmountInput label="You pay" token="MON"      value={monAmt}   onChange={handleMonChange}   max={monBalStr} />
          <AmountInput label="You pay" token={quoteSym} value={quoteAmt} onChange={handleQuoteChange} max={quoteBalStr} />

          {insufficientToken && (
            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-rose-400">Insufficient balance</p>
                <p className="text-xs text-rose-400/70 mt-0.5">You do not have enough {insufficientToken} balance to deposit</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-amber-400">The deposit lock-up period is <span className="font-semibold">4 days</span>.</p>
          </div>

          <Steps steps={[`Approve ${quoteSym}`, 'Deposit']} current={currentStep} />
          {approveTx.isSuccess && currentStep === 2 && (
            <p className="text-center text-xs text-slate-600">Approval confirmed · now deposit</p>
          )}

          <Btn label={depBtnLabel} onClick={handleDeposit} disabled={depBtnDisabled} />

          {depTxHash && (
            <a href={`https://monadexplorer.com/tx/${depTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {depTxHash.slice(0, 20)}…{depTxHash.slice(-8)} ↗
            </a>
          )}
          {depError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(depError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}

          {(Number(monAmt) > 0 || Number(quoteAmt) > 0) && (
            <div className="border-t border-[#1a2535] pt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400">Summary</p>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">MON to be deposited</span>
                <span className="text-white">{monAmt || '0'} MON</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{quoteSym} to be deposited</span>
                <span className="text-white">{quoteAmt || '0'} {quoteSym}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Deposit value</span>
                <span className="text-white font-semibold">{totalValue > 0 ? `$${totalValue.toFixed(2)}` : '$0'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Fee APR</span>
                <span className="text-emerald-400 font-semibold">{pool.fee_apr.toFixed(2)}%</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <AmountInput label="Shares to withdraw" token="KSLP" value={wdSharesInput} onChange={setWdSharesInput} max={sharesStr} />

          {userShares !== undefined && userShares > 0n && (
            <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-400">Your position</p>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Estimated MON</span>
                <span className="text-white">≈ {estMon.toFixed(4)} MON</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Estimated {quoteSym}</span>
                <span className="text-white">≈ {estQuote.toFixed(2)} {quoteSym}</span>
              </div>
            </div>
          )}

          {userShares === 0n && (
            <p className="text-xs text-slate-500 text-center">No vault shares found</p>
          )}

          <Btn label={wdBtnLabel} onClick={handleWithdraw} disabled={!address || parsedWdShares === 0n || wdIsPending || wdIsSuccess} />

          {wdTxHash && (
            <a href={`https://monadexplorer.com/tx/${wdTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {wdTxHash.slice(0, 20)}…{wdTxHash.slice(-8)} ↗
            </a>
          )}
          {wdError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(wdError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Clober LP flow (MON → Clober V2 LP via SDK zap-in, 1 tx) ─────────────────
// Dual-token flow (no external quote API needed).
// Pool currencyA=USDC, currencyB=MON → user enters MON, USDC computed from pool ratio.
// Uses disableSwap=true so the SDK never calls the Clober Quote API (which fails for native MON).
// SDK sets value = amountBOrigin (MON wei) automatically when token1 = zeroAddress.
export function CloberFlow({ pool, address }: { pool: LPPool; address?: string }) {
  // Clober Minter contract — must approve USDC to this address
  const MINTER = '0xb1251BF43Bb7De76DE7e6CE7B64aF843dfc9d242' as `0x${string}`

  const [monAmt, setMonAmt] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const info = CLOBER_POOLS[pool.id]

  // Pool reserves for ratio: [0]=usdcReserve (6 dec), [3]=wmonReserve (18 dec)
  const { data: liquidityData } = useReadContract({
    address: CLOBER_LV.address,
    abi:     CLOBER_LV.abi,
    functionName: 'getLiquidity',
    args:    info ? [info.key] : undefined,
    query:   { enabled: !!info, refetchInterval: 15_000 },
  })
  const reserves = liquidityData as readonly [bigint,bigint,bigint,bigint,bigint,bigint] | undefined
  const usdcReserve = reserves?.[0] ?? 0n
  const wmonReserve = reserves?.[3] ?? 0n

  // MON
  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const monBalWei = nativeBal?.value ?? 0n
  const monBalStr = nativeBal ? (Number(monBalWei) / 1e18).toString() : undefined
  const parsedMon = monAmt && Number(monAmt) > 0 ? parseEther(monAmt) : 0n

  // Required USDC = parsedMon × usdcReserve / wmonReserve  (all bigint, result in 6-dec units)
  const usdcRequired = wmonReserve > 0n && parsedMon > 0n
    ? (parsedMon * usdcReserve) / wmonReserve
    : 0n
  const usdcRequiredStr = usdcRequired > 0n ? (Number(usdcRequired) / 1e6).toFixed(4) : '—'

  // USDC balance + Minter allowance
  const { data: usdcBalRaw }  = useReadContract({ address: TOKENS.USDC, abi: ERC20_ABI, functionName: 'balanceOf',  args: [address as `0x${string}`], query: { enabled: !!address } })
  const { data: usdcAllowRaw } = useReadContract({ address: TOKENS.USDC, abi: ERC20_ABI, functionName: 'allowance', args: [address as `0x${string}`, MINTER], query: { enabled: !!address } })
  const usdcBal   = (usdcBalRaw   as bigint | undefined) ?? 0n
  const usdcAllow = (usdcAllowRaw as bigint | undefined) ?? 0n

  const monInsufficient  = parsedMon > 0n && parsedMon > monBalWei
  const usdcInsufficient = usdcRequired > 0n && usdcRequired > usdcBal
  const needsApprove     = usdcRequired > 0n && usdcAllow < usdcRequired
  const currentStep      = needsApprove ? 0 : 1

  const { writeContractAsync: approveWrite, isPending: isApproving } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  async function handleAction() {
    if (!address || parsedMon === 0n || monInsufficient || usdcInsufficient || isBuilding || isApproving || isConfirming) return
    setSdkError(null)
    try {
      if (currentStep === 0) {
        // Approve USDC to Minter (10% buffer for minor ratio drift)
        await approveWrite({
          address: TOKENS.USDC, abi: ERC20_ABI, functionName: 'approve',
          args: [MINTER, usdcRequired * 11n / 10n],
        })
      } else {
        setIsBuilding(true)
        // Build addLiquidity tx via SDK with disableSwap=true — no external quote API needed
        // SDK sets value = parseUnits(amount1, 18) because token1 = zeroAddress (native MON)
        const result = await addLiquidity({
          chainId:     CHAIN_IDS.MONAD_MAINNET,
          userAddress: address as `0x${string}`,
          token0:      TOKENS.USDC,
          token1:      '0x0000000000000000000000000000000000000000',
          salt:        ('0x' + '0'.repeat(64)) as `0x${string}`,
          amount0:     formatUnits(usdcRequired, 6),
          amount1:     monAmt,
          options:     { rpcUrl: 'https://rpc.monad.xyz', disableSwap: true },
        })
        if (!result.transaction) throw new Error('Could not build transaction')
        const hash = await sendTransactionAsync({
          to:    result.transaction.to as `0x${string}`,
          data:  result.transaction.data as `0x${string}`,
          value: result.transaction.value,
          gas:   result.transaction.gas ? (result.transaction.gas as bigint) * 12n / 10n : undefined,
        })
        setTxHash(hash)
      }
    } catch (e: unknown) {
      setSdkError((e as Error).message?.split('\n')[0]?.slice(0, 150) ?? 'Unknown error')
    } finally {
      setIsBuilding(false)
    }
  }

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const btnLabel = isSuccess || (isConfirming && txHash) ? '✓ Liquidity Added'
    : isBuilding   ? 'Building transaction…'
    : isApproving  ? 'Approving…'
    : isConfirming ? 'Transaction pending…'
    : currentStep === 0 ? 'Approve USDC'
    : 'Add Liquidity'

  const disabled = !address || parsedMon === 0n || monInsufficient || usdcInsufficient
    || isBuilding || isApproving || isConfirming || isSuccess

  return (
    <div className="space-y-4">
      <AmountInput label="You deposit" token="MON" value={monAmt} onChange={setMonAmt} max={monBalStr} />

      {/* Required USDC */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-500">Also required (pool ratio)</span>
        <span className={`text-xs font-medium ${usdcInsufficient ? 'text-rose-400' : 'text-slate-300'}`}>
          {usdcRequiredStr} USDC
          {usdcInsufficient && <span className="ml-1">(insufficient)</span>}
        </span>
      </div>

      {/* Info box */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3">
        <p className="text-xs text-slate-400 leading-relaxed">
          Provide MON + USDC in the current pool ratio. The required USDC is computed automatically.
          You&apos;ll need to approve USDC, then add liquidity in one transaction.
        </p>
      </div>

      {(monInsufficient || usdcInsufficient) && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
          </svg>
          <p className="text-xs text-rose-400">
            Insufficient {monInsufficient ? 'MON' : 'USDC'} — you need {monInsufficient ? monAmt + ' MON' : usdcRequiredStr + ' USDC'}
          </p>
        </div>
      )}

      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">Fee APR</span>
        <span className="text-emerald-400 font-semibold">{pool.fee_apr.toFixed(2)}%</span>
      </div>

      {parsedMon > 0n && <Steps steps={['Approve USDC', 'Add Liquidity']} current={currentStep} />}

      <Btn label={btnLabel} onClick={handleAction} disabled={disabled} />

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {sdkError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {sdkError}
        </p>
      )}
    </div>
  )
}

// ── Uniswap V3 helpers ────────────────────────────────────────────────────────
const LOG_1_0001 = Math.log(1.0001)
const MIN_TICK_60 = -887220  // floor(-887272 / 60) * 60
const MAX_TICK_60 =  887220

export function priceToTick(humanPrice: number, dec0: number, dec1: number): number {
  // rawPrice = token1_raw / token0_raw = humanPrice / 10^(dec0-dec1)
  const rawPrice = humanPrice / 10 ** (dec0 - dec1)
  return Math.log(rawPrice) / LOG_1_0001
}

export function snapTick(tick: number, spacing: number, dir: 'floor' | 'ceil'): number {
  return dir === 'floor'
    ? Math.floor(tick / spacing) * spacing
    : Math.ceil(tick  / spacing) * spacing
}

// V3 liquidity math: given amount0 (token0 raw) compute amount1 (token1 raw)
// sqrtPriceX96: Q64.96 = sqrt(token1_raw / token0_raw) * 2^96
export function v3Amount1FromAmount0(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0Raw: number, // token0 raw (float for display)
): number {
  const sqrtPc = Number(sqrtPriceX96) / 2 ** 96
  const sqrtPa = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPb = Math.sqrt(Math.pow(1.0001, tickUpper))
  if (sqrtPc <= sqrtPa || sqrtPc >= sqrtPb || sqrtPb === sqrtPc) return 0
  const L = amount0Raw * sqrtPc * sqrtPb / (sqrtPb - sqrtPc)
  return Math.max(0, L * (sqrtPc - sqrtPa))
}

export function v3Amount0FromAmount1(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount1Raw: number,
): number {
  const sqrtPc = Number(sqrtPriceX96) / 2 ** 96
  const sqrtPa = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPb = Math.sqrt(Math.pow(1.0001, tickUpper))
  if (sqrtPc <= sqrtPa || sqrtPc >= sqrtPb || sqrtPc === sqrtPa) return 0
  const L = amount1Raw / (sqrtPc - sqrtPa)
  return Math.max(0, L * (sqrtPb - sqrtPc) / (sqrtPc * sqrtPb))
}

// Capital efficiency multiplier vs full-range V2 baseline
// CE(token0) = sqrtPb / (sqrtPb - sqrtPc)  — derived from amount0 = L*(1/sqrtPc - 1/sqrtPb)
// CE(token1) = sqrtPc / (sqrtPc - sqrtPa)  — derived from amount1 = L*(sqrtPc - sqrtPa)
// Combined = geometric mean of both sides for a balanced estimate
export function capitalMultiplier(tickLower: number, tickUpper: number, currentTick: number): number {
  if (tickLower <= MIN_TICK_60 && tickUpper >= MAX_TICK_60) return 1
  const sqrtPa = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPb = Math.sqrt(Math.pow(1.0001, tickUpper))
  const sqrtPc = Math.sqrt(Math.pow(1.0001, currentTick))
  if (sqrtPc <= sqrtPa || sqrtPc >= sqrtPb) return 1
  const ce0 = sqrtPb / (sqrtPb - sqrtPc)          // token0 side
  const ce1 = sqrtPc / (sqrtPc - sqrtPa)          // token1 side
  return Math.min(Math.sqrt(ce0 * ce1), 50)        // geometric mean, cap at 50x
}

export const V3_RANGE_PRESETS = {
  full:     { label: 'Full Range',  desc: '0 → ∞',          lowerPct: 1.00, upperPct: 10.00 },
  wide:     { label: 'Wide',        desc: '-50% to +100%',   lowerPct: 0.50, upperPct: 1.00  },
  moderate: { label: 'Moderate',    desc: '-25% to +50%',    lowerPct: 0.25, upperPct: 0.50  },
  narrow:   { label: 'Narrow',      desc: '-15% to +20%',    lowerPct: 0.15, upperPct: 0.20  },
} as const
export type V3Preset = keyof typeof V3_RANGE_PRESETS

// ── Uniswap V3 LP flow (generalized — handles WMON side, ERC20-only, and native MON) ──
function UniswapV3Flow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = UNISWAP_V3_POOLS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const { address: poolAddr, token0, token0Dec, token0Sym, token1, token1Dec, token1Sym, fee, tickSpacing, wmonSide } = info
  const hasNative = wmonSide !== 'none'
  const monIsT0   = wmonSide === 'token0'

  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')
  const [preset, setPreset] = useState<V3Preset>('wide')

  // Live slot0 — sqrtPriceX96 + currentTick
  const { data: slot0 } = useReadContract({
    address: poolAddr,
    abi: UNISWAP_V3_POOL_ABI,
    functionName: 'slot0',
    query: { refetchInterval: 15_000 },
  })
  const sqrtPriceX96 = slot0?.[0] ?? 0n
  const currentTick  = slot0?.[1] ?? 0

  // Human price: token1 per token0
  const humanPrice = sqrtPriceX96 > 0n
    ? Math.pow(Number(sqrtPriceX96) / 2 ** 96, 2) * Math.pow(10, token0Dec - token1Dec)
    : 0

  // Dynamic tick bounds for this pool's tickSpacing
  const minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  const isFullRange = preset === 'full'
  let tickLower: number
  let tickUpper: number
  if (isFullRange) {
    tickLower = minTick; tickUpper = maxTick
  } else {
    const { lowerPct, upperPct } = V3_RANGE_PRESETS[preset]
    tickLower = Math.max(minTick, snapTick(priceToTick(humanPrice * (1 - lowerPct), token0Dec, token1Dec), tickSpacing, 'floor'))
    tickUpper = Math.min(maxTick, snapTick(priceToTick(humanPrice * (1 + upperPct), token0Dec, token1Dec), tickSpacing, 'ceil'))
  }
  const multiplier = capitalMultiplier(tickLower, tickUpper, currentTick)

  // Balances
  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const { data: bal0Raw } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: bal1Raw } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const bal0Str = monIsT0
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (bal0Raw !== undefined ? formatUnits(bal0Raw, token0Dec) : undefined)
  const bal1Str = wmonSide === 'token1'
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (bal1Raw !== undefined ? formatUnits(bal1Raw, token1Dec) : undefined)

  // Amount change handlers — linked via V3 liquidity math
  function onAmt0Change(v: string) {
    setAmt0(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const raw1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, token0Dec))
      setAmt1(raw1 > 0 ? (raw1 / Math.pow(10, token1Dec)).toFixed(Math.min(token1Dec, 6)) : '')
    } else { setAmt1('') }
  }
  function onAmt1Change(v: string) {
    setAmt1(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const raw0 = v3Amount0FromAmount1(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, token1Dec))
      setAmt0(raw0 > 0 ? (raw0 / Math.pow(10, token0Dec)).toFixed(Math.min(token0Dec, 6)) : '')
    } else { setAmt0('') }
  }
  useEffect(() => {
    if (sqrtPriceX96 > 0n && amt0 && Number(amt0) > 0) {
      const raw1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(amt0) * Math.pow(10, token0Dec))
      setAmt1(raw1 > 0 ? (raw1 / Math.pow(10, token1Dec)).toFixed(Math.min(token1Dec, 6)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, sqrtPriceX96])

  // Parsed raw amounts
  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, token0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, token1Dec) : 0n

  // Insufficient balance
  const bal0Wei = monIsT0       ? (nativeBal?.value ?? 0n) : (bal0Raw ?? 0n)
  const bal1Wei = wmonSide === 'token1' ? (nativeBal?.value ?? 0n) : (bal1Raw ?? 0n)
  const insuf0 = raw0 > 0n && raw0 > bal0Wei
  const insuf1 = raw1 > 0n && raw1 > bal1Wei

  // ERC20 allowances — only for non-native sides
  const npmAddr = UNISWAP_V3_NPM.address
  const { data: allow0 } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: allow1 } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const t0Approved = raw0 > 0n && (allow0 ?? 0n) >= raw0
  const t1Approved = raw1 > 0n && (allow1 ?? 0n) >= raw1

  // Step logic
  const currentStep = wmonSide === 'token0'
    ? (!t1Approved ? 1 : 2)
    : wmonSide === 'token1'
      ? (!t0Approved ? 1 : 2)
      : (!t0Approved ? 1 : !t1Approved ? 2 : 3)

  const stepLabels = wmonSide === 'token0'
    ? [`Approve ${token1Sym}`, 'Mint Position']
    : wmonSide === 'token1'
      ? [`Approve ${token0Sym}`, 'Mint Position']
      : [`Approve ${token0Sym}`, `Approve ${token1Sym}`, 'Mint Position']

  // Write hooks
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const mintWrite    = useWriteContract()
  const mintTx       = useWaitForTransactionReceipt({ hash: mintWrite.data })

  const isSigning = approveWrite.isPending || mintWrite.isPending
  const isWaiting = approveTx.isLoading    || mintTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = mintTx.isSuccess
  const txHash    = mintWrite.data ?? approveWrite.data
  const error     = approveWrite.error ?? approveTx.error ?? mintWrite.error ?? mintTx.error

  const isMintStep = wmonSide === 'none' ? currentStep === 3 : currentStep === 2

  function handleAction() {
    if (!address || raw0 === 0n || raw1 === 0n || isPending || insuf0 || insuf1) return
    const addr = address as `0x${string}`

    if (isMintStep) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      if (hasNative) {
        const mintData = encodeFunctionData({
          abi: UNISWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }],
        })
        const refundData = encodeFunctionData({ abi: UNISWAP_V3_NPM.abi, functionName: 'refundETH', args: [] })
        const monRaw = monIsT0 ? raw0 : raw1
        mintWrite.writeContract({ address: npmAddr, abi: UNISWAP_V3_NPM.abi, functionName: 'multicall', args: [[mintData, refundData]], value: monRaw })
      } else {
        mintWrite.writeContract({
          address: npmAddr, abi: UNISWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }],
        })
      }
    } else if (wmonSide === 'token0' && currentStep === 1) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    } else if (wmonSide === 'token1' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 2) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    }
  }

  const erc20Sym = wmonSide === 'token0' ? token1Sym : token0Sym
  const btnLabel = isSuccess ? '✓ Position Created'
    : isSigning              ? 'Confirm in wallet…'
    : isWaiting              ? 'Transaction pending…'
    : wmonSide === 'none' && currentStep === 1 ? `Approve ${token0Sym}`
    : wmonSide === 'none' && currentStep === 2 ? `Approve ${token1Sym}`
    : !isMintStep            ? `Approve ${erc20Sym}`
    :                          'Mint Position'

  return (
    <div className="space-y-4">
      {/* Current price */}
      {humanPrice > 0 && (
        <p className="text-xs text-slate-500 px-0.5">
          Current price:{' '}
          {humanPrice < 0.0001
            ? humanPrice.toExponential(4)
            : humanPrice < 1 ? humanPrice.toFixed(6) : humanPrice.toFixed(4)
          } {token1Sym}/{token0Sym}
        </p>
      )}

      {/* Range presets */}
      <div>
        <p className="text-xs text-slate-400 mb-2">Price range strategy</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(V3_RANGE_PRESETS) as V3Preset[]).map(p => (
            <button key={p} type="button" onClick={() => setPreset(p)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                preset === p
                  ? 'border-[#CC3BFF] bg-[#CC3BFF]/10 text-white'
                  : 'border-[#1a2535] text-slate-400 hover:border-[#2a3a52]'
              }`}
            >
              <p className="font-semibold">{V3_RANGE_PRESETS[p].label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{V3_RANGE_PRESETS[p].desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Fee info */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Fee tier</span>
          <span className="text-white font-medium">{(fee / 10000).toFixed(2)}%</span>
        </div>
        {!isFullRange && multiplier > 1 && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Capital efficiency</span>
            <span className="text-emerald-400 font-medium">~{multiplier.toFixed(1)}x vs full range</span>
          </div>
        )}
        <p className="text-[10px] text-slate-600 leading-relaxed pt-0.5">
          Actual APR = fee tier × volume/TVL × 365. Check{' '}
          <span className="text-slate-500">app.uniswap.org</span> for real-time APR.
        </p>
      </div>

      {/* Amount inputs */}
      <AmountInput label={`You deposit (${token0Sym})`} token={token0Sym} value={amt0} onChange={onAmt0Change} max={bal0Str} />
      <AmountInput label={`You deposit (${token1Sym})`} token={token1Sym} value={amt1} onChange={onAmt1Change} max={bal1Str} />

      {(insuf0 || insuf1) && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/>
          </svg>
          <div>
            <p className="text-xs font-semibold text-rose-400">Insufficient balance</p>
            <p className="text-xs text-rose-400/70 mt-0.5">
              {insuf0 && insuf1
                ? `Not enough ${token0Sym} or ${token1Sym}`
                : insuf0
                  ? `Not enough ${token0Sym} (max ${Number(bal0Str).toFixed(4)})`
                  : `Not enough ${token1Sym} (max ${Number(bal1Str).toFixed(4)})`}
            </p>
          </div>
        </div>
      )}

      <Steps steps={stepLabels} current={currentStep} />
      {approveTx.isSuccess && isMintStep && (
        <p className="text-center text-xs text-slate-600">{erc20Sym} approved · now mint position</p>
      )}
      {wmonSide === 'none' && approveTx.isSuccess && currentStep === 2 && (
        <p className="text-center text-xs text-slate-600">{token0Sym} approved · now approve {token1Sym}</p>
      )}

      <Btn
        label={btnLabel}
        onClick={handleAction}
        disabled={!address || raw0 === 0n || raw1 === 0n || insuf0 || insuf1 || isPending || isSuccess}
      />

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Uniswap V4 helpers ────────────────────────────────────────────────────────

// Compute V4 liquidity L from raw float amounts
// Same concentrated-liquidity math as V3
export function computeV4Liquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amt0Float: number,   // token0 raw (float)
  amt1Float: number,   // token1 raw (float, used when price above range)
): bigint {
  if (amt0Float <= 0 && amt1Float <= 0) return 0n
  const sqrtPc = Number(sqrtPriceX96) / 2 ** 96
  const sqrtPa = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPb = Math.sqrt(Math.pow(1.0001, tickUpper))
  if (sqrtPb <= sqrtPa || sqrtPc <= 0) return 0n
  let L: number
  if (sqrtPc <= sqrtPa) {
    L = amt0Float * sqrtPa * sqrtPb / (sqrtPb - sqrtPa)
  } else if (sqrtPc >= sqrtPb) {
    L = amt1Float / (sqrtPb - sqrtPa)
  } else {
    L = amt0Float > 0
      ? amt0Float * sqrtPb * sqrtPc / (sqrtPb - sqrtPc)
      : amt1Float / (sqrtPc - sqrtPa)
  }
  return L > 0 ? BigInt(Math.floor(L * 0.999)) : 0n
}

// Encode modifyLiquidities unlockData
// Actions: MINT_POSITION=0x02, SETTLE_PAIR=0x0D, SWEEP=0x14 (native refund)
// Verified from Uniswap official tx on Monad: actions=020d14
export function encodeV4UnlockData(
  currency0: `0x${string}`,
  currency1: `0x${string}`,
  fee: number,
  tickSpacing: number,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint,
  recipient: `0x${string}`,
  hasNative: boolean,
): `0x${string}` {
  const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`
  // address(1) = msg.sender sentinel used by Uniswap V4 for SWEEP recipient
  const MSG_SENDER = '0x0000000000000000000000000000000000000001' as `0x${string}`
  const poolKeyType = {
    name: 'key', type: 'tuple' as const,
    components: [
      { name: 'currency0',   type: 'address' as const },
      { name: 'currency1',   type: 'address' as const },
      { name: 'fee',         type: 'uint24'  as const },
      { name: 'tickSpacing', type: 'int24'   as const },
      { name: 'hooks',       type: 'address' as const },
    ],
  }
  const mintParams = encodeAbiParameters(
    [poolKeyType,
     { name: 'tickLower',   type: 'int24'   },
     { name: 'tickUpper',   type: 'int24'   },
     { name: 'liquidity',   type: 'uint256' },
     { name: 'amount0Max',  type: 'uint128' },
     { name: 'amount1Max',  type: 'uint128' },
     { name: 'recipient',   type: 'address' },
     { name: 'hookData',    type: 'bytes'   },
    ],
    [
      { currency0, currency1, fee, tickSpacing, hooks: ZERO },
      tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, '0x',
    ]
  )
  const settleParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }],
    [currency0, currency1]
  )
  if (hasNative) {
    const sweepParams = encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }],
      [currency0, MSG_SENDER]
    )
    return encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      ['0x020d14', [mintParams, settleParams, sweepParams]]
    )
  }
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    ['0x020d', [mintParams, settleParams]]
  )
}

// ── Uniswap V4 LP flow ────────────────────────────────────────────────────────
// PositionManager.modifyLiquidities(unlockData, deadline) payable
// Supports all 4 pools: native MON/USDC + ERC20 stablecoin pairs
function UniswapV4Flow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = UNISWAP_V4_POOLS[pool.id]

  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')
  const [preset, setPreset] = useState<V3Preset>('wide')

  const { currency0, c0Dec, c0Sym, currency1, c1Dec, c1Sym, fee, tickSpacing, hasNative, poolId } = info ?? {}

  // Live slot0 from StateView
  const { data: slot0 } = useReadContract({
    address: UNISWAP_V4_STATE_VIEW.address,
    abi: UNISWAP_V4_STATE_VIEW.abi,
    functionName: 'getSlot0',
    args: [poolId as `0x${string}`],
    query: { enabled: !!info, refetchInterval: 15_000 },
  })
  const sqrtPriceX96 = slot0 ? (slot0 as readonly [bigint, number, number, number])[0] : 0n
  const currentTick  = slot0 ? (slot0 as readonly [bigint, number, number, number])[1] : 0

  const humanPrice = sqrtPriceX96 > 0n
    ? Math.pow(Number(sqrtPriceX96) / 2 ** 96, 2) * Math.pow(10, c0Dec - c1Dec)
    : 0

  // Tick range bounds for this tickSpacing
  const minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  const isFullRange = preset === 'full'
  let tickLower: number
  let tickUpper: number
  if (isFullRange) {
    tickLower = minTick; tickUpper = maxTick
  } else {
    const { lowerPct, upperPct } = V3_RANGE_PRESETS[preset]
    tickLower = Math.max(minTick, snapTick(priceToTick(humanPrice * (1 - lowerPct), c0Dec, c1Dec), tickSpacing, 'floor'))
    tickUpper = Math.min(maxTick, snapTick(priceToTick(humanPrice * (1 + upperPct), c0Dec, c1Dec), tickSpacing, 'ceil'))
  }
  const multiplier = capitalMultiplier(tickLower, tickUpper, currentTick)

  // Balances
  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const { data: c0BalRaw } = useReadContract({
    address: currency0 as `0x${string}`,
    abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !hasNative },
  })
  const { data: c1BalRaw } = useReadContract({
    address: currency1 as `0x${string}`,
    abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const c0BalStr = hasNative
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (c0BalRaw !== undefined ? formatUnits(c0BalRaw, c0Dec) : undefined)
  const c1BalStr = c1BalRaw !== undefined ? formatUnits(c1BalRaw, c1Dec) : undefined

  // Amount change handlers — linked via V3/V4 liquidity math
  function onAmt0Change(v: string) {
    setAmt0(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const raw1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, c0Dec))
      setAmt1(raw1 > 0 ? (raw1 / Math.pow(10, c1Dec)).toFixed(Math.min(c1Dec, 6)) : '')
    } else { setAmt1('') }
  }
  function onAmt1Change(v: string) {
    setAmt1(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const raw0 = v3Amount0FromAmount1(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, c1Dec))
      setAmt0(raw0 > 0 ? (raw0 / Math.pow(10, c0Dec)).toFixed(Math.min(c0Dec, 6)) : '')
    } else { setAmt0('') }
  }
  useEffect(() => {
    if (sqrtPriceX96 > 0n && amt0 && Number(amt0) > 0) {
      const raw1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(amt0) * Math.pow(10, c0Dec))
      setAmt1(raw1 > 0 ? (raw1 / Math.pow(10, c1Dec)).toFixed(Math.min(c1Dec, 6)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, sqrtPriceX96])

  // Parsed raw amounts
  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, c0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, c1Dec) : 0n

  // Insufficient balance
  const c0BalWei = hasNative ? (nativeBal?.value ?? 0n) : (c0BalRaw ?? 0n)
  const insuf0 = raw0 > 0n && raw0 > c0BalWei
  const insuf1 = raw1 > 0n && raw1 > (c1BalRaw ?? 0n)

  // V4 uses Permit2 for ERC20 transfers — two-step approval per token:
  //   Step A: ERC20.approve(Permit2, MaxUint256)
  //   Step B: Permit2.approve(token, PositionManager, MaxUint160, 30-day deadline)
  const pmAddr       = UNISWAP_V4_POSITION_MANAGER.address
  const p2Addr       = PERMIT2.address
  const publicClient = usePublicClient()
  const MAX_UINT256  = 2n ** 256n - 1n
  const MAX_UINT160  = 2n ** 160n - 1n
  const P2_DEADLINE  = 2n ** 48n - 1n // type(uint48).max — never expires

  // ERC20 → Permit2 allowances
  const { data: erc20Allow0ToP2 } = useReadContract({
    address: currency0 as `0x${string}`,
    abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, p2Addr],
    query: { enabled: !!address && !hasNative },
  })
  const { data: erc20Allow1ToP2 } = useReadContract({
    address: currency1 as `0x${string}`,
    abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, p2Addr],
    query: { enabled: !!address },
  })
  // Permit2 → PositionManager allowances
  const { data: p2Allow0 } = useReadContract({
    address: p2Addr,
    abi: PERMIT2.abi, functionName: 'allowance',
    args: [address as `0x${string}`, currency0 as `0x${string}`, pmAddr],
    query: { enabled: !!address && !hasNative },
  })
  const { data: p2Allow1 } = useReadContract({
    address: p2Addr,
    abi: PERMIT2.abi, functionName: 'allowance',
    args: [address as `0x${string}`, currency1 as `0x${string}`, pmAddr],
    query: { enabled: !!address },
  })
  const nowSec  = Math.floor(Date.now() / 1000)
  const p2Amt0  = p2Allow0 ? (p2Allow0 as readonly [bigint, number, number])[0] : 0n
  const p2Exp0  = p2Allow0 ? (p2Allow0 as readonly [bigint, number, number])[1] : 0
  const p2Amt1  = p2Allow1 ? (p2Allow1 as readonly [bigint, number, number])[0] : 0n
  const p2Exp1  = p2Allow1 ? (p2Allow1 as readonly [bigint, number, number])[1] : 0

  const c0ErcApproved = hasNative || (raw0 > 0n && (erc20Allow0ToP2 ?? 0n) >= raw0)
  const c0P2Approved  = hasNative || (raw0 > 0n && p2Amt0 >= raw0 && p2Exp0 > nowSec)
  const c1ErcApproved = raw1 > 0n && (erc20Allow1ToP2 ?? 0n) >= raw1
  const c1P2Approved  = raw1 > 0n && p2Amt1 >= raw1 && p2Exp1 > nowSec

  // Internal step (1-5) drives the logic
  // native: [ERC_c1=1, P2_c1=2, Mint=3]   ERC20: [ERC_c0=1, P2_c0=2, ERC_c1=3, P2_c1=4, Mint=5]
  const currentStep = hasNative
    ? (!c1ErcApproved ? 1 : !c1P2Approved ? 2 : 3)
    : (!c0ErcApproved ? 1 : !c0P2Approved ? 2 : !c1ErcApproved ? 3 : !c1P2Approved ? 4 : 5)

  // Visual steps: collapse all approvals into step 1, mint = step 2
  const isMinting   = currentStep === (hasNative ? 3 : 5)
  const visualStep  = isMinting ? 2 : 1
  const stepLabels  = ['Approve tokens', 'Add Liquidity']

  // Specific action label for the button (more descriptive than the visual step label)
  const actionLabel = hasNative
    ? (currentStep === 1 ? `Approve ${c1Sym}` : currentStep === 2 ? `Authorize ${c1Sym}` : 'Add Liquidity')
    : (currentStep === 1 ? `Approve ${c0Sym}` : currentStep === 2 ? `Authorize ${c0Sym}` : currentStep === 3 ? `Approve ${c1Sym}` : currentStep === 4 ? `Authorize ${c1Sym}` : 'Add Liquidity')

  // Write hooks
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const mintWrite    = useWriteContract()
  const mintTx       = useWaitForTransactionReceipt({ hash: mintWrite.data })

  const isSigning = approveWrite.isPending || mintWrite.isPending
  const isWaiting = approveTx.isLoading    || mintTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = mintTx.isSuccess
  const txHash    = mintWrite.data ?? approveWrite.data
  const txError   = approveWrite.error ?? approveTx.error ?? mintWrite.error ?? mintTx.error

  const hasInput  = raw0 > 0n || raw1 > 0n

  // Save tokenId to localStorage after successful V4 mint
  useEffect(() => {
    if (!mintTx.isSuccess || !address) return
    const addr: string = address

    async function findAndSave(w: string) {
      // Primary: parse Transfer(from=0, to=wallet, tokenId) from receipt logs
      const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      const ZERO     = '0x0000000000000000000000000000000000000000000000000000000000000000'
      if (mintTx.data?.logs) {
        for (const log of mintTx.data.logs) {
          if (
            log.address.toLowerCase() === pmAddr.toLowerCase() &&
            log.topics[0] === TRANSFER &&
            log.topics[1] === ZERO &&
            log.topics[3]
          ) {
            saveV4TokenId(w, BigInt(log.topics[3] as string))
            return
          }
        }
      }
      // Fallback: nextTokenId() - 1 (minted id = nextTokenId before increment)
      try {
        const nextId = await publicClient?.readContract({
          address: pmAddr as `0x${string}`,
          abi: NEXT_ID_ABI,
          functionName: 'nextTokenId',
        })
        if (typeof nextId === 'bigint' && nextId > 0n) {
          saveV4TokenId(w, nextId - 1n)
        }
      } catch {}
    }

    findAndSave(addr)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintTx.isSuccess])

  function handleAction() {
    if (!address || isPending || insuf0 || insuf1 || !hasInput) return
    const addr  = address as `0x${string}`
    // Approval steps for Permit2 flow
    if (!hasNative && currentStep === 1) {
      // Approve c0 ERC20 → Permit2
      approveWrite.writeContract({ address: currency0 as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [p2Addr, MAX_UINT256] })
    } else if (!hasNative && currentStep === 2) {
      // Permit2.approve c0 → PositionManager
      approveWrite.writeContract({ address: p2Addr, abi: PERMIT2.abi, functionName: 'approve', args: [currency0 as `0x${string}`, pmAddr, MAX_UINT160, Number(P2_DEADLINE)] })
    } else if (currentStep === (hasNative ? 1 : 3)) {
      // Approve c1 ERC20 → Permit2
      approveWrite.writeContract({ address: currency1 as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [p2Addr, MAX_UINT256] })
    } else if (currentStep === (hasNative ? 2 : 4)) {
      // Permit2.approve c1 → PositionManager
      approveWrite.writeContract({ address: p2Addr, abi: PERMIT2.abi, functionName: 'approve', args: [currency1 as `0x${string}`, pmAddr, MAX_UINT160, Number(P2_DEADLINE)] })
    } else {
      // Mint position
      const amt0Float = Number(amt0) * Math.pow(10, c0Dec)
      const amt1Float = Number(amt1) * Math.pow(10, c1Dec)
      const liquidity = computeV4Liquidity(sqrtPriceX96, tickLower, tickUpper, amt0Float, amt1Float)
      if (liquidity === 0n) return
      const unlockData = encodeV4UnlockData(
        currency0 as `0x${string}`, currency1 as `0x${string}`,
        fee, tickSpacing, tickLower, tickUpper,
        liquidity,
        raw0 * 102n / 100n,  // 2% slippage buffer
        raw1 * 102n / 100n,
        addr, hasNative,
      )
      mintWrite.writeContract({
        address: pmAddr,
        abi: UNISWAP_V4_POSITION_MANAGER.abi,
        functionName: 'modifyLiquidities',
        args: [unlockData, BigInt(Math.floor(Date.now() / 1000) + 1200)],
        // Send amount0Max (with 2% slippage buffer) as msg.value.
        // SETTLE_PAIR uses the actual delta0 from the pool; excess is refunded via SWEEP.
        value: hasNative ? raw0 * 102n / 100n : 0n,
        gas: 3_000_000n,
      })
    }
  }

  const btnLabel = isSuccess  ? '✓ Position Created'
    : isSigning               ? 'Confirm in wallet…'
    : isWaiting               ? 'Transaction pending…'
    : actionLabel

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  return (
    <div className="space-y-4">
      {/* Current price */}
      {humanPrice > 0 && (
        <p className="text-xs text-slate-500 px-0.5">
          Current price:{' '}
          {humanPrice < 0.0001
            ? humanPrice.toExponential(4)
            : humanPrice < 1
            ? humanPrice.toFixed(6)
            : humanPrice.toFixed(4)
          } {c1Sym}/{c0Sym}
        </p>
      )}

      {/* Range presets */}
      <div>
        <p className="text-xs text-slate-400 mb-2">Price range strategy</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(V3_RANGE_PRESETS) as V3Preset[]).map(p => (
            <button key={p} type="button" onClick={() => setPreset(p)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                preset === p
                  ? 'border-[#CC3BFF] bg-[#CC3BFF]/10 text-white'
                  : 'border-[#1a2535] text-slate-400 hover:border-[#2a3a52]'
              }`}
            >
              <p className="font-semibold">{V3_RANGE_PRESETS[p].label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{V3_RANGE_PRESETS[p].desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Fee info */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Fee tier</span>
          <span className="text-white font-medium">
            {fee < 100 ? (fee / 10000).toFixed(4) : fee < 1000 ? (fee / 10000).toFixed(3) : (fee / 10000).toFixed(2)}%
          </span>
        </div>
        {!isFullRange && multiplier > 1 && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Capital efficiency</span>
            <span className="text-emerald-400 font-medium">~{multiplier.toFixed(1)}x vs full range</span>
          </div>
        )}
        <p className="text-[10px] text-slate-600 leading-relaxed pt-0.5">
          Check app.uniswap.org for real-time APR.
        </p>
      </div>

      {/* Token inputs */}
      <AmountInput label={`You deposit (${c0Sym})`} token={c0Sym} value={amt0} onChange={onAmt0Change} max={c0BalStr} />
      <AmountInput label={`You deposit (${c1Sym})`} token={c1Sym} value={amt1} onChange={onAmt1Change} max={c1BalStr} />

      {(insuf0 || insuf1) && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/>
          </svg>
          <p className="text-xs text-rose-400">
            {insuf0 && insuf1 ? `Not enough ${c0Sym} or ${c1Sym}` : insuf0 ? `Not enough ${c0Sym}` : `Not enough ${c1Sym}`}
          </p>
        </div>
      )}

      <Steps steps={stepLabels} current={visualStep} />

      <Btn
        label={btnLabel}
        onClick={handleAction}
        disabled={!address || !hasInput || insuf0 || insuf1 || isPending || isSuccess}
      />

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {txError && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(txError as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Uniswap V2 LP flow (approve token0 → approve token1 → addLiquidity) ───────
// Amounts auto-link to pool ratio via getReserves(). 1% slippage, 20-min deadline.
export function UniswapV2Flow({ pool, address }: { pool: LPPool; address?: string }) {
  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')

  const info = UNISWAP_V2_POOLS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const { address: pairAddr, token0, token0Dec, token0Sym, token1, token1Dec, token1Sym } = info

  // Live reserves — refresh every 15s
  const { data: reserves } = useReadContract({
    address: pairAddr,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: 'getReserves',
    query: { refetchInterval: 15_000 },
  })
  const reserve0 = reserves?.[0] ?? 0n
  const reserve1 = reserves?.[1] ?? 0n

  // Token balances
  const { data: bal0Raw } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`], query: { enabled: !!address },
  })
  const { data: bal1Raw } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`], query: { enabled: !!address },
  })
  const bal0Str = bal0Raw !== undefined ? formatUnits(bal0Raw, token0Dec) : undefined
  const bal1Str = bal1Raw !== undefined ? formatUnits(bal1Raw, token1Dec) : undefined

  // Parsed amounts for tx
  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, token0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, token1Dec) : 0n

  // Insufficient balance checks
  const insuf0 = raw0 > 0n && bal0Raw !== undefined && raw0 > bal0Raw
  const insuf1 = raw1 > 0n && bal1Raw !== undefined && raw1 > bal1Raw

  // Auto-compute paired amount using reserve ratio
  // For a V2 pair: raw1 = raw0 * reserve1 / reserve0 (bigint math, exact)
  function onChange0(v: string) {
    setAmt0(v)
    if (reserve0 > 0n && reserve1 > 0n && v && Number(v) > 0) {
      const r0 = parseUnits(v, token0Dec)
      const r1 = r0 * reserve1 / reserve0
      setAmt1(formatUnits(r1, token1Dec))
    } else {
      setAmt1('')
    }
  }
  function onChange1(v: string) {
    setAmt1(v)
    if (reserve0 > 0n && reserve1 > 0n && v && Number(v) > 0) {
      const r1 = parseUnits(v, token1Dec)
      const r0 = r1 * reserve0 / reserve1
      setAmt0(formatUnits(r0, token0Dec))
    } else {
      setAmt0('')
    }
  }

  // Allowances
  const { data: allow0 } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, UNISWAP_V2_ROUTER.address],
    query: { enabled: !!address },
  })
  const { data: allow1 } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, UNISWAP_V2_ROUTER.address],
    query: { enabled: !!address },
  })
  const approved0 = raw0 > 0n && (allow0 ?? 0n) >= raw0
  const approved1 = raw1 > 0n && (allow1 ?? 0n) >= raw1
  const currentStep: 1 | 2 | 3 = !approved0 ? 1 : !approved1 ? 2 : 3

  // Write hooks
  const approve0Write = useWriteContract()
  const approve0Tx    = useWaitForTransactionReceipt({ hash: approve0Write.data })
  const approve1Write = useWriteContract()
  const approve1Tx    = useWaitForTransactionReceipt({ hash: approve1Write.data })
  const addLiqWrite   = useWriteContract()
  const addLiqTx      = useWaitForTransactionReceipt({ hash: addLiqWrite.data })

  const isSigning = approve0Write.isPending || approve1Write.isPending || addLiqWrite.isPending
  const isWaiting = approve0Tx.isLoading    || approve1Tx.isLoading    || addLiqTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = addLiqTx.isSuccess
  const txHash    = addLiqWrite.data ?? approve1Write.data ?? approve0Write.data
  const error     = approve0Write.error ?? approve0Tx.error ?? approve1Write.error ?? approve1Tx.error ?? addLiqWrite.error ?? addLiqTx.error

  function handleAction() {
    if (!address || raw0 === 0n || raw1 === 0n || isPending) return
    const addr = address as `0x${string}`
    if (currentStep === 1) {
      approve0Write.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [UNISWAP_V2_ROUTER.address, raw0] })
    } else if (currentStep === 2) {
      approve1Write.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [UNISWAP_V2_ROUTER.address, raw1] })
    } else {
      const min0 = raw0 * 99n / 100n
      const min1 = raw1 * 99n / 100n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      addLiqWrite.writeContract({
        address: UNISWAP_V2_ROUTER.address,
        abi: UNISWAP_V2_ROUTER.abi,
        functionName: 'addLiquidity',
        args: [token0, token1, raw0, raw1, min0, min1, addr, deadline],
      })
    }
  }

  const btnLabel = isSuccess   ? '✓ Liquidity Added'
    : isSigning                ? 'Confirm in wallet…'
    : isWaiting                ? 'Transaction pending…'
    : currentStep === 1        ? `Approve ${token0Sym}`
    : currentStep === 2        ? `Approve ${token1Sym}`
                               : 'Add Liquidity'

  return (
    <div className="space-y-4">
      <AmountInput label={`You deposit (${token0Sym})`} token={token0Sym} value={amt0} onChange={onChange0} max={bal0Str} />
      <AmountInput label={`You deposit (${token1Sym})`} token={token1Sym} value={amt1} onChange={onChange1} max={bal1Str} />

      {reserve0 > 0n && reserve1 > 0n && (
        <p className="text-xs text-slate-500 px-0.5">
          Current ratio: 1 {token1Sym} ≈ {(Number(formatUnits(reserve0, token0Dec)) / Number(formatUnits(reserve1, token1Dec))).toFixed(2)} {token0Sym}
        </p>
      )}

      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">Fee APR</span>
        <span className="text-emerald-400 font-semibold">{pool.fee_apr.toFixed(2)}%</span>
      </div>

      <Steps steps={[`Approve ${token0Sym}`, `Approve ${token1Sym}`, 'Add Liquidity']} current={currentStep} />

      {approve0Tx.isSuccess && currentStep === 2 && (
        <p className="text-center text-xs text-slate-600">{token0Sym} approved · now approve {token1Sym}</p>
      )}
      {approve1Tx.isSuccess && currentStep === 3 && (
        <p className="text-center text-xs text-slate-600">{token1Sym} approved · now add liquidity</p>
      )}

      {(insuf0 || insuf1) && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-rose-400">Insufficient balance</p>
            <p className="text-xs text-rose-400/70 mt-0.5">
              {insuf0 && insuf1
                ? `Not enough ${token0Sym} or ${token1Sym}`
                : insuf0
                  ? `Not enough ${token0Sym} (max ${Number(bal0Str).toFixed(4)})`
                  : `Not enough ${token1Sym} (max ${Number(bal1Str).toFixed(4)})`}
            </p>
          </div>
        </div>
      )}

      <Btn
        label={btnLabel}
        onClick={handleAction}
        disabled={!address || raw0 === 0n || raw1 === 0n || insuf0 || insuf1 || isPending || isSuccess}
      />

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── PancakeSwap V3 LP flow ────────────────────────────────────────────────────
// PancakeSwap V3 is a fork of Uniswap V3 — same NPM interface (mint/refundETH/multicall)
// WMON pools: send native MON as msg.value → NPM wraps to WMON internally + refundETH
// ERC20-only pools: approve both tokens → call mint directly (no multicall needed)
function PancakeSwapV3Flow({ pool, address }: { pool: LPPool; address?: string }) {
  const info = PANCAKESWAP_V3_POOLS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const { address: poolAddr, token0, t0Dec, t0Sym, token1, t1Dec, t1Sym, fee, tickSpacing, wmonSide } = info
  const hasNative  = wmonSide !== 'none'
  const monIsT0    = wmonSide === 'token0'

  const [amt0, setAmt0] = useState('')
  const [amt1, setAmt1] = useState('')
  const [preset, setPreset] = useState<V3Preset>('wide')

  // Live slot0 — sqrtPriceX96 + currentTick
  const { data: slot0 } = useReadContract({
    address: poolAddr,
    abi: PANCAKESWAP_V3_POOL_ABI,
    functionName: 'slot0',
    query: { refetchInterval: 15_000 },
  })
  const sqrtPriceX96 = slot0?.[0] ?? 0n
  const currentTick  = slot0?.[1] ?? 0

  // Human price: t1 per t0
  const humanPrice = sqrtPriceX96 > 0n
    ? Math.pow(Number(sqrtPriceX96) / 2 ** 96, 2) * Math.pow(10, t0Dec - t1Dec)
    : 0

  // Tick bounds for this pool's tickSpacing (1, 10, or 50)
  const minTick = Math.ceil(-887272  / tickSpacing) * tickSpacing
  const maxTick = Math.floor(887272 / tickSpacing) * tickSpacing

  const isFullRange = preset === 'full'
  let tickLower: number
  let tickUpper: number
  if (isFullRange) {
    tickLower = minTick; tickUpper = maxTick
  } else {
    const { lowerPct, upperPct } = V3_RANGE_PRESETS[preset]
    tickLower = Math.max(minTick, snapTick(priceToTick(humanPrice * (1 - lowerPct), t0Dec, t1Dec), tickSpacing, 'floor'))
    tickUpper = Math.min(maxTick, snapTick(priceToTick(humanPrice * (1 + upperPct), t0Dec, t1Dec), tickSpacing, 'ceil'))
  }
  const multiplier = capitalMultiplier(tickLower, tickUpper, currentTick)

  // Balances
  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const { data: bal0Raw } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: bal1Raw } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const bal0Str = monIsT0
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (bal0Raw !== undefined ? formatUnits(bal0Raw, t0Dec) : undefined)
  const bal1Str = wmonSide === 'token1'
    ? (nativeBal ? formatUnits(nativeBal.value, 18) : undefined)
    : (bal1Raw !== undefined ? formatUnits(bal1Raw, t1Dec) : undefined)

  // Amount change handlers — linked via V3 liquidity math
  function onAmt0Change(v: string) {
    setAmt0(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const raw1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, t0Dec))
      setAmt1(raw1 > 0 ? (raw1 / Math.pow(10, t1Dec)).toFixed(Math.min(t1Dec, 6)) : '')
    } else { setAmt1('') }
  }
  function onAmt1Change(v: string) {
    setAmt1(v)
    if (sqrtPriceX96 > 0n && v && Number(v) > 0) {
      const raw0 = v3Amount0FromAmount1(sqrtPriceX96, tickLower, tickUpper, Number(v) * Math.pow(10, t1Dec))
      setAmt0(raw0 > 0 ? (raw0 / Math.pow(10, t0Dec)).toFixed(Math.min(t0Dec, 6)) : '')
    } else { setAmt0('') }
  }
  useEffect(() => {
    if (sqrtPriceX96 > 0n && amt0 && Number(amt0) > 0) {
      const raw1 = v3Amount1FromAmount0(sqrtPriceX96, tickLower, tickUpper, Number(amt0) * Math.pow(10, t0Dec))
      setAmt1(raw1 > 0 ? (raw1 / Math.pow(10, t1Dec)).toFixed(Math.min(t1Dec, 6)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, sqrtPriceX96])

  // Parsed raw amounts
  const raw0 = amt0 && Number(amt0) > 0 ? parseUnits(amt0, t0Dec) : 0n
  const raw1 = amt1 && Number(amt1) > 0 ? parseUnits(amt1, t1Dec) : 0n

  // Insufficient balance
  const bal0Wei = monIsT0       ? (nativeBal?.value ?? 0n) : (bal0Raw ?? 0n)
  const bal1Wei = wmonSide === 'token1' ? (nativeBal?.value ?? 0n) : (bal1Raw ?? 0n)
  const insuf0 = raw0 > 0n && raw0 > bal0Wei
  const insuf1 = raw1 > 0n && raw1 > bal1Wei

  // ERC20 allowances — only for the non-native sides
  const npmAddr = PANCAKESWAP_V3_NPM.address
  const { data: allow0 } = useReadContract({
    address: token0, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && !monIsT0 },
  })
  const { data: allow1 } = useReadContract({
    address: token1, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, npmAddr],
    query: { enabled: !!address && wmonSide !== 'token1' },
  })
  const t0Approved = raw0 > 0n && (allow0 ?? 0n) >= raw0
  const t1Approved = raw1 > 0n && (allow1 ?? 0n) >= raw1

  // Step logic
  // wmonSide='token0': only token1 (ERC20) needs approval → [approve_t1, mint]
  // wmonSide='token1': only token0 (ERC20) needs approval → [approve_t0, mint]
  // wmonSide='none':   both tokens need approval          → [approve_t0, approve_t1, mint]
  const currentStep = wmonSide === 'token0'
    ? (!t1Approved ? 1 : 2)
    : wmonSide === 'token1'
      ? (!t0Approved ? 1 : 2)
      : (!t0Approved ? 1 : !t1Approved ? 2 : 3)

  const stepLabels = wmonSide === 'token0'
    ? [`Approve ${t1Sym}`, 'Mint Position']
    : wmonSide === 'token1'
      ? [`Approve ${t0Sym}`, 'Mint Position']
      : [`Approve ${t0Sym}`, `Approve ${t1Sym}`, 'Mint Position']

  // Write hooks
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const mintWrite    = useWriteContract()
  const mintTx       = useWaitForTransactionReceipt({ hash: mintWrite.data })

  const isSigning = approveWrite.isPending || mintWrite.isPending
  const isWaiting = approveTx.isLoading    || mintTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = mintTx.isSuccess
  const txHash    = mintWrite.data ?? approveWrite.data
  const error     = approveWrite.error ?? approveTx.error ?? mintWrite.error ?? mintTx.error

  const isMintStep = wmonSide === 'none' ? currentStep === 3 : currentStep === 2

  function handleAction() {
    if (!address || raw0 === 0n || raw1 === 0n || isPending || insuf0 || insuf1) return
    const addr = address as `0x${string}`

    if (isMintStep) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      if (hasNative) {
        // multicall([mint, refundETH]) with native MON as msg.value
        const mintData = encodeFunctionData({
          abi: PANCAKESWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }],
        })
        const refundData = encodeFunctionData({ abi: PANCAKESWAP_V3_NPM.abi, functionName: 'refundETH', args: [] })
        const monRaw = monIsT0 ? raw0 : raw1
        mintWrite.writeContract({ address: npmAddr, abi: PANCAKESWAP_V3_NPM.abi, functionName: 'multicall', args: [[mintData, refundData]], value: monRaw })
      } else {
        // ERC20-only: call mint directly
        mintWrite.writeContract({
          address: npmAddr, abi: PANCAKESWAP_V3_NPM.abi, functionName: 'mint',
          args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired: raw0, amount1Desired: raw1, amount0Min: raw0 * 95n / 100n, amount1Min: raw1 * 95n / 100n, recipient: addr, deadline }],
        })
      }
    } else if (wmonSide === 'token0' && currentStep === 1) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    } else if (wmonSide === 'token1' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 1) {
      approveWrite.writeContract({ address: token0, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw0] })
    } else if (wmonSide === 'none' && currentStep === 2) {
      approveWrite.writeContract({ address: token1, abi: ERC20_ABI, functionName: 'approve', args: [npmAddr, raw1] })
    }
  }

  const erc20Sym = wmonSide === 'token0' ? t1Sym : t0Sym
  const btnLabel = isSuccess  ? '✓ Position Created'
    : isSigning              ? 'Confirm in wallet…'
    : isWaiting              ? 'Transaction pending…'
    : wmonSide === 'none' && currentStep === 1 ? `Approve ${t0Sym}`
    : wmonSide === 'none' && currentStep === 2 ? `Approve ${t1Sym}`
    : !isMintStep            ? `Approve ${erc20Sym}`
    :                          'Mint Position'

  return (
    <div className="space-y-4">
      {/* Current price */}
      {humanPrice > 0 && (
        <p className="text-xs text-slate-500 px-0.5">
          Current price:{' '}
          {humanPrice < 0.0001
            ? humanPrice.toExponential(4)
            : humanPrice < 1 ? humanPrice.toFixed(6) : humanPrice.toFixed(4)
          } {t1Sym}/{t0Sym}
        </p>
      )}

      {/* Range presets */}
      <div>
        <p className="text-xs text-slate-400 mb-2">Price range strategy</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(V3_RANGE_PRESETS) as V3Preset[]).map(p => (
            <button key={p} type="button" onClick={() => setPreset(p)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                preset === p
                  ? 'border-[#CC3BFF] bg-[#CC3BFF]/10 text-white'
                  : 'border-[#1a2535] text-slate-400 hover:border-[#2a3a52]'
              }`}
            >
              <p className="font-semibold">{V3_RANGE_PRESETS[p].label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{V3_RANGE_PRESETS[p].desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Fee info */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Fee tier</span>
          <span className="text-white font-medium">{(fee / 10000).toFixed(2)}%</span>
        </div>
        {!isFullRange && multiplier > 1 && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Capital efficiency</span>
            <span className="text-emerald-400 font-medium">~{multiplier.toFixed(1)}x vs full range</span>
          </div>
        )}
        <p className="text-[10px] text-slate-600 leading-relaxed pt-0.5">
          Actual APR = fee tier × volume/TVL × 365. Check{' '}
          <span className="text-slate-500">pancakeswap.finance</span> for real-time APR.
        </p>
      </div>

      {/* Amount inputs */}
      <AmountInput label={`You deposit (${t0Sym})`} token={t0Sym} value={amt0} onChange={onAmt0Change} max={bal0Str} />
      <AmountInput label={`You deposit (${t1Sym})`} token={t1Sym} value={amt1} onChange={onAmt1Change} max={bal1Str} />

      {(insuf0 || insuf1) && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/>
          </svg>
          <div>
            <p className="text-xs font-semibold text-rose-400">Insufficient balance</p>
            <p className="text-xs text-rose-400/70 mt-0.5">
              {insuf0 && insuf1
                ? `Not enough ${t0Sym} or ${t1Sym}`
                : insuf0
                  ? `Not enough ${t0Sym} (max ${Number(bal0Str).toFixed(4)})`
                  : `Not enough ${t1Sym} (max ${Number(bal1Str).toFixed(4)})`}
            </p>
          </div>
        </div>
      )}

      <Steps steps={stepLabels} current={currentStep} />
      {approveTx.isSuccess && isMintStep && (
        <p className="text-center text-xs text-slate-600">
          {wmonSide === 'token0' ? t1Sym : t0Sym} approved · now mint position
        </p>
      )}
      {wmonSide === 'none' && approveTx.isSuccess && currentStep === 2 && (
        <p className="text-center text-xs text-slate-600">{t0Sym} approved · now approve {t1Sym}</p>
      )}

      <Btn
        label={btnLabel}
        onClick={handleAction}
        disabled={!address || raw0 === 0n || raw1 === 0n || insuf0 || insuf1 || isPending || isSuccess}
      />

      {txHash && (
        <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}
      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Lending Flow — dispatch by protocol ───────────────────────────────────────
export function LendingFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  if (pool.protocol === 'Morpho')    return <MorphoFlow pool={pool} address={address} />
  if (pool.protocol === 'Neverland') return <NeverlandFlow pool={pool} address={address} />
  if (pool.protocol === 'Curvance')  return <CurvanceLendingFlow pool={pool} address={address} />
  return (
    <div className="text-center py-8 space-y-1.5">
      <p className="text-slate-400 text-sm font-medium">{pool.protocol} lending deposit</p>
      <p className="text-slate-600 text-xs">Coming soon</p>
    </div>
  )
}

// ── Borrow Flow ───────────────────────────────────────────────────────────────
export function BorrowFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  if (pool.protocol === 'Curvance') {
    return <CurvanceBorrowFlow pool={pool} address={address} />
  }
  return <NeverlandBorrowFlow pool={pool} address={address} />
}

// ── Main export ───────────────────────────────────────────────────────────────
export function DepositModal({ pool, onClose }: { pool: Pool; onClose: () => void }) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [connectOpen, setConnectOpen] = useState(false)

  const isLP = pool.type === 'lp'
  const isBorrow = pool.type === 'borrowing'
  const rawAsset = (pool as LendingPool).asset ?? pool.id
  const name = isLP
    ? `${(pool as LPPool).token0}/${(pool as LPPool).token1}`
    : pool.protocol === 'Curvance' && pool.type === 'lending'
      ? (CURVANCE_MARKETS[pool.id]?.colSym ?? rawAsset.split('/')[0])
      : rawAsset
  const bg = PROTOCOL_BG[pool.protocol] ?? 'bg-slate-600'
  const typeLabel: Record<string, string> = {
    lending: 'Lending', borrowing: 'Borrowing',
    liquid_staking: 'Liquid Staking', staking: 'Staking', lp: 'LP',
  }
  const action = isBorrow ? 'Borrow' : 'Deposit'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-[#0d1520] border border-[#1a2535] rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-[#1a2535]">
          <div className="flex items-center gap-3">
            <span className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${bg}`}>
              {name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="font-bold text-white">{action} {name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{pool.protocol} · {typeLabel[pool.type]}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Full pool banner — hide for Curvance (managed separately) */}
          {pool.status === 'full' && pool.protocol !== 'Curvance' && (
            <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl px-4 py-3 text-xs text-slate-400 leading-relaxed">
              This pool is currently at capacity — no new deposits are accepted. Check back later when capacity opens up.
            </div>
          )}

          {/* Wallet state */}
          {isConnected && address ? (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-slate-400 font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>
              </div>
              <button
                type="button"
                onClick={() => disconnect()}
                className="text-slate-600 hover:text-slate-400 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 gap-3">
              <div>
                <p className="text-sm font-medium text-white">Connect wallet</p>
                <p className="text-xs text-slate-500 mt-0.5">Required to {action.toLowerCase()}</p>
              </div>
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="shrink-0 px-4 py-1.5 text-xs font-semibold bg-[#CC3BFF] hover:opacity-90 text-white rounded-lg transition-colors"
              >
                Connect
              </button>
            </div>
          )}
          {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}

          {/* Flow by type */}
          {pool.type === 'liquid_staking' && (
            <LSTFlow pool={pool as LiquidStakingPool} address={address} />
          )}
          {pool.type === 'lending' && (
            <LendingFlow pool={pool as LendingPool} address={address} />
          )}
          {pool.type === 'borrowing' && (
            <BorrowFlow pool={pool as BorrowingPool} address={address} />
          )}
          {(pool.type === 'lp' || pool.type === 'staking') && (
            pool.protocol === 'Kuru' && pool.id.startsWith('kuru-vault-')
              ? <KuruVaultFlow pool={pool as LPPool} address={address} />
              : pool.protocol === 'Clober'
                ? <CloberFlow pool={pool as LPPool} address={address} />
                : pool.protocol === 'Uniswap' && pool.id.startsWith('uniswap-v4-')
                  ? <UniswapV4Flow pool={pool as LPPool} address={address} />
                  : pool.protocol === 'Uniswap' && pool.id.startsWith('uniswap-v3-')
                  ? <UniswapV3Flow pool={pool as LPPool} address={address} />
                  : pool.protocol === 'Uniswap' && pool.id.startsWith('uniswap-v2-')
                  ? <UniswapV2Flow pool={pool as LPPool} address={address} />
                  : pool.protocol === 'PancakeSwap'
                  ? <PancakeSwapV3Flow pool={pool as LPPool} address={address} />
                  : (
                    <div className="text-center py-8 space-y-1.5">
                      <p className="text-slate-400 text-sm font-medium">
                        {pool.type === 'lp' ? 'LP deposit' : 'Staking'} coming soon
                      </p>
                      <p className="text-slate-600 text-xs">We&apos;re working on it</p>
                    </div>
                  )
          )}
        </div>
      </div>
    </div>
  )
}
