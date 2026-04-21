'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-4 py-1.5 text-sm font-medium border border-[var(--border-hover)] text-slate-300 rounded-lg hover:border-[#CC3BFF]/50 hover:text-[#BFA2FF] transition-all"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="px-4 py-1.5 text-sm font-semibold bg-[#CC3BFF] text-white rounded-lg hover:opacity-90 transition-all"
    >
      Connect Wallet
    </button>
  )
}
