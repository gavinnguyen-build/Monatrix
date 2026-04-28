// Portfolio tracking — pure on-chain reads via viem publicClient
// No wallet interaction, no signing. Only view functions via multicall.

import { createPublicClient, http, defineChain, parseAbi, keccak256, encodeAbiParameters, type Address } from 'viem'
import { loadV4TokenIds } from './v4positions'
import {
  MORPHO_VAULTS, CURVANCE_MARKETS, CURVANCE_BORROW_MARKETS, KURU_VAULTS, KURU_MARGIN_ACCOUNT,
  CLOBER_LV, CLOBER_POOLS,
  UNISWAP_V3_NPM, UNISWAP_V3_POOLS,
  PANCAKESWAP_V3_NPM, PANCAKESWAP_V3_POOLS,
  UNISWAP_V4_POSITION_MANAGER, UNISWAP_V4_STATE_VIEW, UNISWAP_V4_POOLS,
  UNISWAP_V2_POOLS, UNISWAP_V2_PAIR_ABI,
} from './contracts'

// ─── Chain ──────────────────────────────────────────────────────────────────
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc3.monad.xyz'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
})


// ─── Contracts ──────────────────────────────────────────────────────────────
const DATA_PROVIDER  = '0xfd0b6b6f736376f7b99ee989c749007c7757fdba' as Address
const FALLBACK_ADDR  = '0x0000000000000000000000000000000000000001' as Address

// ─── ABIs ───────────────────────────────────────────────────────────────────
const DP_ABI        = parseAbi(['function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)'])
const BALANCE_ABI     = parseAbi(['function balanceOf(address account) view returns (uint256)'])
const CONVERT_ABI     = parseAbi(['function convertToAssets(uint256 shares) view returns (uint256)'])
const EXCH_RATE_ABI   = parseAbi(['function exchangeRateStored() view returns (uint256)'])
const TOTAL_SUP_ABI   = parseAbi(['function totalSupply() view returns (uint256)'])
const GET_BALANCE_ABI = parseAbi(['function getBalance(address user, address token) view returns (uint256)'])
// Compound V2 borrow balance (Curvance loanCToken)
const BORROW_BAL_ABI = parseAbi(['function borrowBalanceStored(address account) view returns (uint256)'])
// Aave V3 RewardsController — Neverland DUST rewards
const DUST_REWARDS_ABI = parseAbi(['function getUserRewards(address[] assets, address user, address reward) view returns (uint256)'])
const DUST_REWARDS_CONTROLLER = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec' as Address
const DUST_TOKEN = '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c' as Address
// Clober Rebalancer uses ERC6909: balanceOf(address, uint256 id) where id = BigInt(poolKey)
const CLOBER_BAL_ABI = parseAbi(['function balanceOf(address owner, uint256 id) view returns (uint256)'])
const CLOBER_SUP_ABI = parseAbi(['function totalSupply(uint256 id) view returns (uint256)'])
// getLiquidity returns two structs: liquidityA (USDC) and liquidityB (WMON)
const CLOBER_LIQ_ABI = parseAbi(['function getLiquidity(bytes32 key) view returns ((uint256 reserve, uint256 claimable, uint256 cancelable) liquidityA, (uint256 reserve, uint256 claimable, uint256 cancelable) liquidityB)'])

// V3 NFT enumeration + position reading
const V3_TOIDX_ABI  = parseAbi(['function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)'])
const V3_POS_ABI   = parseAbi([
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
])
// Minimal slot0: first two return values (sqrtPriceX96, tick) are static at fixed offsets
// Works for both Uniswap V3 and PancakeSwap V3 pools despite different feeProtocol sizes
const V3_SLOT0_ABI  = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick)'])
// Fee growth globals — read once per unique pool, used with tick data for exact uncollected fee math
const FEE_GLOBAL_ABI = parseAbi([
  'function feeGrowthGlobal0X128() view returns (uint256)',
  'function feeGrowthGlobal1X128() view returns (uint256)',
])
// Tick data — feeGrowthOutside{0,1}X128 at indices [2] and [3] of the return tuple
const TICKS_ABI = parseAbi([
  'function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
])

// V4 PositionManager read ABIs
const V4_OWNER_ABI    = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)'])
// getPoolAndPositionInfo: returns (PoolKey tuple, PositionInfo bytes32)
const V4_POOL_POS_ABI = parseAbi([
  'function getPoolAndPositionInfo(uint256 tokenId) view returns ((address, address, uint24, int24, address), bytes32)',
])
const V4_LIQ_ABI      = parseAbi(['function getPositionLiquidity(uint256 tokenId) view returns (uint128)'])
// V4 StateView slot0 — same minimal approach as V3 slot0
const V4_SLOT0_ABI    = parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160, int24)'])

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000' as Address
const WMON_ADDR    = '0x3bd359c1119da7da1d913d1c4d2b7c461115433a'

// Token decimals — used for V3 position amount calculations
const TOKEN_DEC: Record<string, number> = {
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': 18, // WMON
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': 6,  // USDC
  '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': 6,  // AUSD
  '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242': 18, // WETH
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 8,  // WBTC
  '0xad96c3dffcd6374294e2573a7fbba96097cc8d7c': 18, // DUST
  '0x1b68626dca36c7fe922fd2d55e4f631d962de19c': 18, // shMON
  '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081': 18, // gMON
  '0xa3227c5969757783154c60bf0bc1944180ed81b9': 18, // sMON
  '0x0c65a0bc65a5d819235b71f554d210d3f80e0852': 18, // aprMON
  '0x1ad7052bb331a0529c1981c3ec2bc4663498a110': 18, // ALLOCA
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 6,  // USDT0
  '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b': 8,  // cbBTC
  '0x01bff41798a0bcf287b996046ca68b395dbc1071': 6,  // XAUt0
  '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417': 18, // wstETH
  '0xa3d68b74bf0528fdd07263c60d6488749044914b': 18, // weETH
  '0x0a332311633c0625f63cfc51ee33fc49826e0a3c': 18, // APR (aprMON ecosystem)
  '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56': 18, // LVMON
  '0xf59d81cd43f620e722e07f9cb3f6e41b031017a3': 18, // Cake
  '0x1001ff13bf368aa4fa85f21043648079f00e1001': 18, // LV
}

// ─── Static data ────────────────────────────────────────────────────────────

// Liquid staking receipt tokens (ERC4626-like, convertToAssets supported)
const LST_TOKENS = [
  { sym: 'gMON',   address: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' as Address, dec: 18, protocol: 'Magma',   poolId: 'magma-gmon'     },
  { sym: 'shMON',  address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as Address, dec: 18, protocol: 'Fastlane', poolId: 'fastlane-shmon' },
  { sym: 'sMON',   address: '0xA3227C5969757783154C60bF0bC1944180ed81B9' as Address, dec: 18, protocol: 'Kintsu',   poolId: 'kintsu-smon'    },
  { sym: 'aprMON', address: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852' as Address, dec: 18, protocol: 'Apriori',  poolId: 'apriori-aprmon' },
]

// Neverland reserves — same order as the adapter
const NEVERLAND_ASSETS = [
  { sym: 'USDC',     address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as Address, dec: 6,  poolId: 'neverland-lending-usdc'     },
  { sym: 'WMON',     address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address, dec: 18, poolId: 'neverland-lending-wmon'     },
  { sym: 'USDT0',    address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D' as Address, dec: 6,  poolId: 'neverland-lending-usdt0'    },
  { sym: 'WBTC',     address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' as Address, dec: 8,  poolId: 'neverland-lending-wbtc'     },
  { sym: 'WETH',     address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242' as Address, dec: 18, poolId: 'neverland-lending-weth'     },
  { sym: 'AUSD',     address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' as Address, dec: 6,  poolId: 'neverland-lending-ausd'     },
  { sym: 'sMON',     address: '0xA3227C5969757783154C60bF0bC1944180ed81B9' as Address, dec: 18, poolId: 'neverland-lending-smon'     },
  { sym: 'shMON',    address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as Address, dec: 18, poolId: 'neverland-lending-shmon'    },
  { sym: 'gMON',     address: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' as Address, dec: 18, poolId: 'neverland-lending-gmon'     },
  { sym: 'earnAUSD', address: '0x103222f020e98Bba0AD9809A011FDF8e6F067496' as Address, dec: 6,  poolId: 'neverland-lending-earnausd' },
  { sym: 'loAZND',   address: '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90' as Address, dec: 18, poolId: 'neverland-lending-loaznd'   },
]

// DEX anchor pools for real-time price derivation (slot0 reads, no oracle dependency)
// All pools on Monad mainnet — V3 pools use slot0(), V4 pools use StateView.getSlot0(poolId)
// Each entry: { addr, t0Dec, t1Dec } where price of token0 in token1 = sqrtX96ToToken0Price(...)
const V3_PRICE_POOLS = [
  { addr: '0x63e48b725540a3db24acf6682a29f877808c53f2' as Address, t0Dec: 18, t1Dec: 6  }, // [0] PancakeSwap WMON/USDC-500  → MON price (direct)
  { addr: '0xe5bf0f773740a48cda56b8df37e0dc182f377139' as Address, t0Dec: 6,  t1Dec: 18 }, // [1] PancakeSwap USDC/WETH-500  → WETH price (inverse)
  { addr: '0x9b60e561e3ab15782fbb23ea0a766dd8d91ff8ac' as Address, t0Dec: 8,  t1Dec: 6  }, // [2] PancakeSwap WBTC/USDC-500  → WBTC price (direct)
  { addr: '0xF98D134EF12E3D5DbcF986504B799999b7ded631' as Address, t0Dec: 6,  t1Dec: 18 }, // [3] Uniswap V3 USDC/DUST       → DUST price (inverse)
  { addr: '0xa5c3a55af4029724f519ac8d340be9916ac83e45' as Address, t0Dec: 6,  t1Dec: 6  }, // [4] PancakeSwap XAUt0/USDT0-500 → XAUt0 price (direct, USDT0≈$1)
  { addr: '0xca50b90382eed621b193fe8282f90b2f3a181d03' as Address, t0Dec: 8,  t1Dec: 18 }, // [5] PancakeSwap cbBTC/WETH-500  → cbBTC (direct × WETH price)
  { addr: '0x1ED2F2057901BBEf02EFbC9928b113a15844A19a' as Address, t0Dec: 18, t1Dec: 18 }, // [6] Uniswap V3 ALLOCA/WMON     → ALLOCA (direct × MON price)
  { addr: '0x276664da3b25af7cd13eb4d3294d9840b60e5732' as Address, t0Dec: 18, t1Dec: 18 }, // [7] PancakeSwap LV/WMON-2500   → LV (direct × MON price)
] as const

// V4 pools via StateView.getSlot0(poolId) — all 18-dec/18-dec ratios relative to WETH
const V4_PRICE_POOL_IDS = [
  '0x2884b37c4a144e7047a1377ba7201d4b8ea318f0240369e01dc400f04e6cac40', // [0] weETH/WETH  → weETH (× WETH price)
  '0x55d7ed991392eb9597a76a5f41dfb964e291452c15107c0e64fd3d25925394ce', // [1] wstETH/WETH → wstETH (× WETH price)
] as const

const ADDR_TO_SYM: Record<string, string> = {
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': 'WMON',
  '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081': 'gMON',
  '0x1b68626dca36c7fe922fd2d55e4f631d962de19c': 'shMON',
  '0xa3227c5969757783154c60bf0bc1944180ed81b9': 'sMON',
  '0x0c65a0bc65a5d819235b71f554d210d3f80e0852': 'aprMON',
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': 'USDC',
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 'USDT0',
  '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': 'AUSD',
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 'WBTC',
  '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242': 'WETH',
  '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b': 'cbBTC',
  '0x111111d2bf19e43c34263401e0cad979ed1cdb61': 'USD1',
  '0x103222f020e98bba0ad9809a011fdf8e6f067496': 'earnAUSD',
  '0x9c82eb49b51f7dc61e22ff347931ca32adc6cd90': 'loAZND',
  '0xad96c3dffcd6374294e2573a7fbba96097cc8d7c': 'DUST',
}

// ─── V3 pool lookup maps (built once at module init) ─────────────────────────
// Key: "token0lower-token1lower-fee" → pool metadata
type V3PoolMeta = { poolId: string; address: `0x${string}`; t0Sym: string; t1Sym: string }

const UNI_V3_MAP: Record<string, V3PoolMeta> = {}
for (const [poolId, p] of Object.entries(UNISWAP_V3_POOLS)) {
  const key = `${p.token0.toLowerCase()}-${p.token1.toLowerCase()}-${p.fee}`
  UNI_V3_MAP[key] = { poolId, address: p.address as `0x${string}`, t0Sym: p.token0Sym, t1Sym: p.token1Sym }
}

const CAKE_V3_MAP: Record<string, V3PoolMeta> = {}
for (const [poolId, p] of Object.entries(PANCAKESWAP_V3_POOLS)) {
  const key = `${p.token0.toLowerCase()}-${p.token1.toLowerCase()}-${p.fee}`
  CAKE_V3_MAP[key] = { poolId, address: p.address as `0x${string}`, t0Sym: p.t0Sym, t1Sym: p.t1Sym }
}

// V4 pool lookup: "c0lower-c1lower-fee" → pool metadata
const UNI_V4_MAP: Record<string, { poolId: `0x${string}`; c0Sym: string; c1Sym: string; c0Dec: number; c1Dec: number; poolKey: string }> = {}
for (const [poolKey, p] of Object.entries(UNISWAP_V4_POOLS)) {
  const key = `${p.currency0.toLowerCase()}-${p.currency1.toLowerCase()}-${p.fee}`
  UNI_V4_MAP[key] = { poolId: p.poolId, c0Sym: p.c0Sym, c1Sym: p.c1Sym, c0Dec: p.c0Dec, c1Dec: p.c1Dec, poolKey }
}

// ─── V3/V4 tick math ─────────────────────────────────────────────────────────
// Float-based approximation — good enough for USD display (±<1% for typical ranges)
function tickToSqrtX96(tick: number): bigint {
  const sqrtPrice = Math.sqrt(Math.pow(1.0001, tick))
  return BigInt(Math.floor(sqrtPrice * 2 ** 96))
}

// Compute raw token amounts from a V3 liquidity position
function v3Amounts(
  liquidity:    bigint,
  sqrtPriceX96: bigint,  // from slot0()
  tickCurrent:  number,
  tickLower:    number,
  tickUpper:    number,
): [bigint, bigint] {
  if (liquidity === 0n) return [0n, 0n]
  const Q96  = 2n ** 96n
  const sqrtA = tickToSqrtX96(tickLower)
  const sqrtB = tickToSqrtX96(tickUpper)
  const sqrtC = sqrtPriceX96

  if (tickCurrent < tickLower) {
    // Below range — entirely token0
    return [(liquidity * Q96 * (sqrtB - sqrtA)) / (sqrtA * sqrtB), 0n]
  } else if (tickCurrent >= tickUpper) {
    // Above range — entirely token1
    return [0n, (liquidity * (sqrtB - sqrtA)) / Q96]
  } else {
    // In range — both tokens
    return [
      (liquidity * Q96 * (sqrtB - sqrtC)) / (sqrtC * sqrtB),
      (liquidity * (sqrtC - sqrtA)) / Q96,
    ]
  }
}

// Decode Uniswap V4 PositionInfo (bytes32 → ticks)
// Layout: [255..56] poolId | [55..32] tickUpper (int24) | [31..8] tickLower (int24) | [7..0] flags
// Note: tickUpper is stored at higher bits than tickLower (counter-intuitive naming in V4 source)
function decodePositionInfo(info: bigint): { tickLower: number; tickUpper: number } {
  const tickUpper = Number(BigInt.asIntN(24, (info >> 32n) & 0xFFFFFFn))
  const tickLower = Number(BigInt.asIntN(24, (info >> 8n) & 0xFFFFFFn))
  return { tickLower, tickUpper }
}

// Compute V4 PoolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
// Matches PoolIdLibrary.toId() in the V4 contracts (5 × 32-byte ABI-encoded struct)
function computeV4PoolId(c0: Address, c1: Address, fee: number, tickSpacing: number, hooks: Address): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [c0, c1, fee, tickSpacing, hooks],
  ))
}

// DEX price helper: price of token0 in token1 (human-readable USD or token)
// sqrtPriceX96 = sqrt(token1_raw / token0_raw) × 2^96  (Uniswap V3/V4 convention)
// price_human  = (sqrtPriceX96 / 2^96)^2 × 10^(dec0 - dec1)
function sqrtX96ToToken0Price(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  const sqrt = Number(sqrtPriceX96) / (2 ** 96)
  return sqrt * sqrt * Math.pow(10, dec0 - dec1)
}

// V3 fee growth math — computes actual uncollected fees (feeGrowthInside formula from Uniswap V3 whitepaper)
// uint256 subtraction wraps around (mirrors Solidity overflow semantics)
const UINT256_WRAP = 2n ** 256n
function u256Sub(a: bigint, b: bigint): bigint { return a >= b ? a - b : UINT256_WRAP + a - b }

function v3FeeGrowthInside(
  tickCurrent: number, tickLower: number, tickUpper: number,
  global0: bigint, global1: bigint,
  outsideLower0: bigint, outsideLower1: bigint,
  outsideUpper0: bigint, outsideUpper1: bigint,
): [bigint, bigint] {
  const fg0Below = tickCurrent >= tickLower ? outsideLower0 : u256Sub(global0, outsideLower0)
  const fg1Below = tickCurrent >= tickLower ? outsideLower1 : u256Sub(global1, outsideLower1)
  const fg0Above = tickCurrent <  tickUpper ? outsideUpper0 : u256Sub(global0, outsideUpper0)
  const fg1Above = tickCurrent <  tickUpper ? outsideUpper1 : u256Sub(global1, outsideUpper1)
  return [u256Sub(u256Sub(global0, fg0Below), fg0Above), u256Sub(u256Sub(global1, fg1Below), fg1Above)]
}

// Reverse map: computed poolId (bytes32) → monatrix pool key (for /pools/[id] links)
const V4_BYTES32_TO_KEY: Record<string, string> = {}
for (const [poolKey, p] of Object.entries(UNISWAP_V4_POOLS)) {
  V4_BYTES32_TO_KEY[p.poolId.toLowerCase()] = poolKey
}

// ─── Cache ───────────────────────────────────────────────────────────────────
// Prevents duplicate fetches from React StrictMode double-invocation and
// hydration re-renders. TTL = 60s (fresh enough for portfolio display).
// ─── Types ───────────────────────────────────────────────────────────────────
export interface TokenAmount { sym: string; amount: number; usd: number }

export interface Position {
  protocol:     string
  label:        string    // "gMON", "USDC", "MON/WETH"
  tokenSym:     string
  amount:       number    // underlying token amount (human-readable)
  amountUsd:    number
  poolId:       string    // link to /pools/[id]
  positionId?:  string    // NFT tokenId "#32485", vault name, etc.
  positionType?: string   // "Liquidity Pool" | "Yield" | "Lending" | "Borrowing" | "Staking"
  amounts?:     TokenAmount[]  // per-token balance breakdown
  rewards?:     TokenAmount[]  // per-token claimable fees/rewards
  rewardUsd?:   number
}

// ─── Main ────────────────────────────────────────────────────────────────────
export async function fetchPortfolio(wallet: Address): Promise<Position[]> {
  const client = createPublicClient({ chain: monad, transport: http('https://rpc3.monad.xyz') })
  const positions: Position[] = []

  // ── Batch 1 (parallel): DEX slot0 prices + aToken addresses ─────────────────
  const [v3PriceRes, v4PriceRes, aTokenResults] = await Promise.all([
    client.multicall({
      contracts: V3_PRICE_POOLS.map(p => ({
        address: p.addr, abi: V3_SLOT0_ABI, functionName: 'slot0' as const,
      })),
      allowFailure: true,
    }),
    client.multicall({
      contracts: V4_PRICE_POOL_IDS.map(id => ({
        address: UNISWAP_V4_STATE_VIEW.address as Address, abi: V4_SLOT0_ABI,
        functionName: 'getSlot0' as const, args: [id as `0x${string}`] as const,
      })),
      allowFailure: true,
    }),
    client.multicall({
      contracts: NEVERLAND_ASSETS.map(a => ({
        address: DATA_PROVIDER, abi: DP_ABI,
        functionName: 'getReserveTokensAddresses' as const, args: [a.address] as const,
      })),
      allowFailure: true,
    }),
  ])

  // ── Build price map from DEX slot0 (all prices in USD) ──────────────────────
  const priceMap: Record<string, number> = {}

  // Stablecoins — hardcoded $1.00
  priceMap['0x754704bc059f8c67012fed69bc8a327a5aafb603'] = 1  // USDC
  priceMap['0x00000000efe302beaa2b3e6e1b18d08d69a9012a'] = 1  // AUSD
  priceMap['0xe7cd86e13ac4309349f30b3435a9d337750fc82d'] = 1  // USDT0
  priceMap['0x111111d2bf19e43c34263401e0cad979ed1cdb61'] = 1  // USD1
  priceMap['0x103222f020e98bba0ad9809a011fdf8e6f067496'] = 1  // earnAUSD (AUSD yield)
  priceMap['0xd793c04b87386a6bb84ee61d98e0065fde7fda5e'] = 1  // sAUSD

  function getSqrt(res: { status: string; result?: unknown }): bigint | null {
    if (res.status !== 'success') return null
    return (res.result as [bigint, number])[0]
  }

  // [0] WMON/USDC — MON price (direct token0 price in token1)
  const monSqrt = getSqrt(v3PriceRes[0])
  const monPrice = monSqrt ? sqrtX96ToToken0Price(monSqrt, V3_PRICE_POOLS[0].t0Dec, V3_PRICE_POOLS[0].t1Dec) : 0
  if (monPrice) {
    priceMap[WMON_ADDR] = monPrice
    // LST tokens track MON 1:1 (convertToAssets handles the actual ratio)
    priceMap['0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081'] = monPrice  // gMON
    priceMap['0x1b68626dca36c7fe922fd2d55e4f631d962de19c'] = monPrice  // shMON
    priceMap['0xa3227c5969757783154c60bf0bc1944180ed81b9'] = monPrice  // sMON
    priceMap['0x0c65a0bc65a5d819235b71f554d210d3f80e0852'] = monPrice  // aprMON
  }

  // [1] USDC/WETH — WETH price (inverse: we get price of USDC in WETH, flip it)
  const wethSqrt = getSqrt(v3PriceRes[1])
  const usdcPerWeth = wethSqrt ? sqrtX96ToToken0Price(wethSqrt, V3_PRICE_POOLS[1].t0Dec, V3_PRICE_POOLS[1].t1Dec) : 0
  const wethPrice = usdcPerWeth > 0 ? 1 / usdcPerWeth : 0
  if (wethPrice) priceMap['0xee8c0e9f1bffb4eb878d8f15f368a02a35481242'] = wethPrice  // WETH

  // [2] WBTC/USDC — WBTC price (direct)
  const wbtcSqrt = getSqrt(v3PriceRes[2])
  if (wbtcSqrt) priceMap['0x0555e30da8f98308edb960aa94c0db47230d2b9c'] = sqrtX96ToToken0Price(wbtcSqrt, V3_PRICE_POOLS[2].t0Dec, V3_PRICE_POOLS[2].t1Dec)

  // [3] USDC/DUST — DUST price (inverse)
  const dustSqrt = getSqrt(v3PriceRes[3])
  const usdcPerDust = dustSqrt ? sqrtX96ToToken0Price(dustSqrt, V3_PRICE_POOLS[3].t0Dec, V3_PRICE_POOLS[3].t1Dec) : 0
  if (usdcPerDust > 0) priceMap['0xad96c3dffcd6374294e2573a7fbba96097cc8d7c'] = 1 / usdcPerDust  // DUST

  // [4] XAUt0/USDT0 — XAUt0 price (direct, USDT0 ≈ $1)
  const xautSqrt = getSqrt(v3PriceRes[4])
  if (xautSqrt) priceMap['0x01bff41798a0bcf287b996046ca68b395dbc1071'] = sqrtX96ToToken0Price(xautSqrt, V3_PRICE_POOLS[4].t0Dec, V3_PRICE_POOLS[4].t1Dec)

  // [5] cbBTC/WETH — cbBTC price (direct ratio × WETH price)
  const cbbtcSqrt = getSqrt(v3PriceRes[5])
  if (cbbtcSqrt && wethPrice) priceMap['0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b'] = sqrtX96ToToken0Price(cbbtcSqrt, V3_PRICE_POOLS[5].t0Dec, V3_PRICE_POOLS[5].t1Dec) * wethPrice

  // [6] ALLOCA/WMON — ALLOCA price (direct ratio × MON price)
  const allocaSqrt = getSqrt(v3PriceRes[6])
  if (allocaSqrt && monPrice) priceMap['0x1ad7052bb331a0529c1981c3ec2bc4663498a110'] = sqrtX96ToToken0Price(allocaSqrt, V3_PRICE_POOLS[6].t0Dec, V3_PRICE_POOLS[6].t1Dec) * monPrice

  // [7] LV/WMON — LV price (direct ratio × MON price)
  const lvSqrt = getSqrt(v3PriceRes[7])
  if (lvSqrt && monPrice) priceMap['0x1001ff13bf368aa4fa85f21043648079f00e1001'] = sqrtX96ToToken0Price(lvSqrt, V3_PRICE_POOLS[7].t0Dec, V3_PRICE_POOLS[7].t1Dec) * monPrice

  // V4 [0] weETH/WETH — weETH price (ratio × WETH price)
  const weEthSqrt = getSqrt(v4PriceRes[0])
  if (weEthSqrt && wethPrice) priceMap['0xa3d68b74bf0528fdd07263c60d6488749044914b'] = sqrtX96ToToken0Price(weEthSqrt, 18, 18) * wethPrice

  // V4 [1] wstETH/WETH — wstETH price (ratio × WETH price)
  const wstEthSqrt = getSqrt(v4PriceRes[1])
  if (wstEthSqrt && wethPrice) priceMap['0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417'] = sqrtX96ToToken0Price(wstEthSqrt, 18, 18) * wethPrice

  const price = (addr: Address) => priceMap[addr.toLowerCase()] ?? 0

  // aToken addresses per Neverland reserve
  const aTokens = aTokenResults.map(r =>
    r.status === 'success'
      ? (r.result as [Address, Address, Address])[0]
      : null
  )
  // variableDebtToken addresses (index 2) — reuse the same multicall result
  const debtTokens = aTokenResults.map(r =>
    r.status === 'success'
      ? (r.result as [Address, Address, Address])[2]
      : null
  )

  // ── Batch 2: all balanceOf calls in one multicall ─────────────────────────
  const morphoKeys    = Object.keys(MORPHO_VAULTS)
  const curvanceKeys  = Object.keys(CURVANCE_MARKETS)

  const allCalls = [
    // LST (4)
    ...LST_TOKENS.map(t => ({
      address: t.address, abi: BALANCE_ABI,
      functionName: 'balanceOf' as const, args: [wallet] as const,
    })),
    // Morpho vault shares (9)
    ...morphoKeys.map(k => ({
      address: MORPHO_VAULTS[k].vault, abi: BALANCE_ABI,
      functionName: 'balanceOf' as const, args: [wallet] as const,
    })),
    // Neverland aTokens (11)
    ...NEVERLAND_ASSETS.map((_, i) => ({
      address: aTokens[i] ?? FALLBACK_ADDR, abi: BALANCE_ABI,
      functionName: 'balanceOf' as const, args: [wallet] as const,
    })),
    // Curvance colCTokens (19)
    ...curvanceKeys.map(k => ({
      address: CURVANCE_MARKETS[k].colCToken, abi: BALANCE_ABI,
      functionName: 'balanceOf' as const, args: [wallet] as const,
    })),
  ]

  const validATokens = aTokens.filter((a): a is Address => a !== null)
  const [allBalances, dustRewardRaw] = await Promise.all([
    client.multicall({ contracts: allCalls, allowFailure: true }),
    client.readContract({
      address: DUST_REWARDS_CONTROLLER,
      abi: DUST_REWARDS_ABI,
      functionName: 'getUserRewards',
      args: [validATokens, wallet as Address, DUST_TOKEN],
    }).catch(() => 0n),
  ])
  let idx = 0

  // ── LST positions ─────────────────────────────────────────────────────────
  const lstBalances = allBalances.slice(idx, idx + LST_TOKENS.length)
  idx += LST_TOKENS.length

  const lstActive = LST_TOKENS
    .map((t, i) => ({ t, shares: lstBalances[i].status === 'success' ? lstBalances[i].result as bigint : 0n }))
    .filter(x => x.shares > 0n)

  if (lstActive.length > 0) {
    const underlyings = await client.multicall({
      contracts: lstActive.map(({ t, shares }) => ({
        address: t.address, abi: CONVERT_ABI,
        functionName: 'convertToAssets' as const, args: [shares] as const,
      })),
      allowFailure: true,
    })
    lstActive.forEach(({ t, shares }, i) => {
      const r = underlyings[i]
      const raw = r.status === 'success' ? r.result as bigint : shares
      const amt = Number(raw) / 10 ** t.dec
      const usd = amt * price(t.address)
      if (usd < 0.01) return
      positions.push({ protocol: t.protocol, label: t.sym, tokenSym: t.sym, amount: amt, amountUsd: usd, poolId: t.poolId, positionType: 'Staking' })
    })
  }

  // ── Morpho positions ──────────────────────────────────────────────────────
  const morphoBalances = allBalances.slice(idx, idx + morphoKeys.length)
  idx += morphoKeys.length

  const morphoActive = morphoKeys
    .map((k, i) => ({ k, v: MORPHO_VAULTS[k], shares: morphoBalances[i].status === 'success' ? morphoBalances[i].result as bigint : 0n }))
    .filter(x => x.shares > 0n)

  if (morphoActive.length > 0) {
    const underlyings = await client.multicall({
      contracts: morphoActive.map(({ v, shares }) => ({
        address: v.vault, abi: CONVERT_ABI,
        functionName: 'convertToAssets' as const, args: [shares] as const,
      })),
      allowFailure: true,
    })
    morphoActive.forEach(({ k, v }, i) => {
      const r = underlyings[i]
      const raw = r.status === 'success' ? r.result as bigint : morphoActive[i].shares
      const amt = Number(raw) / 10 ** v.decimals
      const sym = ADDR_TO_SYM[v.asset.toLowerCase()] ?? v.asset.slice(0, 6)
      const usd = amt * price(v.asset)
      if (usd < 0.01) return
      positions.push({ protocol: 'Morpho', label: sym, tokenSym: sym, amount: amt, amountUsd: usd, poolId: k, positionType: 'Lending' })
    })
  }

  // ── Neverland positions (aToken 1:1 underlying in Aave V3) ───────────────
  const neverlandBalances = allBalances.slice(idx, idx + NEVERLAND_ASSETS.length)
  idx += NEVERLAND_ASSETS.length

  NEVERLAND_ASSETS.forEach((a, i) => {
    if (!aTokens[i]) return
    const r = neverlandBalances[i]
    if (r.status !== 'success') return
    const raw = r.result as bigint
    if (raw === 0n) return
    const amt = Number(raw) / 10 ** a.dec
    const usd = amt * price(a.address)
    if (usd < 0.01) return
    positions.push({ protocol: 'Neverland', label: a.sym, tokenSym: a.sym, amount: amt, amountUsd: usd, poolId: a.poolId, positionType: 'Lending' })
  })

  // Attach DUST rewards to first active Neverland supply position
  {
    const dustAmt = Number(dustRewardRaw as bigint) / 1e18
    const dustUsd = dustAmt * price(DUST_TOKEN)
    if (dustUsd >= 0.01) {
      const firstNev = positions.find(p => p.protocol === 'Neverland' && p.amountUsd > 0)
      if (firstNev) firstNev.rewardUsd = dustUsd
    }
  }

  // ── Curvance positions (Compound V2: underlying = shares × exchangeRate / 1e18) ──
  const curvanceBalances = allBalances.slice(idx, idx + curvanceKeys.length)
  idx += curvanceKeys.length

  const curvanceActive = curvanceKeys
    .map((k, i) => ({ k, m: CURVANCE_MARKETS[k], shares: curvanceBalances[i].status === 'success' ? curvanceBalances[i].result as bigint : 0n }))
    .filter(x => x.shares > 0n)

  if (curvanceActive.length > 0) {
    const rates = await client.multicall({
      contracts: curvanceActive.map(({ m }) => ({
        address: m.colCToken, abi: EXCH_RATE_ABI,
        functionName: 'exchangeRateStored' as const,
      })),
      allowFailure: true,
    })
    curvanceActive.forEach(({ k, m, shares }, i) => {
      const rr = rates[i]
      let amt: number
      if (rr.status === 'success') {
        const rate = rr.result as bigint
        // underlying_raw = cToken_raw × exchangeRate / 1e18 (Compound V2 convention)
        const underlyingRaw = (shares * rate) / (10n ** 18n)
        amt = Number(underlyingRaw) / 10 ** m.colDec
      } else {
        // Fallback: show raw shares divided by colDec (rough estimate)
        amt = Number(shares) / 10 ** m.colDec
      }
      const usd = amt * price(m.colAsset)
      if (usd < 0.01) return
      positions.push({ protocol: 'Curvance', label: m.colSym, tokenSym: m.colSym, amount: amt, amountUsd: usd, poolId: k, positionType: 'Lending' })
    })
  }

  // ── Kuru Vault positions ──────────────────────────────────────────────────
  // Each vault holds MON + quote token. User value = fraction × (monValue + quoteValue)
  const kuruKeys = Object.keys(KURU_VAULTS)
  if (kuruKeys.length > 0) {
    const kuruBatch = await client.multicall({
      contracts: kuruKeys.flatMap(k => [
        // user shares
        { address: KURU_VAULTS[k].address, abi: BALANCE_ABI,   functionName: 'balanceOf'   as const, args: [wallet] as const },
        // total shares
        { address: KURU_VAULTS[k].address, abi: TOTAL_SUP_ABI, functionName: 'totalSupply' as const },
        // vault MON balance in MarginAccount
        { address: KURU_MARGIN_ACCOUNT.address, abi: GET_BALANCE_ABI, functionName: 'getBalance' as const, args: [KURU_VAULTS[k].address, NATIVE_TOKEN] as const },
        // vault quote token balance
        { address: KURU_MARGIN_ACCOUNT.address, abi: GET_BALANCE_ABI, functionName: 'getBalance' as const, args: [KURU_VAULTS[k].address, KURU_VAULTS[k].quoteToken] as const },
      ]),
      allowFailure: true,
    })

    kuruKeys.forEach((k, i) => {
      const v = KURU_VAULTS[k]
      const base = i * 4
      const userShares  = kuruBatch[base + 0].status === 'success' ? kuruBatch[base + 0].result as bigint : 0n
      const totalShares = kuruBatch[base + 1].status === 'success' ? kuruBatch[base + 1].result as bigint : 0n
      const vaultMon    = kuruBatch[base + 2].status === 'success' ? kuruBatch[base + 2].result as bigint : 0n
      const vaultQuote  = kuruBatch[base + 3].status === 'success' ? kuruBatch[base + 3].result as bigint : 0n

      if (userShares === 0n || totalShares === 0n) return

      const fraction   = Number(userShares) / Number(totalShares)
      const monPrice   = priceMap[WMON_ADDR] ?? 0
      const quotePrice = price(v.quoteToken)
      const monUsd     = (Number(vaultMon)   / 1e18)             * monPrice
      const quoteUsd   = (Number(vaultQuote) / 10 ** v.quoteDec) * quotePrice
      const userUsd    = fraction * (monUsd + quoteUsd)

      if (userUsd < 0.01) return
      const userMon   = (Number(vaultMon)   / 1e18)             * fraction
      const userQuote = (Number(vaultQuote) / 10 ** v.quoteDec) * fraction
      positions.push({
        protocol:     'Kuru',
        label:        `MON/${v.quoteSym}`,
        tokenSym:     `MON+${v.quoteSym}`,
        amount:       fraction * 100,
        amountUsd:    userUsd,
        poolId:       k,
        positionId:   'KURU-VAULT',
        positionType: 'Yield',
        amounts: [
          { sym: 'MON',       amount: userMon,   usd: userMon   * monPrice   },
          { sym: v.quoteSym,  amount: userQuote, usd: userQuote * quotePrice },
        ],
      })
    })
  }

  // ── Clober LP positions ───────────────────────────────────────────────────
  // LiquidityVault uses keyed LP: balanceOf(bytes32 key, address user)
  // getLiquidity returns: [usdcReserve, pendingA, claimableA, wmonReserve, pendingB, claimableB]
  const cloberPoolKeys = Object.keys(CLOBER_POOLS)
  if (cloberPoolKeys.length > 0) {
    const cloberBalances = await client.multicall({
      contracts: cloberPoolKeys.map(k => ({
        address:      CLOBER_LV.address as Address,
        abi:          CLOBER_BAL_ABI,
        functionName: 'balanceOf' as const,
        // ERC6909: owner, tokenId — tokenId = BigInt(poolKey)
        args:         [wallet, BigInt(CLOBER_POOLS[k].key)] as const,
      })),
      allowFailure: true,
    })

    const cloberActive = cloberPoolKeys
      .map((k, i) => ({ k, p: CLOBER_POOLS[k], lp: cloberBalances[i].status === 'success' ? cloberBalances[i].result as bigint : 0n }))
      .filter(x => x.lp > 0n)

    if (cloberActive.length > 0) {
      const [supResults, liqResults] = await Promise.all([
        client.multicall({
          contracts: cloberActive.map(({ p }) => ({
            address:      CLOBER_LV.address as Address,
            abi:          CLOBER_SUP_ABI,
            functionName: 'totalSupply' as const,
            // ERC6909: tokenId = BigInt(poolKey)
            args:         [BigInt(p.key)] as const,
          })),
          allowFailure: true,
        }),
        client.multicall({
          contracts: cloberActive.map(({ p }) => ({
            address:      CLOBER_LV.address as Address,
            abi:          CLOBER_LIQ_ABI,
            functionName: 'getLiquidity' as const,
            args:         [p.key] as const,
          })),
          allowFailure: true,
        }),
      ])

      const USDC_ADDR = '0x754704bc059f8c67012fed69bc8a327a5aafb603' as Address

      cloberActive.forEach(({ k, p, lp }, i) => {
        const totalLp = supResults[i].status === 'success' ? supResults[i].result as bigint : 0n
        if (totalLp === 0n) return

        const liq = liqResults[i]
        if (liq.status !== 'success') return
        // getLiquidity returns [liquidityA, liquidityB] structs: {reserve, claimable, cancelable}
        const [liqA, liqB] = liq.result as readonly [
          { reserve: bigint; claimable: bigint; cancelable: bigint },
          { reserve: bigint; claimable: bigint; cancelable: bigint },
        ]
        // Total liquidity = reserve + claimable + cancelable (mirrors SDK logic)
        const usdcTotal = liqA.reserve + liqA.claimable + liqA.cancelable
        const wmonTotal = liqB.reserve + liqB.claimable + liqB.cancelable

        const fraction  = Number(lp) / Number(totalLp)
        const usdcUsd   = (Number(usdcTotal) / 10 ** p.tokenADec) * price(USDC_ADDR)
        const wmonUsd   = (Number(wmonTotal) / 1e18) * (priceMap[WMON_ADDR] ?? 0)
        const userUsd   = fraction * (usdcUsd + wmonUsd)

        if (userUsd < 0.01) return
        const userUsdc = (Number(usdcTotal) / 10 ** p.tokenADec) * fraction
        const userWmon = (Number(wmonTotal) / 1e18) * fraction
        positions.push({
          protocol:     'Clober',
          label:        `${p.tokenASym}/MON`,
          tokenSym:     `${p.tokenASym}+MON`,
          amount:       fraction * 100,
          amountUsd:    userUsd,
          poolId:       k,
          positionType: 'Liquidity Pool',
          amounts: [
            { sym: p.tokenASym, amount: userUsdc, usd: userUsdc * price(USDC_ADDR) },
            { sym: 'MON',       amount: userWmon, usd: userWmon * (priceMap[WMON_ADDR] ?? 0) },
          ],
        })
      })
    }
  }

  // ── Uniswap V3 + PancakeSwap V3 NFT positions ────────────────────────────
  // Both NPMs implement ERC721Enumerable: balanceOf → tokenOfOwnerByIndex → positions()
  const V4_PM = UNISWAP_V4_POSITION_MANAGER.address

  const [uniV3Count, cakeV3Count] = await Promise.all([
    client.readContract({ address: UNISWAP_V3_NPM.address, abi: BALANCE_ABI, functionName: 'balanceOf', args: [wallet] }).catch(() => 0n) as Promise<bigint>,
    client.readContract({ address: PANCAKESWAP_V3_NPM.address, abi: BALANCE_ABI, functionName: 'balanceOf', args: [wallet] }).catch(() => 0n) as Promise<bigint>,
  ])

  if (uniV3Count > 0n || cakeV3Count > 0n) {
    // Build list of (npm, protocol, count) entries
    const npmSources: { npm: `0x${string}`; protocol: string; count: number }[] = []
    if (uniV3Count > 0n) npmSources.push({ npm: UNISWAP_V3_NPM.address, protocol: 'Uniswap', count: Number(uniV3Count) })
    if (cakeV3Count > 0n) npmSources.push({ npm: PANCAKESWAP_V3_NPM.address, protocol: 'PancakeSwap', count: Number(cakeV3Count) })

    // Fetch all tokenIds via tokenOfOwnerByIndex
    const indexCalls = npmSources.flatMap(({ npm, count }) =>
      Array.from({ length: count }, (_, i) => ({
        address: npm, abi: V3_TOIDX_ABI,
        functionName: 'tokenOfOwnerByIndex' as const, args: [wallet, BigInt(i)] as const,
      }))
    )
    const indexResults = await client.multicall({ contracts: indexCalls, allowFailure: true })

    type NpmPos = { tokenId: bigint; npm: `0x${string}`; protocol: string }
    const npmPositions: NpmPos[] = []
    let rIdx = 0
    for (const { npm, protocol, count } of npmSources) {
      for (let i = 0; i < count; i++) {
        const r = indexResults[rIdx++]
        if (r.status === 'success') npmPositions.push({ tokenId: r.result as bigint, npm, protocol })
      }
    }

    // Fetch position data for each tokenId
    const posCalls = npmPositions.map(({ tokenId, npm }) => ({
      address: npm, abi: V3_POS_ABI,
      functionName: 'positions' as const, args: [tokenId] as const,
    }))
    const posResults = await client.multicall({ contracts: posCalls, allowFailure: true })

    type ActiveV3Pos = {
      tokenId: bigint
      token0: Address; token1: Address; fee: number
      tickLower: number; tickUpper: number; liquidity: bigint
      fg0Last: bigint; fg1Last: bigint          // feeGrowthInside{0,1}LastX128
      tokensOwed0: bigint; tokensOwed1: bigint  // already-settled fees (lower bound)
      protocol: string
    }
    const activeV3: ActiveV3Pos[] = []
    npmPositions.forEach(({ tokenId, protocol }, i) => {
      const r = posResults[i]
      if (r.status !== 'success') return
      // [0]=nonce [1]=operator [2]=token0 [3]=token1 [4]=fee [5]=tickLower [6]=tickUpper
      // [7]=liquidity [8]=feeGrowthInside0LastX128 [9]=feeGrowthInside1LastX128
      // [10]=tokensOwed0 [11]=tokensOwed1
      const arr = r.result as readonly [bigint, Address, Address, Address, number, number, number, bigint, bigint, bigint, bigint, bigint]
      const [, , token0, token1, fee, tickLower, tickUpper, liquidity, fg0Last, fg1Last, tokensOwed0, tokensOwed1] = arr
      if (liquidity === 0n) return
      activeV3.push({ tokenId, token0, token1, fee, tickLower, tickUpper, liquidity, fg0Last, fg1Last, tokensOwed0, tokensOwed1, protocol })
    })

    if (activeV3.length > 0) {
      // Find unique pool addresses (from our config maps)
      const poolKeyToAddr = new Map<string, `0x${string}`>()
      for (const pos of activeV3) {
        const key = `${pos.token0.toLowerCase()}-${pos.token1.toLowerCase()}-${pos.fee}`
        if (!poolKeyToAddr.has(key)) {
          const meta = UNI_V3_MAP[key] ?? CAKE_V3_MAP[key]
          if (meta) poolKeyToAddr.set(key, meta.address)
        }
      }

      const uniquePools = Array.from(poolKeyToAddr.entries()) // [poolKey, poolAddr]

      // Build tick pairs needed: unique (poolKey, tick) combinations
      const tickPairs: { poolKey: string; addr: `0x${string}`; tick: number }[] = []
      const tickPairKey = (pk: string, tick: number) => `${pk}:${tick}`
      const seenTicks = new Set<string>()
      for (const pos of activeV3) {
        const poolKey = `${pos.token0.toLowerCase()}-${pos.token1.toLowerCase()}-${pos.fee}`
        const addr = poolKeyToAddr.get(poolKey)
        if (!addr) continue
        for (const tick of [pos.tickLower, pos.tickUpper]) {
          const tk = tickPairKey(poolKey, tick)
          if (!seenTicks.has(tk)) { seenTicks.add(tk); tickPairs.push({ poolKey, addr, tick }) }
        }
      }

      // Single parallel multicall: slot0 + feeGrowthGlobal{0,1} + ticks(lower/upper)
      // Layout: uniquePools × [slot0, fg0, fg1]  then  tickPairs × [ticks(tick)]
      const feeDataCalls = [
        ...uniquePools.flatMap(([, addr]) => [
          { address: addr, abi: V3_SLOT0_ABI,    functionName: 'slot0'                 as const },
          { address: addr, abi: FEE_GLOBAL_ABI,  functionName: 'feeGrowthGlobal0X128'  as const },
          { address: addr, abi: FEE_GLOBAL_ABI,  functionName: 'feeGrowthGlobal1X128'  as const },
        ]),
        ...tickPairs.map(({ addr, tick }) => ({
          address: addr, abi: TICKS_ABI, functionName: 'ticks' as const, args: [tick] as const,
        })),
      ]
      const feeDataRes = await client.multicall({ contracts: feeDataCalls, allowFailure: true })

      // Parse slot0Map and feeGlobalMap from first uniquePools.length × 3 results
      const slot0Map    = new Map<string, { sqrtPriceX96: bigint; tick: number }>()
      const feeGlobalMap = new Map<string, { g0: bigint; g1: bigint }>()
      uniquePools.forEach(([key], i) => {
        const base = i * 3
        const s = feeDataRes[base]
        if (s.status === 'success') {
          const [sqrtPriceX96, tick] = s.result as readonly [bigint, number]
          slot0Map.set(key, { sqrtPriceX96, tick: Number(tick) })
        }
        const g0r = feeDataRes[base + 1]
        const g1r = feeDataRes[base + 2]
        feeGlobalMap.set(key, {
          g0: g0r.status === 'success' ? g0r.result as bigint : 0n,
          g1: g1r.status === 'success' ? g1r.result as bigint : 0n,
        })
      })

      // Parse tick data (feeGrowthOutside{0,1}X128 at indices [2] and [3])
      const tickDataMap = new Map<string, { fo0: bigint; fo1: bigint }>()
      tickPairs.forEach(({ poolKey, tick }, i) => {
        const r = feeDataRes[uniquePools.length * 3 + i]
        if (r.status !== 'success') return
        const arr = r.result as unknown as [bigint, bigint, bigint, bigint, ...unknown[]]
        tickDataMap.set(tickPairKey(poolKey, tick), { fo0: arr[2], fo1: arr[3] })
      })

      // Compute USD values + real uncollected fees for each active position
      const Q128 = 2n ** 128n
      for (const pos of activeV3) {
        const poolKey = `${pos.token0.toLowerCase()}-${pos.token1.toLowerCase()}-${pos.fee}`
        const meta    = UNI_V3_MAP[poolKey] ?? CAKE_V3_MAP[poolKey]
        const slot0   = slot0Map.get(poolKey)
        if (!meta || !slot0) continue

        const t0Dec = TOKEN_DEC[pos.token0.toLowerCase()] ?? 18
        const t1Dec = TOKEN_DEC[pos.token1.toLowerCase()] ?? 18
        const t0Usd = price(pos.token0)
        const t1Usd = price(pos.token1)
        if (t0Usd === 0 && t1Usd === 0) continue

        const [raw0, raw1] = v3Amounts(pos.liquidity, slot0.sqrtPriceX96, slot0.tick, pos.tickLower, pos.tickUpper)
        const usd = (Number(raw0) / 10 ** t0Dec) * t0Usd + (Number(raw1) / 10 ** t1Dec) * t1Usd
        if (usd < 0.01) continue

        // Per-token balances
        const amt0 = Number(raw0) / 10 ** t0Dec
        const amt1 = Number(raw1) / 10 ** t1Dec

        // Compute exact uncollected fees via feeGrowthInside formula
        let r0amt = 0, r1amt = 0, rewardUsd = 0
        const fg    = feeGlobalMap.get(poolKey)
        const lower = tickDataMap.get(tickPairKey(poolKey, pos.tickLower))
        const upper = tickDataMap.get(tickPairKey(poolKey, pos.tickUpper))
        if (fg && lower && upper) {
          const [fg0Inside, fg1Inside] = v3FeeGrowthInside(
            slot0.tick, pos.tickLower, pos.tickUpper,
            fg.g0, fg.g1,
            lower.fo0, lower.fo1,
            upper.fo0, upper.fo1,
          )
          // uncollected = Δfg × liquidity / 2^128 + already-settled tokensOwed
          const unc0 = u256Sub(fg0Inside, pos.fg0Last) * pos.liquidity / Q128 + pos.tokensOwed0
          const unc1 = u256Sub(fg1Inside, pos.fg1Last) * pos.liquidity / Q128 + pos.tokensOwed1
          r0amt = Number(unc0) / 10 ** t0Dec
          r1amt = Number(unc1) / 10 ** t1Dec
          rewardUsd = r0amt * t0Usd + r1amt * t1Usd
        }

        const label = `${meta.t0Sym}/${meta.t1Sym}`
        positions.push({
          protocol:     pos.protocol,
          label,
          tokenSym:     label,
          amount:       usd,
          amountUsd:    usd,
          poolId:       meta.poolId,
          positionId:   `#${pos.tokenId}`,
          positionType: 'Liquidity Pool',
          amounts: [
            { sym: meta.t0Sym, amount: amt0, usd: amt0 * t0Usd },
            { sym: meta.t1Sym, amount: amt1, usd: amt1 * t1Usd },
          ],
          rewards: [
            { sym: meta.t0Sym, amount: r0amt, usd: r0amt * t0Usd },
            { sym: meta.t1Sym, amount: r1amt, usd: r1amt * t1Usd },
          ],
          rewardUsd,
        })
      }
    }
  }

  // ── Uniswap V4 NFT positions ─────────────────────────────────────────────────
  // tokenIds saved to localStorage when user deposits V4 via Monatrix.
  // Monad has 70M+ blocks with 999-block getLogs limit → full historical
  // scan is infeasible. Only positions deposited through Monatrix are tracked.
  {
    const savedIds = loadV4TokenIds(wallet).map(BigInt)
    let foundV4Ids: bigint[] = []

    if (savedIds.length > 0) {
      // Verify current ownership (filter out removed/transferred positions)
      const ownerRes = await client.multicall({
        contracts: savedIds.map(id => ({
          address: V4_PM as Address, abi: V4_OWNER_ABI,
          functionName: 'ownerOf' as const, args: [id] as const,
        })),
        allowFailure: true,
      })
      foundV4Ids = savedIds.filter((_, i) => {
        const r = ownerRes[i]
        return r.status === 'success' && (r.result as string).toLowerCase() === wallet.toLowerCase()
      })
    }

    if (foundV4Ids.length > 0) {
      // Fetch pool info + liquidity in parallel
      const [poolPosRes, liqRes] = await Promise.all([
        client.multicall({
          contracts: foundV4Ids.map(id => ({
            address: V4_PM as Address, abi: V4_POOL_POS_ABI,
            functionName: 'getPoolAndPositionInfo' as const, args: [id] as const,
          })),
          allowFailure: true,
        }),
        client.multicall({
          contracts: foundV4Ids.map(id => ({
            address: V4_PM as Address, abi: V4_LIQ_ABI,
            functionName: 'getPositionLiquidity' as const, args: [id] as const,
          })),
          allowFailure: true,
        }),
      ])

      // ── Decode positions + compute poolIds dynamically (no hardcoded pool map) ──
      const NATIVE_ADDR = '0x0000000000000000000000000000000000000000'
      type V4Pos = {
        tokenId: bigint
        c0: Address; c1: Address; fee: number; tickSpacing: number; hooks: Address
        liq: bigint; tickLower: number; tickUpper: number; poolId: `0x${string}`
      }
      const activeV4: V4Pos[] = []
      const uniquePoolIds = new Set<`0x${string}`>()

      foundV4Ids.forEach((id, i) => {
        const pr = poolPosRes[i]
        const lr = liqRes[i]
        if (pr.status !== 'success' || lr.status !== 'success') return
        const liq = lr.result as bigint
        if (liq === 0n) return

        // result = [(c0, c1, fee, tickSpacing, hooks), bytes32 positionInfo]
        const arr = pr.result as readonly [readonly [Address, Address, number, number, Address], `0x${string}`]
        const [[c0, c1, fee, tickSpacing, hooks], infoHex] = arr
        const { tickLower, tickUpper } = decodePositionInfo(BigInt(infoHex))

        // Compute poolId from PoolKey (keccak256 of ABI-encoded struct — matches PoolIdLibrary.toId)
        const poolId = computeV4PoolId(c0, c1, fee, tickSpacing, hooks)
        uniquePoolIds.add(poolId)
        activeV4.push({ tokenId: id, c0, c1, fee, tickSpacing, hooks, liq, tickLower, tickUpper, poolId })
      })

      if (activeV4.length > 0) {
        // Fetch slot0 for each unique pool from StateView
        const poolIdList = Array.from(uniquePoolIds)
        const v4Slot0Res = await client.multicall({
          contracts: poolIdList.map(poolId => ({
            address: UNISWAP_V4_STATE_VIEW.address as Address,
            abi: V4_SLOT0_ABI,
            functionName: 'getSlot0' as const,
            args: [poolId] as const,
          })),
          allowFailure: true,
        })

        const v4Slot0Map = new Map<string, { sqrtPriceX96: bigint; tick: number }>()
        poolIdList.forEach((poolId, i) => {
          const r = v4Slot0Res[i]
          if (r.status !== 'success') return
          const [sqrtPriceX96, tick] = r.result as readonly [bigint, number]
          v4Slot0Map.set(poolId, { sqrtPriceX96, tick: Number(tick) })
        })

        for (const pos of activeV4) {
          const slot0 = v4Slot0Map.get(pos.poolId)
          if (!slot0) continue

          const c0Lower = pos.c0.toLowerCase()
          const c1Lower = pos.c1.toLowerCase()
          const t0Dec   = (c0Lower === NATIVE_ADDR ? TOKEN_DEC[WMON_ADDR] : TOKEN_DEC[c0Lower]) ?? 18
          const t1Dec   = TOKEN_DEC[c1Lower] ?? 18
          const t0Price = c0Lower === NATIVE_ADDR ? (priceMap[WMON_ADDR] ?? 0) : price(pos.c0)
          const t1Price = price(pos.c1)
          if (t0Price === 0 && t1Price === 0) continue

          const [raw0, raw1] = v3Amounts(pos.liq, slot0.sqrtPriceX96, slot0.tick, pos.tickLower, pos.tickUpper)
          const amt0 = Number(raw0) / 10 ** t0Dec
          const amt1 = Number(raw1) / 10 ** t1Dec
          const usd  = amt0 * t0Price + amt1 * t1Price
          if (usd < 0.01) continue

          const c0Sym = ADDR_TO_SYM[c0Lower] ?? (c0Lower === NATIVE_ADDR ? 'MON' : pos.c0.slice(0, 6))
          const c1Sym = ADDR_TO_SYM[c1Lower] ?? pos.c1.slice(0, 6)
          const label = `${c0Sym}/${c1Sym}`

          // Link to monatrix pool page if tracked, else fallback
          const monatrixKey = V4_BYTES32_TO_KEY[pos.poolId.toLowerCase()] ?? `uniswap-v4-${c0Sym.toLowerCase()}-${c1Sym.toLowerCase()}`

          positions.push({
            protocol:     'Uniswap',
            label,
            tokenSym:     label,
            amount:       usd,
            amountUsd:    usd,
            poolId:       monatrixKey,
            positionId:   `#${pos.tokenId}`,
            positionType: 'Liquidity Pool',
            amounts: [
              { sym: c0Sym, amount: amt0, usd: amt0 * t0Price },
              { sym: c1Sym, amount: amt1, usd: amt1 * t1Price },
            ],
          })
        }
      }
    }
  }

  // ── Uniswap V2 LP positions ────────────────────────────────────────────────
  const v2Keys = Object.keys(UNISWAP_V2_POOLS)
  if (v2Keys.length > 0) {
    const v2Batch = await client.multicall({
      contracts: v2Keys.flatMap(k => [
        { address: UNISWAP_V2_POOLS[k].address as Address, abi: BALANCE_ABI,         functionName: 'balanceOf'   as const, args: [wallet] as const },
        { address: UNISWAP_V2_POOLS[k].address as Address, abi: TOTAL_SUP_ABI,       functionName: 'totalSupply' as const },
        { address: UNISWAP_V2_POOLS[k].address as Address, abi: UNISWAP_V2_PAIR_ABI, functionName: 'getReserves' as const },
      ]),
      allowFailure: true,
    })

    v2Keys.forEach((k, i) => {
      const p      = UNISWAP_V2_POOLS[k]
      const base   = i * 3
      const userLp  = v2Batch[base + 0].status === 'success' ? v2Batch[base + 0].result as bigint : 0n
      const totalLp = v2Batch[base + 1].status === 'success' ? v2Batch[base + 1].result as bigint : 0n
      const resR    = v2Batch[base + 2]
      if (userLp === 0n || totalLp === 0n || resR.status !== 'success') return

      const [r0, r1] = resR.result as [bigint, bigint, number]
      const fraction  = Number(userLp) / Number(totalLp)
      const user0     = (Number(r0) / 10 ** p.token0Dec) * fraction
      const user1     = (Number(r1) / 10 ** p.token1Dec) * fraction
      const t0Usd     = price(p.token0 as Address)
      const t1Usd     = price(p.token1 as Address)
      const userUsd   = user0 * t0Usd + user1 * t1Usd
      if (userUsd < 0.01) return

      positions.push({
        protocol:     'Uniswap',
        label:        `${p.token0Sym}/${p.token1Sym}`,
        tokenSym:     `${p.token0Sym}+${p.token1Sym}`,
        amount:       fraction * 100,
        amountUsd:    userUsd,
        poolId:       k,
        positionType: 'Liquidity Pool',
        amounts: [
          { sym: p.token0Sym, amount: user0, usd: user0 * t0Usd },
          { sym: p.token1Sym, amount: user1, usd: user1 * t1Usd },
        ],
      })
    })
  }

  // ── Debt positions (Neverland variable debt + Curvance borrow) ───────────────
  // amountUsd is NEGATIVE so net portfolio value = assets − liabilities
  {
    const curvanceBorrowKeys = Object.keys(CURVANCE_BORROW_MARKETS)
    const [nevDebtRes, curvDebtRes] = await Promise.all([
      // Neverland: variableDebtToken.balanceOf(wallet) for each reserve
      client.multicall({
        contracts: NEVERLAND_ASSETS.map((_, i) => ({
          address: debtTokens[i] ?? FALLBACK_ADDR, abi: BALANCE_ABI,
          functionName: 'balanceOf' as const, args: [wallet] as const,
        })),
        allowFailure: true,
      }),
      // Curvance: loanCToken.borrowBalanceStored(wallet) for each borrow market
      client.multicall({
        contracts: curvanceBorrowKeys.map(k => ({
          address: CURVANCE_BORROW_MARKETS[k].loanCToken, abi: BORROW_BAL_ABI,
          functionName: 'borrowBalanceStored' as const, args: [wallet] as const,
        })),
        allowFailure: true,
      }),
    ])

    // Neverland debt
    NEVERLAND_ASSETS.forEach((a, i) => {
      if (!debtTokens[i]) return
      const r = nevDebtRes[i]
      if (r.status !== 'success') return
      const raw = r.result as bigint
      if (raw === 0n) return
      const amt = Number(raw) / 10 ** a.dec
      const usd = amt * price(a.address)
      if (usd < 0.01) return
      positions.push({
        protocol:     'Neverland',
        label:        `Borrowed ${a.sym}`,
        tokenSym:     a.sym,
        amount:       -amt,
        amountUsd:    -usd,
        poolId:       a.poolId.replace('lending', 'borrowing'),
        positionType: 'Borrowing',
      })
    })

    // Curvance debt — map loanSym → known token address for price lookup
    const LOAN_ADDR: Record<string, Address> = {
      'AUSD': '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
      'WETH': '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242',
      'WMON': '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
      'USDC': '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    }
    curvanceBorrowKeys.forEach((k, i) => {
      const m = CURVANCE_BORROW_MARKETS[k]
      const r = curvDebtRes[i]
      if (r.status !== 'success') return
      const raw = r.result as bigint
      if (raw === 0n) return
      const amt = Number(raw) / 10 ** m.loanDec
      const loanAddr = LOAN_ADDR[m.loanSym]
      const usd = amt * (loanAddr ? price(loanAddr) : 0)
      if (usd < 0.01) return
      positions.push({
        protocol:     'Curvance',
        label:        `Borrowed ${m.loanSym}`,
        tokenSym:     m.loanSym,
        amount:       -amt,
        amountUsd:    -usd,
        poolId:       k,
        positionType: 'Borrowing',
      })
    })
  }

  return positions.sort((a, b) => b.amountUsd - a.amountUsd)
}
