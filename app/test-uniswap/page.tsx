'use client'

import { useState, useEffect } from 'react'
import { createPublicClient, http, defineChain } from 'viem'

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})

const publicClient = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') })

// ─── V2 ──────────────────────────────────────────────────────────────────────
// Pool: DUST/USDC — 0x86dbf00485871c901c5129bd525348db96c2eb2d
// token0 = DUST (18 dec), token1 = USDC (6 dec)
//
// Flow (3 txs):
//   1. approve DUST  → UniswapV2Router02
//   2. approve USDC  → UniswapV2Router02
//   3. addLiquidity(DUST, USDC, amtDust, amtUsdc, minDust, minUsdc, to, deadline)
//
// Ratio is fixed by pool reserves — user provides one token, UI calculates the other.
// getReserves() → reserve0 (DUST), reserve1 (USDC) — ratio = reserve1/reserve0

const V2_POOL = '0x86dbf00485871c901c5129bd525348db96c2eb2d' as `0x${string}`
const DUST    = '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c' as `0x${string}`
const USDC_V2 = '0x754704bc059f8c67012fed69bc8a327a5aafb603' as `0x${string}`

// TODO: verify UniswapV2Router02 address on Monad before using
const V2_ROUTER_PLACEHOLDER = '0x???' // standard: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D

const GET_RESERVES_ABI = [{
  name: 'getReserves',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [
    { name: 'reserve0', type: 'uint112' },
    { name: 'reserve1', type: 'uint112' },
    { name: 'blockTimestampLast', type: 'uint32' },
  ],
}] as const

function V2Example() {
  const [dustAmt, setDustAmt] = useState('')
  const [usdcAmt, setUsdcAmt] = useState('')
  const [ratio, setRatio] = useState<number | null>(null)
  const [loadingRatio, setLoadingRatio] = useState(true)

  useEffect(() => {
    async function fetchReserves() {
      try {
        const result = await publicClient.readContract({
          address: V2_POOL,
          abi: GET_RESERVES_ABI,
          functionName: 'getReserves',
        })
        // reserve0 = DUST (18 dec), reserve1 = USDC (6 dec)
        const r0 = Number(result[0]) / 1e18 // DUST
        const r1 = Number(result[1]) / 1e6  // USDC
        setRatio(r1 / r0) // USDC per DUST
      } catch (e) {
        console.error('[V2] getReserves failed:', e)
      } finally {
        setLoadingRatio(false)
      }
    }
    fetchReserves()
  }, [])

  function onDustChange(val: string) {
    setDustAmt(val)
    if (ratio && val && !isNaN(Number(val))) {
      setUsdcAmt((Number(val) * ratio).toFixed(6))
    } else {
      setUsdcAmt('')
    }
  }

  function onUsdcChange(val: string) {
    setUsdcAmt(val)
    if (ratio && val && !isNaN(Number(val))) {
      setDustAmt((Number(val) / ratio).toFixed(4))
    } else {
      setDustAmt('')
    }
  }

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded font-mono">V2</span>
        <h2 className="text-white font-semibold">DUST / USDC</h2>
        <span className="ml-auto text-xs text-gray-500">0.3% fee</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        x·y = k — full range, equal value on both sides
      </p>

      {/* Current ratio (live from chain) */}
      <div className="bg-white/5 rounded-lg p-3 mb-3">
        <div className="text-xs text-gray-400 mb-1">Current Ratio (from getReserves)</div>
        {loadingRatio ? (
          <div className="text-gray-500 text-sm animate-pulse">Fetching...</div>
        ) : ratio != null ? (
          <div className="text-white text-sm font-mono">
            1 DUST = {ratio.toFixed(6)} USDC
          </div>
        ) : (
          <div className="text-red-400 text-xs">Failed to fetch</div>
        )}
      </div>

      {/* Inputs — auto-linked by ratio */}
      <div className="space-y-2 mb-3">
        <div className="bg-white/5 rounded-lg p-3 flex items-center gap-2">
          <input value={dustAmt} onChange={e => onDustChange(e.target.value)}
            placeholder="0.0" className="flex-1 bg-transparent text-white outline-none text-sm" />
          <span className="text-gray-400 text-sm">DUST</span>
        </div>
        <div className="text-center text-gray-500 text-xs">⇅ auto-computed from ratio</div>
        <div className="bg-white/5 rounded-lg p-3 flex items-center gap-2">
          <input value={usdcAmt} onChange={e => onUsdcChange(e.target.value)}
            placeholder="0.0" className="flex-1 bg-transparent text-white outline-none text-sm" />
          <span className="text-gray-400 text-sm">USDC</span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-1.5 mb-3 text-xs">
        {[
          'approve DUST → V2Router (tx 1)',
          'approve USDC → V2Router (tx 2)',
          'addLiquidity(DUST, USDC, amtA, amtB, minA, minB, addr, deadline) (tx 3)',
        ].map((s, i) => (
          <div key={i} className="flex gap-2 text-gray-300">
            <span className="w-4 h-4 rounded-full bg-blue-500/30 text-blue-300 flex items-center justify-center flex-shrink-0 text-[10px] mt-0.5">{i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-300/80 mb-3">
        ⚠️ V2Router address not yet verified on Monad
      </div>

      <button disabled className="w-full bg-blue-600/50 text-gray-300 rounded-lg py-2 text-sm font-medium cursor-not-allowed mt-auto">
        Add Liquidity — 3 txs
      </button>

      <div className="mt-3 text-xs text-gray-500">
        Complexity: <span className="text-green-400">Low</span> — no price range needed
      </div>
    </div>
  )
}

// ─── V3 ──────────────────────────────────────────────────────────────────────
// Pool: WMON/USDC — 0x659bd0bc4167ba25c62e05656f78043e7ed4a9da, fee 0.3%
// token0 = WMON (addr 0x3bd3... < 0x7547...), token1 = USDC
//
// Flow (2 txs):
//   1. approve USDC → NonfungiblePositionManager (WMON side: send as msg.value)
//   2. NPM.mint({ token0:WMON, token1:USDC, fee:3000, tickLower, tickUpper,
//                 amount0Desired, amount1Desired, amount0Min, amount1Min,
//                 recipient, deadline }) payable
//
// Key UX element: user must choose a price range (tickLower, tickUpper)
// Current tick comes from pool.slot0() — read-only, no wallet needed

const V3_POOL = '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da' as `0x${string}`
const TICK_SPACING = 60 // 0.3% fee tier

// TODO: verify NonfungiblePositionManager address on Monad before using
const V3_NPM_PLACEHOLDER = '0x???' // standard: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88

const SLOT0_ABI = [{
  name: 'slot0',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [
    { name: 'sqrtPriceX96',               type: 'uint160' },
    { name: 'tick',                        type: 'int24'   },
    { name: 'observationIndex',            type: 'uint16'  },
    { name: 'observationCardinality',      type: 'uint16'  },
    { name: 'observationCardinalityNext',  type: 'uint16'  },
    { name: 'feeProtocol',                 type: 'uint8'   },
    { name: 'unlocked',                    type: 'bool'    },
  ],
}] as const

function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  // token0=WMON(18dec), token1=USDC(6dec)
  // price (USDC per MON) = (sqrtPriceX96 / 2^96)^2 × 10^(18-6)
  const float = Number(sqrtPriceX96) / 2 ** 96
  return float * float * 1e12
}

function tickToPrice(tick: number): number {
  // 1.0001^tick gives raw price (USDC wei per WMON wei)
  // × 10^(18-6) to get human price in USDC per MON
  return Math.pow(1.0001, tick) * 1e12
}

function nearestTick(tick: number, spacing: number): number {
  return Math.round(tick / spacing) * spacing
}

function V3Example() {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [currentTick, setCurrentTick] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [monAmt, setMonAmt] = useState('')
  const [tickLower, setTickLower] = useState(-887220)
  const [tickUpper, setTickUpper] = useState(887220)
  const [activePreset, setActivePreset] = useState('Full')

  useEffect(() => {
    async function fetchSlot0() {
      try {
        const result = await publicClient.readContract({
          address: V3_POOL,
          abi: SLOT0_ABI,
          functionName: 'slot0',
        })
        const price = sqrtPriceX96ToPrice(result[0])
        const tick = result[1]
        setCurrentPrice(price)
        setCurrentTick(tick)
        // Default: ±20% around current price (~2000 ticks)
        setTickLower(nearestTick(tick - 2000, TICK_SPACING))
        setTickUpper(nearestTick(tick + 2000, TICK_SPACING))
        setActivePreset('±20%')
      } catch (e) {
        console.error('[V3] slot0 fetch failed:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchSlot0()
  }, [])

  const presets = [
    { label: 'Full',  dl: -887272, du: 887272 },
    { label: '±50%', dl: -4200,   du: 4200 },
    { label: '±20%', dl: -2000,   du: 2000 },
    { label: '±5%',  dl: -500,    du: 500 },
  ]

  function applyPreset(label: string, dl: number, du: number) {
    const base = currentTick ?? 0
    if (label === 'Full') {
      setTickLower(-887220)
      setTickUpper(887220)
    } else {
      setTickLower(nearestTick(base + dl, TICK_SPACING))
      setTickUpper(nearestTick(base + du, TICK_SPACING))
    }
    setActivePreset(label)
  }

  const priceLower = tickToPrice(tickLower)
  const priceUpper = tickToPrice(tickUpper)
  const isFullRange = tickLower <= -887220 && tickUpper >= 887220
  const inRange = currentTick != null && currentTick >= tickLower && currentTick <= tickUpper

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded font-mono">V3</span>
        <h2 className="text-white font-semibold">MON / USDC</h2>
        <span className="ml-auto text-xs text-gray-500">0.3% fee</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Concentrated liquidity — choose price range to maximise capital efficiency
      </p>

      {/* Live price from slot0 */}
      <div className="bg-white/5 rounded-lg p-3 mb-3">
        <div className="text-xs text-gray-400 mb-1">Current Price (slot0 — live from chain)</div>
        {loading ? (
          <div className="text-gray-500 text-sm animate-pulse">Fetching slot0...</div>
        ) : currentPrice != null ? (
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-mono">{currentPrice.toFixed(4)} USDC / MON</span>
            <span className={`text-xs px-2 py-0.5 rounded ${inRange ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {inRange ? 'In range' : 'Out of range'}
            </span>
          </div>
        ) : (
          <div className="text-red-400 text-xs">Failed to fetch</div>
        )}
        {currentTick != null && (
          <div className="text-xs text-gray-500 mt-0.5">tick: {currentTick}</div>
        )}
      </div>

      {/* Range presets */}
      <div className="text-xs text-gray-400 mb-1.5">Price Range</div>
      <div className="flex gap-1 mb-2">
        {presets.map(p => (
          <button key={p.label}
            onClick={() => applyPreset(p.label, p.dl, p.du)}
            className={`flex-1 text-xs rounded px-1 py-1.5 transition-colors ${
              activePreset === p.label
                ? 'bg-green-600 text-white'
                : 'bg-white/5 hover:bg-white/10 text-gray-300'
            }`}
          >{p.label}</button>
        ))}
      </div>

      {/* Min / Max price display */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-xs text-gray-400">Min Price</div>
          <div className="text-sm text-white font-mono">
            {priceLower < 0.0001 ? '0' : priceLower.toFixed(4)}
          </div>
          <div className="text-xs text-gray-500">USDC / MON</div>
          <div className="text-xs text-gray-600 mt-0.5">tick {tickLower}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-2.5">
          <div className="text-xs text-gray-400">Max Price</div>
          <div className="text-sm text-white font-mono">
            {priceUpper > 1e8 ? '∞' : priceUpper.toFixed(4)}
          </div>
          <div className="text-xs text-gray-500">USDC / MON</div>
          <div className="text-xs text-gray-600 mt-0.5">tick {tickUpper}</div>
        </div>
      </div>

      {isFullRange && (
        <div className="text-xs text-amber-400/70 bg-amber-400/5 rounded px-2 py-1 mb-2">
          Full range ≈ V2 behaviour — lower capital efficiency
        </div>
      )}

      {/* Amount input */}
      <div className="bg-white/5 rounded-lg p-3 flex items-center gap-2 mb-3">
        <input value={monAmt} onChange={e => setMonAmt(e.target.value)}
          placeholder="0.0" className="flex-1 bg-transparent text-white outline-none text-sm" />
        <span className="text-gray-400 text-sm">MON</span>
      </div>

      {/* Steps */}
      <div className="space-y-1.5 mb-3 text-xs">
        {[
          'approve USDC → NonfungiblePositionManager (tx 1)',
          'NPM.mint({ tickLower, tickUpper, amount0Desired, amount1Desired, … }) payable (tx 2)',
        ].map((s, i) => (
          <div key={i} className="flex gap-2 text-gray-300">
            <span className="w-4 h-4 rounded-full bg-green-500/30 text-green-300 flex items-center justify-center flex-shrink-0 text-[10px] mt-0.5">{i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-amber-300/80 mb-3">
        ⚠️ NonfungiblePositionManager address not yet verified on Monad
      </div>

      <button disabled className="w-full bg-green-600/50 text-gray-300 rounded-lg py-2 text-sm font-medium cursor-not-allowed mt-auto">
        Add Liquidity — 2 txs
      </button>

      <div className="mt-3 text-xs text-gray-500">
        Complexity: <span className="text-yellow-400">Medium</span> — price range required
      </div>
    </div>
  )
}

// ─── V4 ──────────────────────────────────────────────────────────────────────
// Pools (bytes32 IDs — NOT contract addresses):
//   AUSD/USDC  0xd112fde...  fee 0.0009%, tickSpacing 1
//   MON/USDC   0x18a9fc8...  fee 0.05%,   tickSpacing 10
//   AUSD/USDT0 0xe56868...   fee 0.005%,  tickSpacing 1
//   USDC/WETH  0xad40891...  fee 0.05%,   tickSpacing 10
//
// V4 Architecture difference vs V3:
//   V3: each pool = separate EVM contract (address)
//       NonfungiblePositionManager.mint(params) → ERC721 tokenId
//   V4: single PoolManager contract holds ALL pool state
//       pool "address" is replaced by poolKey = {token0, token1, fee, tickSpacing, hooks}
//       PositionManager.modifyLiquidities(actions[], deadline) — encodes multiple actions
//       Supports hook contracts (custom beforeSwap/afterSwap logic)
//
// Flow (3 txs):
//   1. approve token0 → PositionManager (via Permit2 or standard ERC20)
//   2. approve token1 → PositionManager
//   3. PositionManager.modifyLiquidities([MINT_POSITION, SETTLE_PAIR], deadline) payable

const V4_POOLS = [
  { id: '0xd112fde908d7342135fc7297cc53d25bf7a11d6c6e21fe7ac3e73c40f70827e8', token0: 'AUSD',  token1: 'USDC',  fee: '0.0009%', tickSpacing: 1,  },
  { id: '0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954', token0: 'MON',   token1: 'USDC',  fee: '0.05%',   tickSpacing: 10, },
  { id: '0xe56868928b91fcd5ebeada3d0ec8767f2bbfeb1e7da181203d13f6af76b03bf9', token0: 'AUSD',  token1: 'USDT0', fee: '0.005%',  tickSpacing: 1,  },
  { id: '0xad408916c1c310da9c258d4c128a7bf50fd9edc42a218cc970da39cfc8a05d93', token0: 'USDC',  token1: 'WETH',  fee: '0.05%',   tickSpacing: 10, },
]

function V4Example() {
  const [selectedPool, setSelectedPool] = useState(0)
  const pool = V4_POOLS[selectedPool]

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="bg-orange-500/20 text-orange-400 text-xs px-2 py-1 rounded font-mono">V4</span>
        <h2 className="text-white font-semibold">4 pools</h2>
        <span className="ml-auto text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">Singleton</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        PoolManager — all pools in one contract, hooks support
      </p>

      {/* V3 vs V4 architecture diff */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/5 rounded-lg p-2.5 text-xs">
          <div className="text-gray-400 font-medium mb-1.5">V3 model</div>
          <div className="text-gray-400">Pool = contract address</div>
          <div className="text-gray-400">NPM.mint() → ERC721</div>
          <div className="text-gray-400">1 pool = 1 contract</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2.5 text-xs">
          <div className="text-orange-300 font-medium mb-1.5">V4 model</div>
          <div className="text-orange-300/70">Pool = bytes32 poolKey hash</div>
          <div className="text-orange-300/70">modifyLiquidities(actions)</div>
          <div className="text-orange-300/70">ALL pools share 1 contract</div>
        </div>
      </div>

      {/* Pool selector */}
      <div className="text-xs text-gray-400 mb-1.5">Select Pool</div>
      <div className="grid grid-cols-2 gap-1 mb-3">
        {V4_POOLS.map((p, i) => (
          <button key={i}
            onClick={() => setSelectedPool(i)}
            className={`text-xs rounded-lg px-2 py-2 transition-colors text-left ${
              selectedPool === i ? 'bg-orange-600/40 border border-orange-500/50 text-white' : 'bg-white/5 hover:bg-white/8 text-gray-300 border border-transparent'
            }`}
          >
            <div className="font-medium">{p.token0}/{p.token1}</div>
            <div className="text-gray-500">{p.fee} · ts={p.tickSpacing}</div>
          </button>
        ))}
      </div>

      {/* Pool ID */}
      <div className="bg-white/5 rounded-lg p-3 mb-3">
        <div className="text-xs text-gray-400 mb-1">Pool ID (bytes32 — not an address)</div>
        <div className="text-xs text-white font-mono break-all leading-relaxed">
          {pool.id.slice(0, 20)}...{pool.id.slice(-8)}
        </div>
        <div className="text-xs text-gray-500 mt-1.5">
          hash(token0={pool.token0}, token1={pool.token1}, fee={pool.fee}, tickSpacing={pool.tickSpacing}, hooks=0x0)
        </div>
      </div>

      {/* Deposit flow */}
      <div className="space-y-1.5 mb-3 text-xs">
        {[
          `approve ${pool.token0} → PositionManager (tx 1)`,
          `approve ${pool.token1} → PositionManager (tx 2)`,
          'PositionManager.modifyLiquidities([MINT_POSITION, SETTLE_PAIR], deadline) (tx 3)',
        ].map((s, i) => (
          <div key={i} className="flex gap-2 text-gray-300">
            <span className="w-4 h-4 rounded-full bg-orange-500/30 text-orange-300 flex items-center justify-center flex-shrink-0 text-[10px] mt-0.5">{i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {/* What's missing */}
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300/80 mb-3 space-y-1">
        <div className="text-red-300 font-medium mb-1">Needs before building:</div>
        <div>• PoolManager address on Monad (not public yet)</div>
        <div>• PositionManager address</div>
        <div>• <span className="font-mono">@uniswap/v4-sdk</span> for MINT_POSITION action encoding</div>
        <div>• slot0 read from PoolManager (different from V3)</div>
      </div>

      <button disabled className="w-full bg-orange-600/30 text-gray-400 rounded-lg py-2 text-sm font-medium cursor-not-allowed mt-auto">
        Not ready — awaiting contract addresses
      </button>

      <div className="mt-3 text-xs text-gray-500">
        Complexity: <span className="text-red-400">High</span> — new SDK + batched action encoding
      </div>
    </div>
  )
}

// ─── Summary Table ────────────────────────────────────────────────────────────

function SummaryTable() {
  const rows = [
    { prop: 'Pool identifier',     v2: 'contract address',         v3: 'contract address',         v4: 'bytes32 poolKey hash'       },
    { prop: 'Price range',         v2: 'Full (0 → ∞)',             v3: 'Custom tick range',         v4: 'Custom tick range'          },
    { prop: '# transactions',      v2: '3 (approve×2 + add)',      v3: '2 (approve + mint)',        v4: '3 (approve×2 + modify)'     },
    { prop: 'Position receipt',    v2: 'LP token (ERC20)',         v3: 'NFT (ERC721)',              v4: 'NFT (ERC721)'               },
    { prop: 'SDK',                 v2: 'none needed',              v3: '@uniswap/v3-sdk optional',  v4: '@uniswap/v4-sdk required'   },
    { prop: 'Monad contract addr', v2: '⚠️ unverified',            v3: '⚠️ unverified',             v4: '❌ not public yet'          },
    { prop: 'Build difficulty',    v2: '🟢 Easy',                  v3: '🟡 Medium',                 v4: '🔴 Hard'                    },
  ]

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 mt-4">
      <h2 className="text-white font-semibold mb-3">Comparison</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-gray-300">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 text-gray-400 pr-4">Property</th>
              <th className="text-center py-2 text-blue-400 px-3">V2</th>
              <th className="text-center py-2 text-green-400 px-3">V3</th>
              <th className="text-center py-2 text-orange-400 px-3">V4</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-2 text-gray-400 pr-4 whitespace-nowrap">{r.prop}</td>
                <td className="py-2 text-center px-3 text-gray-300">{r.v2}</td>
                <td className="py-2 text-center px-3 text-gray-300">{r.v3}</td>
                <td className="py-2 text-center px-3 text-gray-300">{r.v4}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-white/3 rounded-lg text-xs text-gray-400 space-y-1">
        <div className="text-gray-300 font-medium mb-1">Recommendation for Monatrix</div>
        <div>→ <span className="text-blue-400">V2 (DUST/USDC)</span>: build first — simplest, no range needed, just need Router address</div>
        <div>→ <span className="text-green-400">V3 (MON/USDC)</span>: build on dedicated pool page — slot0 works now, just need NPM address</div>
        <div>→ <span className="text-orange-400">V4</span>: skip for now — wait until Uniswap publishes Monad contract addresses</div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TestUniswapPage() {
  return (
    <main className="min-h-screen bg-[#0e0e1a] p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Uniswap LP Deposit — V2 / V3 / V4</h1>
          <p className="text-gray-400 text-sm">
            Demo page comparing deposit flows. Live data fetched from Monad mainnet where available.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 items-start">
          <V2Example />
          <V3Example />
          <V4Example />
        </div>

        <SummaryTable />
      </div>
    </main>
  )
}
