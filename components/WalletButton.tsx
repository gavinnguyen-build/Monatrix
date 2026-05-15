'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAccount, useConnect, useDisconnect, useConnectors } from 'wagmi'

// ─── Popular wallets (shown when not installed) ────────────────────────────────
const POPULAR = [
  { name: 'MetaMask',       icon: '/logos/wallets/metamask.svg', url: 'https://metamask.io'             },
  { name: 'Rabby Wallet',   icon: '/logos/wallets/rabby.jpg',    url: 'https://rabby.io'                },
  { name: 'Coinbase Wallet',icon: '/logos/wallets/coinbase.png', url: 'https://www.coinbase.com/wallet' },
  { name: 'Trust Wallet',   icon: '/logos/wallets/trust.jpg',    url: 'https://trustwallet.com'         },
  { name: 'Rainbow',        icon: '/logos/wallets/rainbow.png',  url: 'https://rainbow.me'              },
  { name: 'Phantom',        icon: '/logos/wallets/phantom.jpg',  url: 'https://phantom.app'             },
]

// ─── Wallet icon ───────────────────────────────────────────────────────────────
function WalletIcon({
  icon, name, size = 44,
}: {
  icon?: string | null
  name: string
  size?: number
}) {
  if (icon) {
    return (
      <img
        src={icon}
        alt={name}
        width={size}
        height={size}
        className="rounded-xl object-cover shrink-0"
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold text-lg shrink-0"
    >
      {name[0]}
    </div>
  )
}

// ─── Connect Modal ─────────────────────────────────────────────────────────────
export function ConnectModal({ onClose }: { onClose: () => void }) {
  const connectors   = useConnectors()
  const { connect, isPending } = useConnect()

  // Filter popular wallets that are NOT already detected
  const popular = POPULAR.filter(w =>
    !connectors.some(c =>
      c.name.toLowerCase().includes(w.name.split(' ')[0].toLowerCase())
    )
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#1c1c1c] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center px-5 py-4">
          <h2 className="text-base font-bold text-white">Connect a Wallet</h2>
          <button
            onClick={onClose}
            className="absolute right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Wallet list */}
        <div className="overflow-y-auto flex-1 px-3 pb-2">

          {/* Installed */}
          {connectors.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-[#CC3BFF] px-2 mb-1">Installed</p>
              {connectors.map(connector => (
                <button
                  key={connector.uid}
                  onClick={() => { connect({ connector }); onClose() }}
                  disabled={isPending}
                  className="w-full flex items-center gap-3.5 px-2 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors text-left disabled:opacity-50"
                >
                  <WalletIcon icon={connector.icon} name={connector.name} />
                  <span className="text-[15px] font-semibold text-white">{connector.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular — only show if there are wallets not yet installed */}
          {popular.length > 0 && <div>
            <p className="text-xs font-semibold text-slate-500 px-2 mb-1">Popular</p>
            {popular.map(w => (
              <a
                key={w.name}
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3.5 px-2 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors"
              >
                <WalletIcon icon={w.icon} name={w.name} />
                <span className="text-[15px] font-semibold text-white">{w.name}</span>
              </a>
            ))}
          </div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.07]">
          <p className="text-xs text-slate-500">New to Ethereum wallets?</p>
          <a
            href="https://ethereum.org/en/wallets/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-[#CC3BFF] hover:underline"
          >
            Learn More
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Wallet Button ─────────────────────────────────────────────────────────────
export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Before hydration, always render "Connect Wallet" to match server-rendered HTML.
  // Wallet state (address/isConnected) is only available on the client.
  if (!mounted) {
    return (
      <button className="px-4 py-1.5 text-sm font-semibold bg-[#CC3BFF] text-white rounded-lg hover:opacity-90 transition-all">
        Connect Wallet
      </button>
    )
  }

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
