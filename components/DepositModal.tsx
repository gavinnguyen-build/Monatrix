'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSendTransaction } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseEther, parseUnits, formatUnits, encodeFunctionData, encodeAbiParameters } from 'viem'
import type { Pool, LendingPool, BorrowingPool, LiquidStakingPool, LPPool } from '@/types'
import { APRIORI, FASTLANE, KINTSU, MAGMA, ERC20_ABI, ERC4626_ABI, MORPHO_VAULTS, NEVERLAND, NEVERLAND_ORACLE, NEVERLAND_RESERVES, NEVERLAND_BORROW_RESERVES, CURVANCE_MARKETS, CURVANCE_BORROW_MARKETS, CURVANCE_BORROW_ABI, KURU_VAULTS, KURU_VAULT_ABI, KURU_MARGIN_ACCOUNT, TOKENS, CLOBER_POOLS, UNISWAP_V2_ROUTER, UNISWAP_V2_PAIR_ABI, UNISWAP_V2_POOLS, UNISWAP_V3_NPM, UNISWAP_V3_POOL_ABI, UNISWAP_V3_POOLS, UNISWAP_V4_POSITION_MANAGER, UNISWAP_V4_STATE_VIEW, UNISWAP_V4_POOLS, PERMIT2, PANCAKESWAP_V3_NPM, PANCAKESWAP_V3_POOL_ABI, PANCAKESWAP_V3_POOLS } from '@/lib/contracts'
import { addLiquidity, CHAIN_IDS } from '@clober/v2-sdk'

// ── Token name map ────────────────────────────────────────────────────────────
const TOKEN_NAMES: Record<string, string> = {
  shmon: 'shMON', gmon: 'gMON', smon: 'sMON', aprmon: 'aprMON',
  wmon: 'WMON', wbtc: 'WBTC', weth: 'WETH', ausd: 'AUSD',
  usdc: 'USDC', usdt0: 'USDT0', mon: 'MON', earnausd: 'earnAUSD',
}
const fmtToken = (s: string) => TOKEN_NAMES[s.toLowerCase()] ?? s.toUpperCase()

// ── Protocol colors ───────────────────────────────────────────────────────────
const PROTOCOL_BG: Record<string, string> = {
  Curvance: 'bg-purple-600', Morpho: 'bg-emerald-600', Neverland: 'bg-blue-600',
  Kuru: 'bg-amber-500', PancakeSwap: 'bg-pink-500', Clober: 'bg-red-500',
  Uniswap: 'bg-fuchsia-500', Fastlane: 'bg-violet-600', Kintsu: 'bg-teal-500',
  Magma: 'bg-orange-500', Apriori: 'bg-indigo-600',
}

// ── LST receipt tokens ────────────────────────────────────────────────────────
const LST_RECEIPT: Record<string, string> = {
  Magma: 'gMON', Fastlane: 'shMON', Kintsu: 'sMON', Apriori: 'aprMON',
}

// ── Amount input ──────────────────────────────────────────────────────────────
function AmountInput({ label, token, value, onChange, max }: {
  label: string; token: string; value: string
  onChange: (v: string) => void; max?: string
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
          type="number"
          min="0"
          step="any"
          placeholder="0.00"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-transparent px-4 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="px-4 py-3 text-sm font-semibold text-slate-300 border-l border-[#1a2535] bg-[#0d1520] shrink-0">
          {token}
        </span>
      </div>
    </div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────
function Steps({ steps, current }: { steps: string[]; current: number }) {
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
function Btn({ label, onClick, disabled }: {
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
function LSTFlow({ pool, address }: { pool: LiquidStakingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const { data: bal } = useBalance({ address: address as `0x${string}` | undefined })
  const receipt = LST_RECEIPT[pool.protocol] ?? pool.asset
  const balStr = bal ? (Number(bal.value) / 10 ** bal.decimals).toString() : undefined

  // All 3 LST protocols use writeContract (proper contract call, not plain transfer)
  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })

  const isPending = isSigning || isConfirming
  const error = writeError ?? receiptError

  function handleDeposit() {
    if (!address || !amount || Number(amount) <= 0) return
    const value = parseEther(amount)
    const receiver = address as `0x${string}`

    if (pool.protocol === 'Fastlane') {
      writeContract({
        address: FASTLANE.address,
        abi: FASTLANE.abi,
        functionName: 'deposit',
        args: [value, receiver],
        value,
      })
    } else if (pool.protocol === 'Kintsu') {
      writeContract({
        address: KINTSU.address,
        abi: KINTSU.abi,
        functionName: 'deposit',
        args: [0n, receiver],
        value,
      })
    } else if (pool.protocol === 'Magma') {
      writeContract({
        address: MAGMA.address,
        abi: MAGMA.abi,
        functionName: 'depositMON',
        args: [receiver, 0n], // referralId = 0
        value,
      })
    } else if (pool.protocol === 'Apriori') {
      writeContract({
        address: APRIORI.address,
        abi: APRIORI.abi,
        functionName: 'deposit',
        args: [value, receiver],
        value,
      })
    }
  }

  const btnLabel = isSuccess
    ? `✓ Deposited ${amount} MON`
    : isSigning    ? 'Confirm in wallet…'
    : isConfirming ? 'Transaction pending…'
    : 'Deposit MON'

  return (
    <div className="space-y-4">
      <AmountInput
        label="You deposit"
        token="MON"
        value={amount}
        onChange={setAmount}
        max={balStr}
      />

      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">You receive</span>
        <span className="text-sm font-semibold text-white">
          {amount && Number(amount) > 0
            ? `≈ ${Number(amount).toFixed(4)} ${receipt}`
            : `— ${receipt}`}
        </span>
      </div>

      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">APY</span>
        <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
      </div>

      <Btn
        label={btnLabel}
        onClick={handleDeposit}
        disabled={!address || !amount || Number(amount) <= 0 || isPending || isSuccess}
      />

      {/* Tx hash link */}
      {txHash && (
        <a
          href={`https://monadexplorer.com/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate"
        >
          {txHash.slice(0, 20)}…{txHash.slice(-8)} ↗
        </a>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Morpho lending flow (ERC4626: approve → deposit) ─────────────────────────
function MorphoFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const info = MORPHO_VAULTS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Vault config not found for {pool.id}</p>

  const { vault, asset: assetAddr, decimals } = info
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Token balance via balanceOf (wagmi v2 dropped token param from useBalance)
  const { data: balRaw } = useReadContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const balStr = balRaw !== undefined ? (Number(balRaw) / 10 ** decimals).toString() : undefined

  // Allowance — how much the vault is approved to spend
  const { data: allowance } = useReadContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, vault],
    query: { enabled: !!address },
  })

  const isApproved = parsedAmt > 0n && (allowance ?? 0n) >= parsedAmt
  const currentStep = isApproved ? 2 : 1

  // Approve tx
  const approveWrite = useWriteContract()
  const approveTx = useWaitForTransactionReceipt({ hash: approveWrite.data })

  // Deposit tx
  const depositWrite = useWriteContract()
  const depositTx = useWaitForTransactionReceipt({ hash: depositWrite.data })

  const isSigning  = approveWrite.isPending || depositWrite.isPending
  const isWaiting  = approveTx.isLoading   || depositTx.isLoading
  const isPending  = isSigning || isWaiting
  const isSuccess  = depositTx.isSuccess
  const txHash     = depositWrite.data ?? approveWrite.data
  const error      = approveWrite.error ?? approveTx.error ?? depositWrite.error ?? depositTx.error

  function handleAction() {
    if (!address || parsedAmt === 0n || isPending) return
    const receiver = address as `0x${string}`
    if (currentStep === 1) {
      approveWrite.writeContract({ address: assetAddr, abi: ERC20_ABI, functionName: 'approve', args: [vault, parsedAmt] })
    } else {
      depositWrite.writeContract({ address: vault, abi: ERC4626_ABI, functionName: 'deposit', args: [parsedAmt, receiver] })
    }
  }

  const btnLabel = isSuccess        ? `✓ Deposited ${amount} ${pool.asset}`
    : isSigning                     ? 'Confirm in wallet…'
    : isWaiting                     ? 'Transaction pending…'
    : currentStep === 1             ? `Approve ${pool.asset}`
                                    : `Deposit ${pool.asset}`

  return (
    <div className="space-y-4">
      <AmountInput label="You deposit" token={pool.asset} value={amount} onChange={setAmount} max={balStr} />

      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">Supply APY</span>
        <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
      </div>

      <Steps steps={[`Approve ${pool.asset}`, `Deposit ${pool.asset}`]} current={currentStep} />

      {approveTx.isSuccess && currentStep === 2 && (
        <p className="text-center text-xs text-slate-600">Approval confirmed · now deposit</p>
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
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Neverland lending flow (Aave V3: approve → supply, with MON→WMON wrap) ────
const WMON_ADDR = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`
const WMON_DEPOSIT_ABI = [{ name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] }] as const

function NeverlandFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const info = NEVERLAND_RESERVES[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Reserve config not found for {pool.id}</p>

  const { asset: assetAddr, decimals } = info
  // MON/WMON pools: asset address = WMON ERC20, but users hold native MON
  const isNativeMON = assetAddr.toLowerCase() === WMON_ADDR.toLowerCase()
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Native MON balance (for display on MON/WMON pools)
  const { data: nativeBal } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address && isNativeMON },
  })

  // ERC20 balance (WMON or other asset — needed for step logic)
  const { data: erc20BalRaw } = useReadContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })

  // Display balance: native MON for WMON pools, ERC20 otherwise
  const displayBal = isNativeMON
    ? (nativeBal ? (Number(nativeBal.value) / 10 ** nativeBal.decimals).toString() : undefined)
    : (erc20BalRaw !== undefined ? (Number(erc20BalRaw) / 10 ** decimals).toString() : undefined)

  const { data: allowance } = useReadContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, NEVERLAND.pool],
    query: { enabled: !!address },
  })

  const isApproved = parsedAmt > 0n && (allowance ?? 0n) >= parsedAmt
  const hasSufficientWMON = (erc20BalRaw ?? 0n) >= parsedAmt

  // Step: for MON→WMON pool: 1=wrap, 2=approve, 3=supply. Others: 1=approve, 2=supply
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

  const steps = isNativeMON
    ? ['Wrap MON', 'Approve WMON', 'Supply WMON']
    : [`Approve ${pool.asset}`, `Supply ${pool.asset}`]

  const btnLabel = isSuccess     ? `✓ Supplied ${amount} ${isNativeMON ? 'MON' : pool.asset}`
    : isSigning                  ? 'Confirm in wallet…'
    : isWaiting                  ? 'Transaction pending…'
    : isNativeMON && currentStep === 1 ? 'Wrap MON → WMON'
    : isNativeMON && currentStep === 2 ? 'Approve WMON'
    : isNativeMON && currentStep === 3 ? 'Supply WMON'
    : currentStep === 1          ? `Approve ${pool.asset}`
                                 : `Supply ${pool.asset}`

  return (
    <div className="space-y-4">
      <AmountInput
        label="You supply"
        token={isNativeMON ? 'MON' : pool.asset}
        value={amount}
        onChange={setAmount}
        max={displayBal}
      />
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
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
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

// ── Neverland borrow flow (Aave V3: no approve, just borrow) ─────────────────
// Prerequisite: user must have already supplied collateral via lending flow.
// interestRateMode = 2 (variable rate — Aave V3 only supports variable)
function NeverlandBorrowFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const info = NEVERLAND_BORROW_RESERVES[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Reserve config not found for {pool.id}</p>

  const { asset: assetAddr, decimals } = info
  const sym = (pool as BorrowingPool).asset
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Account health from Pool contract — shows collateral & available borrows
  const { data: accountData } = useReadContract({
    address: NEVERLAND.pool,
    abi: NEVERLAND.abi,
    functionName: 'getUserAccountData',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })

  // Asset price from PriceOracle — 8 decimal USD price
  const { data: assetPrice } = useReadContract({
    address: NEVERLAND_ORACLE.address,
    abi: NEVERLAND_ORACLE.abi,
    functionName: 'getAssetPrice',
    args: [assetAddr],
    query: { enabled: !!address },
  })

  // Safe max borrow = (totalCollateral × liqThreshold / 10000 / 1.1) - totalDebt
  // Matches Neverland's UI which targets HF ≥ 1.1, not the raw Aave availableBorrowsBase (HF → 1.0)
  // accountData[0]=totalCollateralBase, [1]=totalDebtBase, [3]=liqThreshold (basis pts, 10000=100%)
  // In bigint: (collateral × liqThreshold) / 11000 − debt  (÷11000 = ÷10000 then ÷1.1)
  const maxBorrowBase = (accountData && assetPrice && assetPrice > 0n)
    ? (accountData[0] * accountData[3]) / 11000n - accountData[1]
    : null
  const maxBorrowBigInt = (maxBorrowBase !== null && maxBorrowBase > 0n && assetPrice)
    ? (maxBorrowBase * BigInt(10 ** decimals)) / assetPrice
    : null
  // Float only for display
  const availableTokens = maxBorrowBigInt !== null
    ? Number(maxBorrowBigInt) / 10 ** decimals
    : null
  const hasCollateral = accountData ? accountData[0] > 0n : false

  // Projected health factor after this borrow
  // newBorrowUSD (8 dec) = entered token amount × oracle price (8 dec per whole token)
  // projectedHF = (collateral × liqThreshold%) / (currentDebt + newBorrowUSD)
  const projectedHF = (() => {
    if (!accountData) return null
    const colUSD   = Number(accountData[0])  // 8 dec
    const debtUSD  = Number(accountData[1])  // 8 dec
    const liqThres = Number(accountData[3])  // basis points, 10000 = 100%
    const newBorrowUSD = (amount && Number(amount) > 0 && assetPrice)
      ? Number(amount) * Number(assetPrice)  // token_amount × price(8dec) → USD(8dec)
      : 0
    const denom = debtUSD + newBorrowUSD
    if (denom === 0) return Infinity
    return (colUSD * liqThres / 10000) / denom
  })()

  const { writeContract, data: txHash, isPending: isSigning, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash })

  const isPending = isSigning || isConfirming
  const error = writeError ?? receiptError

  function handleBorrow() {
    if (!address || parsedAmt === 0n || isPending) return
    writeContract({
      address: NEVERLAND.pool,
      abi: NEVERLAND.abi,
      functionName: 'borrow',
      args: [assetAddr, parsedAmt, 2n, 0, address as `0x${string}`],
    })
  }

  const btnLabel = isSuccess        ? `✓ Borrowed ${amount} ${sym}`
    : isSigning                     ? 'Confirm in wallet…'
    : isConfirming                  ? 'Transaction pending…'
                                    : `Borrow ${sym}`

  return (
    <div className="space-y-4">
      {/* Collateral warning if no collateral supplied */}
      {address && !hasCollateral && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-300 leading-relaxed">
          You have no collateral in Neverland. Supply assets via the Lending pools first.
        </div>
      )}

      {/* Account overview */}
      {address && hasCollateral && availableTokens !== null && (
        <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Available to borrow</span>
            <span className="text-white font-medium">
              {availableTokens.toFixed(decimals <= 6 ? 2 : 4)} {sym}
            </span>
          </div>
          {projectedHF !== null && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">
                Health factor{amount && Number(amount) > 0 ? ' (after borrow)' : ''}
              </span>
              <span className={`font-semibold ${
                projectedHF === Infinity || projectedHF > 2  ? 'text-emerald-400'
                : projectedHF > 1.2                          ? 'text-yellow-400'
                :                                              'text-rose-400'
              }`}>
                {projectedHF === Infinity ? '∞' : projectedHF.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      <AmountInput
        label="Amount to borrow"
        token={sym}
        value={amount}
        onChange={setAmount}
        max={maxBorrowBigInt !== null ? (Number(maxBorrowBigInt) / 10 ** decimals).toFixed(decimals) : undefined}
      />

      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">Borrow APR</span>
        <span className="text-rose-400 font-semibold">{pool.apy.toFixed(2)}%</span>
      </div>

      {/* Warn if amount exceeds available borrow capacity */}
      {maxBorrowBigInt !== null && parsedAmt > maxBorrowBigInt && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Exceeds available borrow capacity ({availableTokens?.toFixed(decimals <= 6 ? 2 : 4)} {sym})
        </p>
      )}

      <Btn
        label={btnLabel}
        onClick={handleBorrow}
        disabled={
          !address || parsedAmt === 0n || isPending || isSuccess || !hasCollateral ||
          (maxBorrowBigInt !== null && parsedAmt > maxBorrowBigInt)
        }
      />

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
  )
}

// ── Curvance lending flow (ERC4626: approve colAsset → deposit into colCToken) ──
// Deposit = supply COLLATERAL (left side of pair, e.g. shMON in shMON/WMON)
function CurvanceLendingFlow({ pool, address }: { pool: LendingPool; address?: string }) {
  const [amount, setAmount] = useState('')
  const info = CURVANCE_MARKETS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Market config not found for {pool.id}</p>

  const { colCToken, colAsset, colDec, colSym } = info
  const isNativeMON = colAsset.toLowerCase() === WMON_ADDR.toLowerCase()
  const parsedAmt = amount && Number(amount) > 0 ? parseUnits(amount, colDec) : 0n

  // Native MON balance (for WMON col pools)
  const { data: nativeBal } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address && isNativeMON },
  })

  // ERC20 balance of col asset
  const { data: erc20BalRaw } = useReadContract({
    address: colAsset,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })

  const displayBal = isNativeMON
    ? (nativeBal ? (Number(nativeBal.value) / 10 ** nativeBal.decimals).toString() : undefined)
    : (erc20BalRaw !== undefined ? (Number(erc20BalRaw) / 10 ** colDec).toString() : undefined)

  const { data: allowance } = useReadContract({
    address: colAsset,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, colCToken],
    query: { enabled: !!address },
  })

  const isApproved = parsedAmt > 0n && (allowance ?? 0n) >= parsedAmt
  const hasSufficientWMON = (erc20BalRaw ?? 0n) >= parsedAmt

  const currentStep = isNativeMON
    ? (!hasSufficientWMON ? 1 : !isApproved ? 2 : 3)
    : (!isApproved ? 1 : 2)

  const wrapWrite    = useWriteContract()
  const wrapTx       = useWaitForTransactionReceipt({ hash: wrapWrite.data })
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const depositWrite = useWriteContract()
  const depositTx    = useWaitForTransactionReceipt({ hash: depositWrite.data })

  const isSigning = wrapWrite.isPending || approveWrite.isPending || depositWrite.isPending
  const isWaiting = wrapTx.isLoading   || approveTx.isLoading   || depositTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = depositTx.isSuccess
  const txHash    = depositWrite.data ?? approveWrite.data ?? wrapWrite.data
  const error     = wrapWrite.error ?? wrapTx.error ?? approveWrite.error ?? approveTx.error ?? depositWrite.error ?? depositTx.error

  function handleAction() {
    if (!address || parsedAmt === 0n || isPending) return
    const addr = address as `0x${string}`
    if (isNativeMON && currentStep === 1) {
      wrapWrite.writeContract({ address: WMON_ADDR, abi: WMON_DEPOSIT_ABI, functionName: 'deposit', value: parsedAmt })
    } else if (currentStep === (isNativeMON ? 2 : 1)) {
      approveWrite.writeContract({ address: colAsset, abi: ERC20_ABI, functionName: 'approve', args: [colCToken, parsedAmt] })
    } else {
      depositWrite.writeContract({ address: colCToken, abi: ERC4626_ABI, functionName: 'deposit', args: [parsedAmt, addr] })
    }
  }

  const displayToken = isNativeMON ? 'MON' : colSym
  const steps = isNativeMON
    ? ['Wrap MON', 'Approve WMON', 'Deposit WMON']
    : [`Approve ${colSym}`, `Deposit ${colSym}`]

  const btnLabel = isSuccess     ? `✓ Deposited ${amount} ${displayToken}`
    : isSigning                  ? 'Confirm in wallet…'
    : isWaiting                  ? 'Transaction pending…'
    : isNativeMON && currentStep === 1 ? 'Wrap MON → WMON'
    : isNativeMON && currentStep === 2 ? 'Approve WMON'
    : isNativeMON && currentStep === 3 ? 'Deposit WMON'
    : currentStep === 1          ? `Approve ${colSym}`
                                 : `Deposit ${colSym}`

  return (
    <div className="space-y-4">
      <AmountInput label="You deposit (collateral)" token={displayToken} value={amount} onChange={setAmount} max={displayBal} />
      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">Deposit APY</span>
        <span className="text-emerald-400 font-semibold">{pool.apy.toFixed(2)}%</span>
      </div>
      <Steps steps={steps} current={currentStep} />
      {wrapTx.isSuccess && currentStep === 2 && (
        <p className="text-center text-xs text-slate-600">Wrap confirmed · approve WMON next</p>
      )}
      {approveTx.isSuccess && currentStep === (isNativeMON ? 3 : 2) && (
        <p className="text-center text-xs text-slate-600">Approval confirmed · now deposit</p>
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
          {(error as Error).message?.split('\n')[0]?.slice(0, 120)}
        </p>
      )}
    </div>
  )
}

// ── Curvance borrow flow ───────────────────────────────────────────────────────
// Step 1: deposit collateral into colCToken (same as CurvanceLendingFlow)
//   - WMON col: wrap MON → approve WMON → deposit WMON into colCToken
//   - other col: approve colAsset → deposit into colCToken
// Step 2: call loanCToken.borrow(amount) — Compound V2 style, no approve needed
function CurvanceBorrowFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  const [outerStep, setOuterStep] = useState<1 | 2>(1)
  const [colAmt, setColAmt]       = useState('')
  const [borrowAmt, setBorrowAmt] = useState('')

  const info = CURVANCE_BORROW_MARKETS[pool.id]
  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Market config not found for {pool.id}</p>

  const { colCToken, colAsset, colDec, colSym, loanCToken, loanDec, loanSym } = info
  const isWMONcol = colAsset.toLowerCase() === WMON_ADDR.toLowerCase()

  const parsedCol    = colAmt    && Number(colAmt)    > 0 ? parseUnits(colAmt,    colDec)  : 0n
  const parsedBorrow = borrowAmt && Number(borrowAmt) > 0 ? parseUnits(borrowAmt, loanDec) : 0n

  // ── Step 1 hooks — collateral deposit ──
  const { data: nativeBal } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address && isWMONcol },
  })
  const { data: erc20BalRaw } = useReadContract({
    address: colAsset, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  })
  const displayColBal = isWMONcol
    ? (nativeBal ? (Number(nativeBal.value) / 10 ** nativeBal.decimals).toString() : undefined)
    : (erc20BalRaw !== undefined ? (Number(erc20BalRaw) / 10 ** colDec).toString() : undefined)

  const { data: colAllowance } = useReadContract({
    address: colAsset, abi: ERC20_ABI, functionName: 'allowance',
    args: [address as `0x${string}`, colCToken],
    query: { enabled: !!address },
  })
  const hasSufficientWMON = (erc20BalRaw ?? 0n) >= parsedCol
  const isColApproved     = parsedCol > 0n && (colAllowance ?? 0n) >= parsedCol
  const colInnerStep      = isWMONcol
    ? (!hasSufficientWMON ? 1 : !isColApproved ? 2 : 3)
    : (!isColApproved ? 1 : 2)

  const wrapWrite    = useWriteContract()
  const wrapTx       = useWaitForTransactionReceipt({ hash: wrapWrite.data })
  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const depositWrite = useWriteContract()
  const depositTx    = useWaitForTransactionReceipt({ hash: depositWrite.data })

  const colIsSigning = wrapWrite.isPending || approveWrite.isPending || depositWrite.isPending
  const colIsWaiting = wrapTx.isLoading    || approveTx.isLoading   || depositTx.isLoading
  const colIsPending = colIsSigning || colIsWaiting
  const colIsSuccess = depositTx.isSuccess
  const colTxHash    = depositWrite.data ?? approveWrite.data ?? wrapWrite.data
  const colError     = wrapWrite.error ?? wrapTx.error ?? approveWrite.error ?? approveTx.error ?? depositWrite.error ?? depositTx.error

  function handleColAction() {
    if (!address || parsedCol === 0n || colIsPending) return
    const addr = address as `0x${string}`
    if (isWMONcol && colInnerStep === 1) {
      wrapWrite.writeContract({ address: WMON_ADDR, abi: WMON_DEPOSIT_ABI, functionName: 'deposit', value: parsedCol })
    } else if (colInnerStep === (isWMONcol ? 2 : 1)) {
      approveWrite.writeContract({ address: colAsset, abi: ERC20_ABI, functionName: 'approve', args: [colCToken, parsedCol] })
    } else {
      depositWrite.writeContract({ address: colCToken, abi: ERC4626_ABI, functionName: 'deposit', args: [parsedCol, addr] })
    }
  }

  const colInnerSteps = isWMONcol
    ? ['Wrap MON', 'Approve WMON', 'Deposit WMON']
    : [`Approve ${colSym}`, `Deposit ${colSym}`]

  const displayColToken = isWMONcol ? 'MON' : colSym

  const colBtnLabel = colIsSuccess           ? `✓ Deposited ${colAmt} ${displayColToken}`
    : colIsSigning                           ? 'Confirm in wallet…'
    : colIsWaiting                           ? 'Transaction pending…'
    : isWMONcol && colInnerStep === 1        ? 'Wrap MON → WMON'
    : isWMONcol && colInnerStep === 2        ? 'Approve WMON'
    : isWMONcol && colInnerStep === 3        ? 'Deposit WMON'
    : colInnerStep === 1                     ? `Approve ${colSym}`
                                             : `Deposit ${colSym}`

  // ── Step 2 hooks — borrow ──
  const borrowWrite = useWriteContract()
  const borrowTx    = useWaitForTransactionReceipt({ hash: borrowWrite.data })
  const borIsSigning = borrowWrite.isPending
  const borIsWaiting = borrowTx.isLoading
  const borIsPending = borIsSigning || borIsWaiting
  const borIsSuccess = borrowTx.isSuccess
  const borTxHash    = borrowWrite.data
  const borError     = borrowWrite.error ?? borrowTx.error

  function handleBorrow() {
    if (!address || parsedBorrow === 0n || borIsPending) return
    borrowWrite.writeContract({ address: loanCToken, abi: CURVANCE_BORROW_ABI, functionName: 'borrow', args: [parsedBorrow] })
  }

  const outerSteps = [`Deposit ${displayColToken}`, `Borrow ${loanSym}`]

  return (
    <div className="space-y-4">
      <Steps steps={outerSteps} current={outerStep} />

      {outerStep === 1 ? (
        <>
          <AmountInput label="Collateral to deposit" token={displayColToken} value={colAmt} onChange={setColAmt} max={displayColBal} />
          <div className="flex justify-between text-xs px-0.5">
            <span className="text-slate-500">Borrow APR</span>
            <span className="text-rose-400 font-semibold">{pool.apy.toFixed(2)}%</span>
          </div>
          <Steps steps={colInnerSteps} current={colInnerStep} />
          {wrapTx.isSuccess && colInnerStep === 2 && (
            <p className="text-center text-xs text-slate-600">Wrap confirmed · approve WMON next</p>
          )}
          {approveTx.isSuccess && colInnerStep === (isWMONcol ? 3 : 2) && (
            <p className="text-center text-xs text-slate-600">Approval confirmed · now deposit</p>
          )}
          <Btn label={colBtnLabel} onClick={handleColAction} disabled={!address || parsedCol === 0n || colIsPending || colIsSuccess} />
          {colIsSuccess && (
            <Btn label={`Next → Borrow ${loanSym}`} onClick={() => setOuterStep(2)} disabled={false} />
          )}
          {colTxHash && (
            <a href={`https://monadexplorer.com/tx/${colTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {colTxHash.slice(0, 20)}…{colTxHash.slice(-8)} ↗
            </a>
          )}
          {colError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(colError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Collateral deposited</span>
            <span className="text-sm font-semibold text-white">{colAmt} {displayColToken}</span>
          </div>
          <AmountInput label="Amount to borrow" token={loanSym} value={borrowAmt} onChange={setBorrowAmt} />
          <div className="flex justify-between text-xs px-0.5">
            <span className="text-slate-500">Borrow APR</span>
            <span className="text-rose-400 font-semibold">{pool.apy.toFixed(2)}%</span>
          </div>
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
            Curvance requires a minimum borrow of ~$10. Amounts below this will revert.
          </p>
          <p className="text-xs text-slate-500 px-0.5 leading-relaxed">
            Borrow limit depends on your collateral LTV. Check Curvance app for your exact capacity.
          </p>
          <Btn
            label={borIsSuccess ? `✓ Borrowed ${borrowAmt} ${loanSym}` : borIsSigning ? 'Confirm in wallet…' : borIsWaiting ? 'Transaction pending…' : `Borrow ${loanSym}`}
            onClick={handleBorrow}
            disabled={!address || parsedBorrow === 0n || borIsPending || borIsSuccess}
          />
          {borTxHash && (
            <a href={`https://monadexplorer.com/tx/${borTxHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate">
              {borTxHash.slice(0, 20)}…{borTxHash.slice(-8)} ↗
            </a>
          )}
          {borError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 break-words">
              {(borError as Error).message?.split('\n')[0]?.slice(0, 120)}
            </p>
          )}
          <button type="button" onClick={() => setOuterStep(1)}
            className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1">
            ← Back to deposit collateral
          </button>
        </>
      )}
    </div>
  )
}

// ── Kuru Vault LP flow (MON + USDC/AUSD → KURU-VAULT shares) ─────────────────
// deposit(baseAmount, quoteAmount) payable — native MON via msg.value, quote via transferFrom
// Inputs are ratio-linked: changing one auto-fills the other based on vault's current composition.
// Steps: 1. Approve quote (USDC/AUSD), 2. Deposit (send MON + quote together)
function KuruVaultFlow({ pool, address }: { pool: LPPool; address?: string }) {
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

  // Vault deposit ratio — read from MarginAccount (totalAssets reverts on managed vault)
  // Native MON = address(0), WMON = TOKENS.WMON; sum both to get total base
  const NATIVE_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`
  const { data: vaultMonBal   } = useReadContract({ address: KURU_MARGIN_ACCOUNT.address, abi: KURU_MARGIN_ACCOUNT.abi, functionName: 'getBalance', args: [vaultAddr, NATIVE_ADDR], query: { enabled: !!info } })
  const { data: vaultWmonBal  } = useReadContract({ address: KURU_MARGIN_ACCOUNT.address, abi: KURU_MARGIN_ACCOUNT.abi, functionName: 'getBalance', args: [vaultAddr, TOKENS.WMON],   query: { enabled: !!info } })
  const { data: vaultQuoteBal } = useReadContract({ address: KURU_MARGIN_ACCOUNT.address, abi: KURU_MARGIN_ACCOUNT.abi, functionName: 'getBalance', args: [vaultAddr, quoteToken],    query: { enabled: !!info } })

  // vaultBase (bigint, wei) and vaultQuote (bigint, quote units)
  const vaultBase  = (vaultMonBal  ?? 0n) + (vaultWmonBal ?? 0n)
  const vaultQuote = vaultQuoteBal ?? 0n

  // bigint ceiling: computeQuote(monWei) = ceil(monWei * vaultQuote / vaultBase)
  const computeQuote = (monWei: bigint): bigint =>
    vaultBase > 0n ? (monWei * vaultQuote + vaultBase - 1n) / vaultBase : 0n
  // bigint ceiling: computeBase(quoteUnits) = ceil(quoteUnits * vaultBase / vaultQuote)
  const computeBase = (quoteUnits: bigint): bigint =>
    vaultQuote > 0n ? (quoteUnits * vaultBase + vaultQuote - 1n) / vaultQuote : 0n

  const ratioReady = vaultBase > 0n && vaultQuote > 0n

  // Linked inputs — changing one auto-fills the other; track which was last edited
  function handleMonChange(v: string) {
    setLastEdited('mon')
    setMonAmt(v)
    if (ratioReady && v && Number(v) > 0) {
      const monWei = parseEther(v)
      const q = computeQuote(monWei)
      // Format to full quoteDec precision so parseUnits can reconstruct exact bigint
      const qFloat = Number(q) / 10 ** quoteDec
      setQuoteAmt(qFloat.toFixed(quoteDec))
    } else if (!v) {
      setQuoteAmt('')
    }
  }
  function handleQuoteChange(v: string) {
    setLastEdited('quote')
    setQuoteAmt(v)
    if (ratioReady && v && Number(v) > 0) {
      const quoteUnits = parseUnits(v, quoteDec)
      const b = computeBase(quoteUnits)
      const bFloat = Number(b) / 1e18
      setMonAmt(bFloat.toFixed(18))
    } else if (!v) {
      setMonAmt('')
    }
  }

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

  const isApproved  = parsedQuote > 0n && (allowance ?? 0n) >= parsedQuote
  const currentStep = isApproved ? 2 : 1

  const approveWrite = useWriteContract()
  const approveTx    = useWaitForTransactionReceipt({ hash: approveWrite.data })
  const depositWrite = useWriteContract()
  const depositTx    = useWaitForTransactionReceipt({ hash: depositWrite.data })

  const isSigning = approveWrite.isPending || depositWrite.isPending
  const isWaiting = approveTx.isLoading    || depositTx.isLoading
  const isPending = isSigning || isWaiting
  const isSuccess = depositTx.isSuccess
  const txHash    = depositWrite.data ?? approveWrite.data
  const error     = approveWrite.error ?? approveTx.error ?? depositWrite.error ?? depositTx.error

  function handleAction() {
    if (!address || isPending || monInsufficient || quoteInsufficient) return
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
  const btnDisabled = !address || isPending || isSuccess ||
    (currentStep === 1 ? parsedQuote === 0n || quoteInsufficient : !canDeposit)

  const btnLabel = isSuccess      ? '✓ Deposited'
    : isSigning                   ? 'Confirm in wallet…'
    : isWaiting                   ? 'Transaction pending…'
    : currentStep === 1           ? `Approve ${quoteSym}`
                                  : `Deposit MON + ${quoteSym}`

  // Summary values — quoteSym ≈ $1, so quoteAmt ≈ USD value
  // MON value estimated from vault ratio: monAmt * (vaultQuote/vaultBase in human units)
  const monValueEst  = ratioReady && Number(monAmt) > 0
    ? Number(monAmt) * (Number(vaultQuote) / 10 ** quoteDec) / (Number(vaultBase) / 1e18)
    : 0
  const quoteValue = Number(quoteAmt) > 0 ? Number(quoteAmt) : 0
  const totalValue = monValueEst + quoteValue

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Vault config not found for {pool.id}</p>

  return (
    <div className="space-y-4">
      {/* Lock-up notice */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-2.5 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 4a8 8 0 100 16 8 8 0 000-16z" />
        </svg>
        <span className="text-xs text-slate-500">Deposit lock-up period is 4 days</span>
      </div>

      <AmountInput label="You pay" token="MON"    value={monAmt}   onChange={handleMonChange}   max={monBalStr} />
      <AmountInput label="You pay" token={quoteSym} value={quoteAmt} onChange={handleQuoteChange} max={quoteBalStr} />

      {/* Insufficient balance warning */}
      {insufficientToken && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-rose-400">Insufficient balance</p>
            <p className="text-xs text-rose-400/70 mt-0.5">
              You do not have enough {insufficientToken} balance to deposit
            </p>
          </div>
        </div>
      )}

      <Steps steps={[`Approve ${quoteSym}`, 'Deposit']} current={currentStep} />

      {approveTx.isSuccess && currentStep === 2 && (
        <p className="text-center text-xs text-slate-600">Approval confirmed · now deposit</p>
      )}

      <Btn label={btnLabel} onClick={handleAction} disabled={btnDisabled} />

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

      {/* Summary */}
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
            <span className="text-white font-semibold">
              {totalValue > 0 ? `$${totalValue.toFixed(2)}` : '$0'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Fee APR</span>
            <span className="text-emerald-400 font-semibold">{pool.fee_apr.toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Clober LP flow (MON → Clober V2 LP via SDK zap-in, 1 tx) ─────────────────
// Uses @clober/v2-sdk addLiquidity + Clober Quote API.
// Pool currencyA=USDC, currencyB=MON → pass token0=USDC, token1=MON so that
// value = amountBOrigin (MON wei) is correctly set in the built transaction.
function CloberFlow({ pool, address }: { pool: LPPool; address?: string }) {
  const [monAmt, setMonAmt] = useState('')
  const [slippage, setSlippage] = useState<0.5 | 1 | 50 | 'custom'>(1)
  const [customSlippage, setCustomSlippage] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { data: nativeBal } = useBalance({ address: address as `0x${string}` | undefined })
  const monBalWei = nativeBal?.value ?? 0n
  const monBalStr = nativeBal ? (Number(monBalWei) / 1e18).toString() : undefined

  const parsedMon = monAmt && Number(monAmt) > 0 ? parseEther(monAmt) : 0n
  const monInsufficient = parsedMon > 0n && !!address && nativeBal
    ? parsedMon > monBalWei : false

  const effectiveSlippage = slippage === 'custom' ? (Number(customSlippage) || 1) : slippage

  const { sendTransactionAsync } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const info = CLOBER_POOLS[pool.id]

  async function handleDeposit() {
    if (!address || parsedMon === 0n || isBuilding || isConfirming || monInsufficient) return
    setIsBuilding(true)
    setSdkError(null)
    try {
      const cloberQuote = async (
        inputCurrency: { address: string },
        amountIn: bigint,
        outputCurrency: { address: string },
        slippageParam: number,
        _gasPrice: bigint,
        userAddress: string,
        timeout = 4000,
      ) => {
        const url = `https://app.clober.io/api/chains/143/quote` +
          `?inputTokenAddress=${inputCurrency.address}` +
          `&outputTokenAddress=${outputCurrency.address}` +
          `&amountIn=${amountIn.toString()}` +
          `&slippageLimitPercent=${slippageParam}` +
          `&userAddress=${userAddress}`
        const res = await Promise.race([
          fetch(url),
          new Promise<Response>((_, rej) =>
            setTimeout(() => rej(new Error('Quote timeout')), timeout)
          ),
        ]) as Response
        const data = await res.json()
        const best = data.bestQuote
        if (!best?.transaction) {
          return { amountOut: 0n, transaction: undefined, aggregator: { name: 'Clober' } }
        }
        return {
          amountOut: BigInt(best.amountOut),
          transaction: best.transaction,
          aggregator: { name: best.aggregator ?? 'Clober' },
        }
      }

      // token0=USDC (pool.currencyA), token1=MON/zeroAddress (pool.currencyB)
      // This ensures SDK sets value = amountBOrigin = parseUnits(amount1, 18) = MON wei
      const result = await addLiquidity({
        chainId: CHAIN_IDS.MONAD_MAINNET,
        userAddress: address as `0x${string}`,
        token0: TOKENS.USDC,
        token1: '0x0000000000000000000000000000000000000000',
        salt: '0x' + '0'.repeat(64) as `0x${string}`,
        amount0: '0',
        amount1: monAmt,
        quotes: [cloberQuote],
        options: { rpcUrl: 'https://rpc.monad.xyz', slippage: effectiveSlippage },
      })

      if (!result.transaction) {
        throw new Error('Could not build transaction — try a larger amount')
      }

      const hash = await sendTransactionAsync({
        to:    result.transaction.to as `0x${string}`,
        data:  result.transaction.data as `0x${string}`,
        value: result.transaction.value,
        gas:   result.transaction.gas
          ? (result.transaction.gas as bigint) * 12n / 10n
          : undefined,
      })
      setTxHash(hash)
    } catch (e: unknown) {
      setSdkError(
        (e as Error).message?.split('\n')[0]?.slice(0, 150) ?? 'Unknown error'
      )
    } finally {
      setIsBuilding(false)
    }
  }

  if (!info) return <p className="text-xs text-slate-500 text-center py-4">Pool config not found for {pool.id}</p>

  const btnLabel = isSuccess || (isConfirming && txHash)
    ? '✓ Liquidity Added'
    : isBuilding   ? 'Building transaction…'
    : isConfirming ? 'Transaction pending…'
    : 'Add Liquidity'

  const SLIPPAGE_OPTIONS: { value: 0.5 | 1 | 50; label: string }[] = [
    { value: 0.5, label: '0.50%' },
    { value: 1,   label: '1%'    },
    { value: 50,  label: '∞'     },
  ]

  return (
    <div className="space-y-4">
      <AmountInput
        label="You deposit"
        token="MON"
        value={monAmt}
        onChange={setMonAmt}
        max={monBalStr}
      />

      {/* Zap-in info */}
      <div className="bg-[#0a1220] border border-[#1a2535] rounded-xl px-4 py-3">
        <p className="text-xs text-slate-500 mb-1">Zap-in · 1 transaction</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Enter any MON amount. Clober&apos;s router automatically swaps to the right MON/USDC ratio and adds liquidity atomically.
        </p>
      </div>

      {/* Max Slippage */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-xs text-slate-500 shrink-0">Max Slippage</span>
        <div className="flex items-center gap-0.5 bg-[#0a1220] border border-[#1a2535] rounded-xl p-1">
          {SLIPPAGE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSlippage(value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                slippage === value
                  ? 'bg-[#CC3BFF]/20 text-[#CC3BFF]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setSlippage('custom')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              slippage === 'custom'
                ? 'bg-[#CC3BFF]/20 text-[#CC3BFF]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {slippage === 'custom'
              ? <input
                  type="number"
                  value={customSlippage}
                  onChange={e => setCustomSlippage(e.target.value)}
                  placeholder="—"
                  className="bg-transparent w-10 outline-none text-center text-[#CC3BFF]"
                  onClick={e => e.stopPropagation()}
                />
              : 'Custom %'
            }
          </button>
        </div>
      </div>

      {/* Slippage warning */}
      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-xs text-amber-400/80 leading-relaxed">
          The auto-swap may have slippage. For large amounts, consider depositing in smaller batches to reduce price impact.
        </p>
      </div>

      {monInsufficient && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-rose-400">Insufficient balance</p>
            <p className="text-xs text-rose-400/70 mt-0.5">You do not have enough MON</p>
          </div>
        </div>
      )}

      <div className="flex justify-between text-xs px-0.5">
        <span className="text-slate-500">Fee APR</span>
        <span className="text-emerald-400 font-semibold">{pool.fee_apr.toFixed(2)}%</span>
      </div>

      <Btn
        label={btnLabel}
        onClick={handleDeposit}
        disabled={!address || parsedMon === 0n || isBuilding || isConfirming || isSuccess || monInsufficient}
      />

      {txHash && (
        <a
          href={`https://monadexplorer.com/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#CC3BFF] hover:text-[#BFA2FF] transition-colors truncate"
        >
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

function priceToTick(humanPrice: number, dec0: number, dec1: number): number {
  // rawPrice = token1_raw / token0_raw = humanPrice / 10^(dec0-dec1)
  const rawPrice = humanPrice / 10 ** (dec0 - dec1)
  return Math.log(rawPrice) / LOG_1_0001
}

function snapTick(tick: number, spacing: number, dir: 'floor' | 'ceil'): number {
  return dir === 'floor'
    ? Math.floor(tick / spacing) * spacing
    : Math.ceil(tick  / spacing) * spacing
}

// V3 liquidity math: given amount0 (token0 raw) compute amount1 (token1 raw)
// sqrtPriceX96: Q64.96 = sqrt(token1_raw / token0_raw) * 2^96
function v3Amount1FromAmount0(
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

function v3Amount0FromAmount1(
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
function capitalMultiplier(tickLower: number, tickUpper: number, currentTick: number): number {
  if (tickLower <= MIN_TICK_60 && tickUpper >= MAX_TICK_60) return 1
  const sqrtPa = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPb = Math.sqrt(Math.pow(1.0001, tickUpper))
  const sqrtPc = Math.sqrt(Math.pow(1.0001, currentTick))
  if (sqrtPc <= sqrtPa || sqrtPc >= sqrtPb) return 1
  const ce0 = sqrtPb / (sqrtPb - sqrtPc)          // token0 side
  const ce1 = sqrtPc / (sqrtPc - sqrtPa)          // token1 side
  return Math.min(Math.sqrt(ce0 * ce1), 50)        // geometric mean, cap at 50x
}

const V3_RANGE_PRESETS = {
  full:     { label: 'Full Range',  desc: '0 → ∞',          lowerPct: 1.00, upperPct: 10.00 },
  wide:     { label: 'Wide',        desc: '-50% to +100%',   lowerPct: 0.50, upperPct: 1.00  },
  moderate: { label: 'Moderate',    desc: '-25% to +50%',    lowerPct: 0.25, upperPct: 0.50  },
  narrow:   { label: 'Narrow',      desc: '-15% to +20%',    lowerPct: 0.15, upperPct: 0.20  },
} as const
type V3Preset = keyof typeof V3_RANGE_PRESETS

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
function computeV4Liquidity(
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
function encodeV4UnlockData(
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
  const pmAddr  = UNISWAP_V4_POSITION_MANAGER.address
  const p2Addr  = PERMIT2.address
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
function UniswapV2Flow({ pool, address }: { pool: LPPool; address?: string }) {
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
function LendingFlow({ pool, address }: { pool: LendingPool; address?: string }) {
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
function BorrowFlow({ pool, address }: { pool: BorrowingPool; address?: string }) {
  if (pool.protocol === 'Curvance') {
    return <CurvanceBorrowFlow pool={pool} address={address} />
  }
  return <NeverlandBorrowFlow pool={pool} address={address} />
}

// ── Main export ───────────────────────────────────────────────────────────────
export function DepositModal({ pool, onClose }: { pool: Pool; onClose: () => void }) {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

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
                onClick={() => connect({ connector: injected() })}
                className="shrink-0 px-4 py-1.5 text-xs font-semibold bg-[#CC3BFF] hover:opacity-90 text-white rounded-lg transition-colors"
              >
                Connect
              </button>
            </div>
          )}

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
