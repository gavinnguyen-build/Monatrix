'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useConnectors } from 'wagmi'

// ─── Wallet Select Modal ──────────────────────────────────────────────────────
export function ConnectModal({ onClose }: { onClose: () => void }) {
  const connectors = useConnectors()
  const { connect, isPending } = useConnect()

  const popularWallets = [
    { name: 'MetaMask',      url: 'https://metamask.io',   icon: '/logos/wallets/metamask.svg'  },
    { name: 'Rabby',         url: 'https://rabby.io',      icon: '/logos/wallets/rabby.svg'     },
    { name: 'Coinbase Wallet', url: 'https://www.coinbase.com/wallet', icon: '/logos/wallets/coinbase.svg' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-[#0F0F14] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 pb-8 sm:pb-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Detected wallets */}
        {connectors.length > 0 ? (
          <div className="space-y-2">
            {connectors.map(connector => (
              <button
                key={connector.uid}
                onClick={() => { connect({ connector }); onClose() }}
                disabled={isPending}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15 transition-all text-left disabled:opacity-50"
              >
                {connector.icon ? (
                  <img src={connector.icon} alt={connector.name} className="w-8 h-8 rounded-lg shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                    {connector.name[0]}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-white">{connector.name}</p>
                  <p className="text-[11px] text-slate-500">Detected</p>
                </div>
                <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          /* No wallet detected */
          <div className="text-center py-4">
            <p className="text-slate-400 text-sm mb-1">Không tìm thấy wallet</p>
            <p className="text-slate-600 text-xs mb-5">Cài một trong các ví dưới đây rồi thử lại</p>
            <div className="space-y-2">
              {popularWallets.map(w => (
                <a
                  key={w.name}
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.06] transition-all"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                    {w.name[0]}
                  </div>
                  <span className="text-sm font-medium text-white">{w.name}</span>
                  <span className="ml-auto text-[11px] text-slate-500">Install →</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-600 text-center mt-4">
          By connecting, you agree to Monatrix Terms of Use
        </p>
      </div>
    </div>
  )
}

// ─── Wallet Button ────────────────────────────────────────────────────────────
export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)

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
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 text-sm font-semibold bg-[#CC3BFF] text-white rounded-lg hover:opacity-90 transition-all"
      >
        Connect Wallet
      </button>

      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </>
  )
}
