'use client'

import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { monad } from './chains'

export const wagmiConfig = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: {
    [monad.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz'),
  },
})
