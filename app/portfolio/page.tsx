'use client'

import { useAccount } from 'wagmi'
import { WalletButton } from '@/components/WalletButton'

export default function PortfolioPage() {
  const { address, isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white mb-3">Your Portfolio</h1>
        <p className="text-gray-400 mb-6">Connect your wallet to view your positions and PnL</p>
        <WalletButton />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Your Portfolio</h1>
      <p className="text-gray-500 text-sm mb-6">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </p>

      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
        <p className="text-lg mb-2">Portfolio tracking coming in v2</p>
        <p className="text-sm">
          On-chain position detection requires real contract addresses from each protocol.
        </p>
      </div>
    </div>
  )
}
