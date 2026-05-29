// Protocol contract addresses and ABIs — hardcoded, never from DB
// Security: immutable on-chain facts; fetching from DB would be an attack vector

// ── Liquid Staking ────────────────────────────────────────────────────────────

// Fastlane shMON — ERC4626-like vault, accepts native MON directly
// asset() = 0xEeee...eeeE (native sentinel) → no approve needed, just send MON
// Unstake options:
//   Traditional: requestUnstake(shares) → wait ~22-27h → completeUnstake()  (no fee)
//   Atomic/Pool: redeem(shares, receiver, owner) → instant, dynamic fee from AtomicUnstakePool
export const FASTLANE = {
  address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as `0x${string}`,
  abi: [
    {
      name: 'deposit',
      type: 'function',
      stateMutability: 'payable',
      inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    // Atomic/instant unstake (burns shMON, deducts pool fee, sends MON immediately)
    {
      name: 'redeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    // Traditional unstake step 1: enter queue, returns completion epoch
    {
      name: 'requestUnstake',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: 'completionEpoch', type: 'uint64' }],
    },
    // Traditional unstake step 2: claim MON after epoch passes
    {
      name: 'completeUnstake',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [],
      outputs: [],
    },
    // Read pending traditional unstake for an address
    {
      name: 'getUnstakeRequest',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'amountMon', type: 'uint128' }, { name: 'completionEpoch', type: 'uint64' }],
    },
    // Preview MON out for traditional unstake (no fee)
    {
      name: 'previewUnstake',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    // Preview MON out for atomic/pool unstake (after fee deduction)
    {
      name: 'previewRedeem',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    // Current marginal fee rate for atomic unstake (RAY = 1e27)
    {
      name: 'getCurrentUnstakeFeeRateRay',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'convertToShares',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const,
}

// Kintsu sMON — NOT ERC4626, custom deposit/unstake
// deposit(minShares, receiver) payable — msg.value = MON amount
// Unstake (2-step):
//   1. requestUnlock(uint96 shares, uint96 minSpotValue) — adds to batch; spotValue=0 until batch submitted
//   2. redeem(uint256 unlockIndex, address receiver) — after batch submitted + COOLDOWN_PERIOD
// Multiple concurrent unlock requests allowed per user (most users have 1, unlockIndex=0)
// getAllUserUnlockRequests(user) → UnlockRequest[] — check spotValue: 0=awaiting batch, >0=claimable
// convertToAssets(shares) → does NOT apply exit fee
export const KINTSU = {
  address: '0xA3227C5969757783154C60bF0bC1944180ed81B9' as `0x${string}`,
  abi: [
    {
      name: 'deposit',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: 'minShares', type: 'uint96' },
        { name: 'receiver',  type: 'address' },
      ],
      outputs: [{ name: 'shares', type: 'uint96' }],
    },
    {
      // Step 1 of unstake — locks sMON in escrow, adds to current batch
      // minSpotValue = 0 for no slippage protection
      name: 'requestUnlock',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'shares',        type: 'uint96' },
        { name: 'minSpotValue',  type: 'uint96' },
      ],
      outputs: [{ name: 'spotValue', type: 'uint96' }],
    },
    {
      // Step 2 of unstake — call after batch submitted + COOLDOWN_PERIOD
      // unlockIndex = position in user's unlock request array (0 for most users)
      name: 'redeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'unlockIndex', type: 'uint256' },
        { name: 'receiver',    type: 'address' },
      ],
      outputs: [{ name: 'assets', type: 'uint96' }],
    },
    {
      // Cancel a pending unlock request (only if batch not yet submitted, spotValue==0)
      name: 'cancelUnlockRequest',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'unlockIndex', type: 'uint256' }],
      outputs: [],
    },
    {
      // Returns all pending unlock requests for a user
      // UnlockRequest { shares uint96, spotValue uint96, batchId uint40, exitFeeInBips uint16 }
      // spotValue == 0 → batch not submitted (awaiting), spotValue > 0 → submitted (claimable after cooldown)
      name: 'getAllUserUnlockRequests',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'user', type: 'address' }],
      outputs: [{
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'shares',         type: 'uint96'  },
          { name: 'spotValue',      type: 'uint96'  },
          { name: 'batchId',        type: 'uint40'  },
          { name: 'exitFeeInBips',  type: 'uint16'  },
        ],
      }],
    },
    {
      // Convert sMON shares → MON (does NOT apply exit fee)
      name: 'convertToAssets',
      type: 'function',
      stateMutability: 'view',
      inputs:  [{ name: 'shares', type: 'uint96' }],
      outputs: [{ name: 'assets', type: 'uint96' }],
    },
    {
      name: 'totalPooled',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint96' }],
    },
    {
      name: 'totalSupply',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const,
}

// Magma gMON — ERC4626 vault, ERC1967 proxy (impl: 0xa1f511e1...78497afd2)
// depositMON(address receiver, uint256 referralId) payable — native MON, no approve needed
// Unstake: ERC7540 async — requestRedeem(shares,controller,owner) → wait → redeem(assets,receiver,controller)
// requestId = 0 for single-controller vaults; pendingRedeemRequest/claimableRedeemRequest to check state
export const MAGMA = {
  address: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' as `0x${string}`,
  abi: [
    {
      name: 'depositMON',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: 'receiver',   type: 'address' },
        { name: 'referralId', type: 'uint256' },
      ],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'requestRedeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'shares',     type: 'uint256' },
        { name: 'controller', type: 'address' },
        { name: 'owner',      type: 'address' },
      ],
      outputs: [{ name: 'requestId', type: 'uint256' }],
    },
    {
      // ERC7540 redeem — receive WMON (requestId is owner's active request)
      name: 'redeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'requestId',  type: 'uint256' },
        { name: 'controller', type: 'address' },
        { name: 'receiver',   type: 'address' },
      ],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      // redeemMON — same as redeem but unwraps to native MON
      name: 'redeemMON',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'requestId',  type: 'uint256' },
        { name: 'controller', type: 'address' },
        { name: 'receiver',   type: 'address' },
      ],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      name: 'ownerRequestId',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: '_owner', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    },
    {
      name: 'convertToAssets',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ type: 'uint256' }],
    },
    {
      name: 'pendingRedeemRequest',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'requestId',  type: 'uint256' },
        { name: 'controller', type: 'address' },
      ],
      outputs: [{ name: 'pendingShares', type: 'uint256' }],
    },
    {
      name: 'claimableRedeemRequest',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'requestId',  type: 'uint256' },
        { name: 'controller', type: 'address' },
      ],
      outputs: [{ name: 'claimableShares', type: 'uint256' }],
    },
    {
      name: 'convertToShares',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const,
}

// Apriori aprMON — ERC4626-like vault, accepts native MON directly
// deposit(uint256 assets, address receiver) payable — same interface as Fastlane
// Unstake traditional: requestRedeem(shares,controller,owner) → wait 12-18h → redeem([requestIds], receiver)
// requestIds tracked on-chain via getUserRequestData(addr, 0, pageSize)
// Unstake instant: via Apriori swap router 0x4F02... (ABI TBD)
export const APRIORI = {
  address: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852' as `0x${string}`,
  abi: [
    {
      name: 'deposit',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: 'assets',   type: 'uint256' },
        { name: 'receiver', type: 'address' },
      ],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'requestRedeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'shares',     type: 'uint256' },
        { name: 'controller', type: 'address' },
        { name: 'owner',      type: 'address' },
      ],
      outputs: [{ name: 'requestId', type: 'uint256' }],
    },
    // Claim completed requests — pass array of requestIds from getUserRequestData
    {
      name: 'redeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'requestIDs', type: 'uint256[]' },
        { name: 'receiver',   type: 'address' },
      ],
      outputs: [],
    },
    // Paginated on-chain request history for a user
    {
      name: 'getUserRequestData',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'user',       type: 'address' },
        { name: 'startIndex', type: 'uint256' },
        { name: 'pageSize',   type: 'uint256' },
      ],
      outputs: [{
        name: 'requestData',
        type: 'tuple[]',
        components: [
          { name: 'id',          type: 'uint256' },
          { name: 'claimed',     type: 'bool'    },
          { name: 'claimable',   type: 'bool'    },
          { name: 'shares',      type: 'uint256' },
          { name: 'assets',      type: 'uint256' },
          { name: 'timestamp',   type: 'uint256' },
          { name: 'unlockEpoch', type: 'uint64'  },
        ],
      }],
    },
    // Convert aprMON shares → MON (for rate display)
    {
      name: 'convertToAssets',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      name: 'pendingRedeemRequest',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'requestId',  type: 'uint256' },
        { name: 'controller', type: 'address' },
      ],
      outputs: [{ name: 'pendingShares', type: 'uint256' }],
    },
    {
      name: 'claimableRedeemRequest',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'requestId',  type: 'uint256' },
        { name: 'controller', type: 'address' },
      ],
      outputs: [{ name: 'claimableShares', type: 'uint256' }],
    },
    {
      name: 'convertToShares',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const,
}

// ── Shared ABIs ───────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const ERC4626_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'redeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ── Morpho Vaults ─────────────────────────────────────────────────────────────
// ERC4626 vaults — deposit: approve asset → deposit(amount, receiver)
//                — withdraw: redeem(shares, receiver, owner) — no approve needed
// 13 active vaults from app.morpho.org/monad (May 2026, post-redeploy)

export const MORPHO_VAULTS: Record<string, {
  vault:    `0x${string}`
  asset:    `0x${string}`
  decimals: number
}> = {
  'morpho-beef04b0': { vault: '0xbeef04b01e0275D4ac2e2986256BB14E3Ff6ef42', asset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18 }, // WETH  — Steakhouse Prime ETH
  'morpho-78999cc9': { vault: '0x78999cc96d2Ba0341588C60CcB0E91c6C33CF371', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC  — Hyperithm USDC Apex
  'morpho-32841a85': { vault: '0x32841A8511D5c2c5b253f45668780B99139e476D', asset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6  }, // AUSD  — Grove x Steakhouse AUSD
  'morpho-e09a9378': { vault: '0xe09A93786275546690247d70f1767cF0b69e8Ea0', asset: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', decimals: 8  }, // cbBTC — Hyperithm cbBTC Apex
  'morpho-80017bf0': { vault: '0x80017bF0f793EBbE9679Cd61ff0e395B62CAbB59', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC  — August USDC V2
  'morpho-beeff300': { vault: '0xbeeff300E9A9caeC7beEA740ab8758D33b777509', asset: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6  }, // USDT0 — Steakhouse High Yield USDT0
  'morpho-beeff421': { vault: '0xbeeff421948cDE29644a63FBA4ef5e5a621075d0', asset: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', decimals: 8  }, // cbBTC — Steakhouse High Yield cbBTC
  'morpho-beeffb65': { vault: '0xBeEFfB65df79Baac701307c9605b7aB207355Fdb', asset: '0x111111d2bf19e43C34263401e0CAd979eD1cdb61', decimals: 6  }, // USD1  — Steakhouse High Yield USD1
  'morpho-beeff443': { vault: '0xbeEFf443C3CbA3E369DA795002243BeaC311aB83', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC  — Steakhouse High Yield USDC
  'morpho-beeffea7': { vault: '0xbeeffeA75cFC4128ebe10C8D7aE22016D215060D', asset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6  }, // AUSD  — Steakhouse High Yield AUSD
  'morpho-0ed3615f': { vault: '0x0ED3615ff949C8A34D15441970900E849A3409FC', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC  — Unified Labs USDC RWA
  'morpho-ecef08a3': { vault: '0xEceF08A3cD83054e8FF6D8Cb9cE41a36b81E8d7E', asset: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', decimals: 8  }, // cbBTC — UltraYield cbBTC
  'morpho-beeff96d': { vault: '0xbeeff96D65Cb80a0029dc9D3C4d7306c3C3A6253', asset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18 }, // WETH  — Steakhouse High Yield ETH
}

// ── Neverland (Aave V3 fork) ──────────────────────────────────────────────────
// Pool address discovered via aUSDC.POOL() = 0x80f006...
// PriceOracle: getAssetPrice(asset) → USD price with 8 decimals
export const NEVERLAND_ORACLE = {
  address: '0x94bba11004b9877d13bb5e1ae29319b6f7bdedd4' as `0x${string}`,
  abi: [{
    name: 'getAssetPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  }] as const,
}
// supply(asset, amount, onBehalfOf, referralCode) — ERC20 approve first
// borrow(asset, amount, interestRateMode=2, referralCode=0, onBehalfOf) — no approve
// withdraw(asset, amount, to) — no approve; maxUint256 = withdraw all
// repay(asset, amount, interestRateMode=2, onBehalfOf) — ERC20 approve first; maxUint256 = repay all variable debt
// getUserAccountData(user) — returns collateral/debt/availableBorrows/healthFactor
export const NEVERLAND = {
  pool: '0x80f00661b13cc5f6ccd3885be7b4c9c67545d585' as `0x${string}`,
  abi: [
    {
      name: 'supply',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'asset',        type: 'address' },
        { name: 'amount',       type: 'uint256' },
        { name: 'onBehalfOf',   type: 'address' },
        { name: 'referralCode', type: 'uint16'  },
      ],
      outputs: [],
    },
    {
      name: 'withdraw',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'asset',  type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'to',     type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'borrow',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'asset',            type: 'address' },
        { name: 'amount',           type: 'uint256' },
        { name: 'interestRateMode', type: 'uint256' },
        { name: 'referralCode',     type: 'uint16'  },
        { name: 'onBehalfOf',       type: 'address' },
      ],
      outputs: [],
    },
    {
      name: 'repay',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'asset',            type: 'address' },
        { name: 'amount',           type: 'uint256' },
        { name: 'interestRateMode', type: 'uint256' },
        { name: 'onBehalfOf',       type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'getUserAccountData',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'user', type: 'address' }],
      outputs: [
        { name: 'totalCollateralBase',         type: 'uint256' },
        { name: 'totalDebtBase',               type: 'uint256' },
        { name: 'availableBorrowsBase',        type: 'uint256' },
        { name: 'currentLiquidationThreshold', type: 'uint256' },
        { name: 'ltv',                         type: 'uint256' },
        { name: 'healthFactor',                type: 'uint256' },
      ],
    },
  ] as const,
}

// asset address + decimals per pool ID — lending and borrowing use same underlying
export const NEVERLAND_RESERVES: Record<string, { asset: `0x${string}`; decimals: number }> = {
  'neverland-lending-usdc':     { asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  },
  'neverland-lending-wmon':     { asset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18 },
  'neverland-lending-usdt0':    { asset: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6  },
  'neverland-lending-wbtc':     { asset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8  },
  'neverland-lending-weth':     { asset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18 },
  'neverland-lending-ausd':     { asset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6  },
  'neverland-lending-smon':     { asset: '0xA3227C5969757783154C60bF0bC1944180ed81B9', decimals: 18 },
  'neverland-lending-shmon':    { asset: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', decimals: 18 },
  'neverland-lending-gmon':     { asset: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', decimals: 18 },
  'neverland-lending-earnausd': { asset: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', decimals: 6  },
  'neverland-lending-loaznd':   { asset: '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90', decimals: 18 },
}

// 6 borrowable assets in Neverland (same underlying as lending side)
export const NEVERLAND_BORROW_RESERVES: Record<string, { asset: `0x${string}`; decimals: number }> = {
  'neverland-borrowing-usdc':  { asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  },
  'neverland-borrowing-wmon':  { asset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18 },
  'neverland-borrowing-usdt0': { asset: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6  },
  'neverland-borrowing-wbtc':  { asset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8  },
  'neverland-borrowing-weth':  { asset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18 },
  'neverland-borrowing-ausd':  { asset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6  },
}

// PoolDataProvider: getUserReserveData(asset, user) → aToken balance + variable debt
//                  getReserveConfigurationData(asset) → ltv (BPS, [1])
export const NEVERLAND_DATA_PROVIDER = {
  address: '0xfd0b6b6f736376f7b99ee989c749007c7757fdba' as `0x${string}`,
  abi: [
    {
      name: 'getUserReserveData',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'asset', type: 'address' }, { name: 'user', type: 'address' }],
      outputs: [
        { name: 'currentATokenBalance',   type: 'uint256' }, // [0] deposited amount
        { name: 'currentStableDebt',      type: 'uint256' }, // [1]
        { name: 'currentVariableDebt',    type: 'uint256' }, // [2] borrowed amount
        { name: 'principalStableDebt',    type: 'uint256' },
        { name: 'scaledVariableDebt',     type: 'uint256' },
        { name: 'stableBorrowRate',       type: 'uint256' },
        { name: 'liquidityRate',          type: 'uint256' },
        { name: 'stableRateLastUpdated',  type: 'uint40'  },
        { name: 'usageAsCollateralEnabled', type: 'bool'  },
      ],
    },
    {
      name: 'getReserveConfigurationData',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'asset', type: 'address' }],
      outputs: [
        { name: 'decimals',                type: 'uint256' }, // [0]
        { name: 'ltv',                     type: 'uint256' }, // [1] BPS (e.g. 7500 = 75%)
        { name: 'liquidationThreshold',    type: 'uint256' },
        { name: 'liquidationBonus',        type: 'uint256' },
        { name: 'reserveFactor',           type: 'uint256' },
        { name: 'usageAsCollateralEnabled', type: 'bool'   },
        { name: 'borrowingEnabled',        type: 'bool'    },
        { name: 'stableBorrowRateEnabled', type: 'bool'    },
        { name: 'isActive',                type: 'bool'    },
        { name: 'isFrozen',                type: 'bool'    },
      ],
    },
    {
      name: 'getReserveTokensAddresses',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'asset', type: 'address' }],
      outputs: [
        { name: 'aTokenAddress',            type: 'address' },
        { name: 'stableDebtTokenAddress',   type: 'address' },
        { name: 'variableDebtTokenAddress', type: 'address' },
      ],
    },
  ] as const,
}

// Aave V3 RewardsController — Neverland DUST incentive rewards
// getUserRewards: read pending claimable DUST for aTokens[]
// claimRewards:   claim DUST; pass maxUint256 to claim all
export const NEVERLAND_DUST_REWARDS = {
  address: '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec' as `0x${string}`,
  abi: [
    {
      name: 'getUserRewards',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'assets', type: 'address[]' },
        { name: 'user',   type: 'address'   },
        { name: 'reward', type: 'address'   },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'claimRewards',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'assets', type: 'address[]' },
        { name: 'amount', type: 'uint256'   },
        { name: 'to',     type: 'address'   },
        { name: 'reward', type: 'address'   },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const,
}

// ── Curvance Markets ──────────────────────────────────────────────────────────
// Deposit = supply COLLATERAL (what Curvance's "Collateral" column shows).
// For some bidirectional markets, Curvance's "Collateral" is actually the adapter's
// "loan" side — those are marked with correct addresses below.
// Addresses from Reader.getDynamicMarketData() + on-chain asset() calls (Apr 2026)
export const CURVANCE_MARKETS: Record<string, {
  colCToken:    `0x${string}`   // cToken to deposit collateral into
  colAsset:     `0x${string}`   // underlying ERC20 to approve
  colDec:       number
  colSym:       string          // display name (matches Curvance UI "Collateral" column)
  oppColCToken?: `0x${string}`  // bidirectional markets only: opposite side's cToken
  oppColSym?:   string          // bidirectional markets only: opposite side's symbol
}> = {
  'curvance-mubond-ausd':   { colCToken: '0x92EE4b4d33Dc61bd93a88601F29131B08aCedBF1', colAsset: '0x336D414754967C6682B5A665C7DAF6F1409E63e8', colDec: 18, colSym: 'muBOND'   },
  'curvance-loaznd-ausd':   { colCToken: '0xf7a6AB4aF86966C141D3C5633DF658E5CDb0a735', colAsset: '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90', colDec: 18, colSym: 'loAZND'   },
  'curvance-ezeth-weth':    { colCToken: '0x20f1A13BfbF85a22Aa59D189861790981372220b', colAsset: '0x2416092f143378750bb29b79eD961ab195CcEea5', colDec: 18, colSym: 'ezETH'    },
  'curvance-shmon-wmon':    { colCToken: '0x926C101Cf0a3dE8725Eb24a93E980f9FE34d6230', colAsset: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', colDec: 18, colSym: 'shMON'    },
  'curvance-aprmon-wmon':   { colCToken: '0xD9E2025b907E95EcC963A5018f56B87575B4aB26', colAsset: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852', colDec: 18, colSym: 'aprMON'   },
  'curvance-smon-wmon':     { colCToken: '0x494876051B0E85dCe5ecd5822B1aD39b9660c928', colAsset: '0xA3227C5969757783154C60bF0bC1944180ed81B9', colDec: 18, colSym: 'sMON'     },
  'curvance-sausd-ausd':    { colCToken: '0x84C5aF20b58818631164Bb7d798E457fcFACD9Ac', colAsset: '0xD793c04B87386A6bb84ee61D98e0065FdE7fdA5E', colDec: 6,  colSym: 'sAUSD'    },
  'curvance-earnausd-ausd': { colCToken: '0x852FF1EC21D63b405eC431e04AE3AC760e29263D', colAsset: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', colDec: 6,  colSym: 'earnAUSD' },
  'curvance-gmon-wmon':     { colCToken: '0x5ca6966543c0786f547446234492D2F11C82f11f', colAsset: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', colDec: 18, colSym: 'gMON'     },
  'curvance-syzusd-ausd':   { colCToken: '0x7EdA3cb060Ff7B650eB227971dbfEBD3513b11D5', colAsset: '0x484be0540aD49f351eaa04eeB35dF0f937D4E73f', colDec: 18, colSym: 'syzUSD'   },
  'curvance-wsrusd-ausd':   { colCToken: '0x251B67Ae7e90fDc6a7B080Ee601913A8B2746A28', colAsset: '0x4809010926aec940b550D34a46A52739f996D75D', colDec: 18, colSym: 'wsrUSD'   },
  'curvance-yzm-ausd':      { colCToken: '0x8626B8f4F64CAeee9549Af8ebbFA591A7425e5ba', colAsset: '0x3a2c4aAae6776dC1c31316De559598f2f952E2cB', colDec: 6,  colSym: 'YZM'      },
  'curvance-vusd-ausd':     { colCToken: '0x42369AFe4bA4225b800b8024Acc5F14f42A3836C', colAsset: '0x8d3F9f9Eb2f5E8B48EFBB4074440D1E2A34Bc365', colDec: 6,  colSym: 'vUSD'     },
  'curvance-savusd-usdc':   { colCToken: '0x3afB9A1cC0d2b0D62502B84B070601fF0DC84363', colAsset: '0x9648dB94F1e6B19e7D755585542981F97dc806c6', colDec: 18, colSym: 'savUSD'   },
  // Bidirectional markets — each has an oppColCToken for the reverse-direction deposit check
  'curvance-ebtc-wbtc': { colCToken: '0xdB3e888c3b50771821226d30Ab6eC14eB5ba85bA', colAsset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', colDec: 8,  colSym: 'WBTC', oppColCToken: '0x2840772E14fFbe337aB966727B7D1Dd09BDc76E4', oppColSym: 'eBTC'  },
  'curvance-wmon-ausd': { colCToken: '0x6E182EB501800C555bd5E662E6D350D627F504D8', colAsset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', colDec: 6,  colSym: 'AUSD', oppColCToken: '0xE01d426B589c7834a5F6B20D7e992A705d3c22ED', oppColSym: 'WMON'  },
  'curvance-wmon-usdc': { colCToken: '0x8EE9FC28B8Da872c38A496e9dDB9700bb7261774', colAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', colDec: 6,  colSym: 'USDC', oppColCToken: '0x1e240E30E51491546deC3aF16B0b4EAC8Dd110D4', oppColSym: 'WMON'  },
  'curvance-wbtc-usdc': { colCToken: '0x7C9d4f1695C6282Da5e5509Aa51fC9fb417C6f1d', colAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', colDec: 6,  colSym: 'USDC', oppColCToken: '0x3D2Ff9F862D89Ba526a0fC166bD56ABe04EF28d5', oppColSym: 'WBTC'  },
  'curvance-weth-usdc': { colCToken: '0x21aDBb60a5fB909e7F1fB48aACC4569615CD97b5', colAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', colDec: 6,  colSym: 'USDC', oppColCToken: '0x8Af00fbbb2601A8F7636EabbF6243B30BEA47D50', oppColSym: 'WETH'  },

  // Reverse-direction entries for each bidirectional pair (deposit the "col" token)
  'curvance-wbtc-ebtc': { colCToken: '0x2840772E14fFbe337aB966727B7D1Dd09BDc76E4', colAsset: '0xd691b0aFed67F96CEC28Ab6308Cbe5b2C103b7e9', colDec: 10, colSym: 'eBTC', oppColCToken: '0xdB3e888c3b50771821226d30Ab6eC14eB5ba85bA', oppColSym: 'WBTC'  },
  'curvance-ausd-wmon': { colCToken: '0xE01d426B589c7834a5F6B20D7e992A705d3c22ED', colAsset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', colDec: 18, colSym: 'WMON', oppColCToken: '0x6E182EB501800C555bd5E662E6D350D627F504D8', oppColSym: 'AUSD'  },
  'curvance-usdc-wmon': { colCToken: '0x1e240E30E51491546deC3aF16B0b4EAC8Dd110D4', colAsset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', colDec: 18, colSym: 'WMON', oppColCToken: '0x8EE9FC28B8Da872c38A496e9dDB9700bb7261774', oppColSym: 'USDC'  },
  'curvance-usdc-wbtc': { colCToken: '0x3D2Ff9F862D89Ba526a0fC166bD56ABe04EF28d5', colAsset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', colDec: 8,  colSym: 'WBTC', oppColCToken: '0x7C9d4f1695C6282Da5e5509Aa51fC9fb417C6f1d', oppColSym: 'USDC'  },
  'curvance-usdc-weth': { colCToken: '0x8Af00fbbb2601A8F7636EabbF6243B30BEA47D50', colAsset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', colDec: 18, colSym: 'WETH', oppColCToken: '0x21aDBb60a5fB909e7F1fB48aACC4569615CD97b5', oppColSym: 'USDC'  },
}

// ── Curvance Borrow Markets ────────────────────────────────────────────────────
// For each borrow pool: which collateral to deposit, which loan cToken to call borrow() on.
// Addresses from Reader.getDynamicMarketData() on-chain fetch (Apr 2026).
// borrow(uint256 borrowAmount) on loanCToken — Compound V2 style, no approve needed.
export const CURVANCE_BORROW_ABI = [
  {
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'borrowAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'debtBalance',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'repay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'assets', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'asset',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export const CURVANCE_BORROW_MARKETS: Record<string, {
  colCToken:  `0x${string}`   // cToken to deposit collateral into
  colAsset:   `0x${string}`   // underlying ERC20 to approve
  colDec:     number
  colSym:     string
  loanCToken: `0x${string}`   // cToken to call borrow() on
  loanDec:    number
  loanSym:    string
}> = {
  'curvance-mubond-ausd-borrow':   { colCToken: '0x92EE4b4d33Dc61bd93a88601F29131B08aCedBF1', colAsset: '0x336D414754967C6682B5A665C7DAF6F1409E63e8', colDec: 18, colSym: 'muBOND',   loanCToken: '0x2B4e0232F46E6DB4af35474c140B968EeFCB09Ec', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-loaznd-ausd-borrow':   { colCToken: '0xf7a6AB4aF86966C141D3C5633DF658E5CDb0a735', colAsset: '0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90', colDec: 18, colSym: 'loAZND',   loanCToken: '0xDaDbB2D8f9802DC458F5D7F133D053087Ba8983d', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-ezeth-weth-borrow':    { colCToken: '0x20f1A13BfbF85a22Aa59D189861790981372220b', colAsset: '0x2416092f143378750bb29b79eD961ab195CcEea5', colDec: 18, colSym: 'ezETH',    loanCToken: '0xa206D51C02c0202a2Eed8E6A757b49Ab13930227', loanDec: 18, loanSym: 'WETH' },
  'curvance-shmon-wmon-borrow':    { colCToken: '0x926C101Cf0a3dE8725Eb24a93E980f9FE34d6230', colAsset: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', colDec: 18, colSym: 'shMON',    loanCToken: '0x0fcEd51b526BfA5619F83d97b54a57e3327eB183', loanDec: 18, loanSym: 'WMON' },
  'curvance-aprmon-wmon-borrow':   { colCToken: '0xD9E2025b907E95EcC963A5018f56B87575B4aB26', colAsset: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852', colDec: 18, colSym: 'aprMON',   loanCToken: '0xF32B334042DC1EB9732454cc9bc1a06205d184f2', loanDec: 18, loanSym: 'WMON' },
  'curvance-smon-wmon-borrow':     { colCToken: '0x494876051B0E85dCe5ecd5822B1aD39b9660c928', colAsset: '0xA3227C5969757783154C60bF0bC1944180ed81B9', colDec: 18, colSym: 'sMON',     loanCToken: '0xebE45A6ceA7760a71D8e0fa5a0AE80a75320D708', loanDec: 18, loanSym: 'WMON' },
  'curvance-sausd-ausd-borrow':    { colCToken: '0x84C5aF20b58818631164Bb7d798E457fcFACD9Ac', colAsset: '0xD793c04B87386A6bb84ee61D98e0065FdE7fdA5E', colDec: 6,  colSym: 'sAUSD',    loanCToken: '0xfD493ce1A0ae986e09d17004B7E748817a47d73c', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-earnausd-ausd-borrow': { colCToken: '0x852FF1EC21D63b405eC431e04AE3AC760e29263D', colAsset: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', colDec: 6,  colSym: 'earnAUSD', loanCToken: '0xAd4AA2a713fB86FBb6b60dE2aF9E32a11DB6Abf2', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-wmon-ausd-borrow':     { colCToken: '0xE01d426B589c7834a5F6B20D7e992A705d3c22ED', colAsset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', colDec: 18, colSym: 'WMON',     loanCToken: '0x6E182EB501800C555bd5E662E6D350D627F504D8', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-wmon-usdc-borrow':     { colCToken: '0x1e240E30E51491546deC3aF16B0b4EAC8Dd110D4', colAsset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', colDec: 18, colSym: 'WMON',     loanCToken: '0x8EE9FC28B8Da872c38A496e9dDB9700bb7261774', loanDec: 6,  loanSym: 'USDC' },
  'curvance-wbtc-usdc-borrow':     { colCToken: '0x3D2Ff9F862D89Ba526a0fC166bD56ABe04EF28d5', colAsset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', colDec: 8,  colSym: 'WBTC',     loanCToken: '0x7C9d4f1695C6282Da5e5509Aa51fC9fb417C6f1d', loanDec: 6,  loanSym: 'USDC' },
  'curvance-weth-usdc-borrow':     { colCToken: '0x8Af00fbbb2601A8F7636EabbF6243B30BEA47D50', colAsset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', colDec: 18, colSym: 'WETH',     loanCToken: '0x21aDBb60a5fB909e7F1fB48aACC4569615CD97b5', loanDec: 6,  loanSym: 'USDC' },
  'curvance-gmon-wmon-borrow':     { colCToken: '0x5ca6966543c0786f547446234492D2F11C82f11f', colAsset: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', colDec: 18, colSym: 'gMON',     loanCToken: '0xf473568b26B8C5aadCa9fbC0eA17E1728d5ec925', loanDec: 18, loanSym: 'WMON' },
  'curvance-syzusd-ausd-borrow':   { colCToken: '0x7EdA3cb060Ff7B650eB227971dbfEBD3513b11D5', colAsset: '0x484be0540aD49f351eaa04eeB35dF0f937D4E73f', colDec: 18, colSym: 'syzUSD',   loanCToken: '0x8E94704607E857eB3E10Bd21D90bf8C1Ecba0452', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-wsrusd-ausd-borrow':   { colCToken: '0x251B67Ae7e90fDc6a7B080Ee601913A8B2746A28', colAsset: '0x4809010926aec940b550D34a46A52739f996D75D', colDec: 18, colSym: 'wsrUSD',   loanCToken: '0x88e0994E8130EF72bf614CBBcF722839B167c8d1', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-yzm-ausd-borrow':      { colCToken: '0x8626B8f4F64CAeee9549Af8ebbFA591A7425e5ba', colAsset: '0x3a2c4aAae6776dC1c31316De559598f2f952E2cB', colDec: 6,  colSym: 'YZM',      loanCToken: '0xcdc9D2c4EaD8f2A9FD3D6F5a00bA4e6001ab7898', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-vusd-ausd-borrow':     { colCToken: '0x42369AFe4bA4225b800b8024Acc5F14f42A3836C', colAsset: '0x8d3F9f9Eb2f5E8B48EFBB4074440D1E2A34Bc365', colDec: 6,  colSym: 'vUSD',     loanCToken: '0x4806902Ec0320e5334c2B2679FFB58C830348F1c', loanDec: 6,  loanSym: 'AUSD' },
  'curvance-ebtc-wbtc-borrow':     { colCToken: '0x2840772E14fFbe337aB966727B7D1Dd09BDc76E4', colAsset: '0xd691b0aFed67F96CEC28Ab6308Cbe5b2C103b7e9', colDec: 10, colSym: 'eBTC',     loanCToken: '0xdB3e888c3b50771821226d30Ab6eC14eB5ba85bA', loanDec: 8,  loanSym: 'WBTC' },
  'curvance-savusd-usdc-borrow':   { colCToken: '0x3afB9A1cC0d2b0D62502B84B070601fF0DC84363', colAsset: '0x9648dB94F1e6B19e7D755585542981F97dc806c6', colDec: 18, colSym: 'savUSD',   loanCToken: '0x9891178A1178E4C740Fa61Fd6e30A9D92D897590', loanDec: 6,  loanSym: 'USDC' },

  // Reverse borrow markets — col/loan swapped vs the primary market above
  'curvance-wmon-ausd-col-borrow': { colCToken: '0x6E182EB501800C555bd5E662E6D350D627F504D8', colAsset: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', colDec: 6,  colSym: 'AUSD', loanCToken: '0xE01d426B589c7834a5F6B20D7e992A705d3c22ED', loanDec: 18, loanSym: 'WMON' },
  'curvance-wmon-usdc-col-borrow': { colCToken: '0x8EE9FC28B8Da872c38A496e9dDB9700bb7261774', colAsset: '0x754704bc059f8c67012fed69bc8a327a5aafb603', colDec: 6,  colSym: 'USDC', loanCToken: '0x1e240E30E51491546deC3aF16B0b4EAC8Dd110D4', loanDec: 18, loanSym: 'WMON' },
  'curvance-wbtc-usdc-col-borrow': { colCToken: '0x7C9d4f1695C6282Da5e5509Aa51fC9fb417C6f1d', colAsset: '0x754704bc059f8c67012fed69bc8a327a5aafb603', colDec: 6,  colSym: 'USDC', loanCToken: '0x3D2Ff9F862D89Ba526a0fC166bD56ABe04EF28d5', loanDec: 8,  loanSym: 'WBTC' },
  'curvance-weth-usdc-col-borrow': { colCToken: '0x21aDBb60a5fB909e7F1fB48aACC4569615CD97b5', colAsset: '0x754704bc059f8c67012fed69bc8a327a5aafb603', colDec: 6,  colSym: 'USDC', loanCToken: '0x8Af00fbbb2601A8F7636EabbF6243B30BEA47D50', loanDec: 18, loanSym: 'WETH' },
  'curvance-ebtc-wbtc-col-borrow': { colCToken: '0xdB3e888c3b50771821226d30Ab6eC14eB5ba85bA', colAsset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', colDec: 8,  colSym: 'WBTC', loanCToken: '0x2840772E14fFbe337aB966727B7D1Dd09BDc76E4', loanDec: 10, loanSym: 'eBTC' },
}

// ── Kuru Managed Vaults ───────────────────────────────────────────────────────
// deposit(uint256 baseAmount, uint256 quoteAmount) payable
//   baseAmount = MON (send as msg.value — native, no approve needed)
//   quoteAmount = USDC/AUSD (ERC20, requires approve first)
// Verified Apr 2026: 0xe2bbb158 in bytecode, payable confirmed via eth_call probe
export const KURU_VAULT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'baseAmount',  type: 'uint256' },
      { name: 'quoteAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    // Burns shares → returns proportional MON + quote to receiver. No approve needed.
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_shares',   type: 'uint256' },
      { name: '_receiver', type: 'address' },
      { name: '_owner',    type: 'address' },
    ],
    outputs: [{ name: 'baseOut', type: 'uint256' }, { name: 'quoteOut', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    // Returns total vault assets including active CLOB orders (not just idle MarginAccount funds).
    // New vault (0x838c): works. Old vault (0xd0f8): reverts — use allowFailure in multicall.
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'baseLiquidity',  type: 'uint256' },
      { name: 'quoteLiquidity', type: 'uint256' },
    ],
  },
] as const

// Kuru MarginAccount — holds vault funds, used to compute deposit ratio
// getBalance(user, token) → uint256 — token 0x00...00 = native MON
// Verified Apr 2026 probe: vault MON balance ~8M, USDC ~220K
export const KURU_MARGIN_ACCOUNT = {
  address: '0x2a68ba1833cdf93fa9da1eebd7f46242ad8e90c5' as `0x${string}`,
  abi: [{
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user',  type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  }] as const,
}

export const KURU_VAULTS: Record<string, {
  address:    `0x${string}`
  quoteToken: `0x${string}`
  quoteDec:   number
  quoteSym:   string
}> = {
  // New active vault (Kuru migrated from 0xd0f8 → 0x838c, May 2026)
  // totalAssets() works on this vault → accurate TVL including active CLOB orders
  'kuru-vault-mon-usdc': {
    address:    '0x838c2d3fd4db5eb2f185cbe7697fbaace52b34d7',
    quoteToken: '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    quoteDec:   6,
    quoteSym:   'USDC',
  },
  // Old vault (deprecated) — totalAssets() reverts, use MarginAccount reads as fallback
  // Keep tracking so users who haven't migrated still see their position
  'kuru-vault-mon-usdc-v1': {
    address:    '0xd0f8a6422ccdd812f29d8fb75cf5fcd41483badc',
    quoteToken: '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    quoteDec:   6,
    quoteSym:   'USDC',
  },
}

// ── Clober LP ─────────────────────────────────────────────────────────────────
// Correct flow (verified Apr 2026 via bytecode analysis):
//   1. Wrap native MON → WMON via WMON.deposit() payable
//   2. Approve USDC → LV proxy (amountA)
//   3. Approve WMON → LV proxy (amountB)
//   4. LV.mint(key, usdcAmt, wmonAmt, 0) — non-payable, pulls both via ERC20 transferFrom
//
// Note: interact contract (0xb1251...) does NOT expose a simple mint interface.
//   Its only deposit fn (0x4f28185a) requires complex order-book params.
//   Calling it directly with (key,amtA,amtB,minLp) silently reverts.
//   LV.mint is the canonical entry point for simple ratio deposits.
//
// LiquidityVault proxy (ERC1967): 0xb09684... → impl 0xf3f2bea...
// getLiquidity returns 6 uint256s: [0]=USDC reserve, [3]=WMON reserve
export const CLOBER_LV = {
  address: '0xb09684f5486d1af80699bbc27f14dd5a905da873' as `0x${string}`,
  abi: [
    {
      name: 'mint',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'key',         type: 'bytes32' },
        { name: 'amountA',     type: 'uint256' },
        { name: 'amountB',     type: 'uint256' },
        { name: 'minLpAmount', type: 'uint256' },
      ],
      outputs: [{ name: 'lpAmount', type: 'uint256' }],
    },
    {
      name: 'getLiquidity',
      type: 'function',
      stateMutability: 'view',
      inputs:  [{ name: 'key', type: 'bytes32' }],
      outputs: [
        { type: 'uint256' },  // [0] lpReserveA — USDC (6 dec)
        { type: 'uint256' },  // [1] pendingOrdersA
        { type: 'uint256' },  // [2] claimableA
        { type: 'uint256' },  // [3] lpReserveB — WMON (18 dec)
        { type: 'uint256' },  // [4] pendingOrdersB
        { type: 'uint256' },  // [5] claimableB
      ],
    },
  ] as const,
}

// WMON — Wrapped MON (ERC20 + deposit/withdraw)
// deposit() payable — send native MON, receive WMON 1:1
export const WMON_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs:  [],
    outputs: [],
  },
] as const

export const CLOBER_POOLS: Record<string, {
  key:       `0x${string}`
  tokenA:    `0x${string}`
  tokenADec: number
  tokenASym: string
}> = {
  'clober-usdc-mon': {
    key:       '0x6cfff26d468c939f54a469dbb0c49ed2e9ffc00a050812c6dfdc02d20ceb2b3a',
    tokenA:    '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    tokenADec: 6,
    tokenASym: 'USDC',
  },
}

// ── Token Addresses ───────────────────────────────────────────────────────────
export const TOKENS = {
  WMON:   '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`,
  USDC:   '0x754704bc059f8c67012fed69bc8a327a5aafb603' as `0x${string}`,
  AUSD:   '0x00000000efe302beaa2b3e6e1b18d08d69a9012a' as `0x${string}`,
  WETH:   '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242' as `0x${string}`,
  WBTC:   '0x0555e30da8f98308edb960aa94c0db47230d2b9c' as `0x${string}`,
  DUST:   '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c' as `0x${string}`,
  cbBTC:  '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b' as `0x${string}`,
  XAUt0:  '0x01bff41798a0bcf287b996046ca68b395dbc1071' as `0x${string}`,
  USDT0:  '0xe7cd86e13AC4309349F30B3435a9d337750fC82D' as `0x${string}`,
  shMON:  '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as `0x${string}`,
  gMON:   '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' as `0x${string}`,
  sMON:   '0xA3227C5969757783154C60bF0bC1944180ed81B9' as `0x${string}`,
  wstETH: '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417' as `0x${string}`,
  weETH:  '0xa3d68b74bf0528fdd07263c60d6488749044914b' as `0x${string}`,
  ALLOCA: '0x1ad7052bb331a0529c1981c3ec2bc4663498a110' as `0x${string}`,
} as const

// ── Uniswap V3 ────────────────────────────────────────────────────────────────
// NonfungiblePositionManager — verified via Uniswap official docs + Rabby wallet popup Apr 2026
export const UNISWAP_V3_NPM = {
  address: '0x7197e214c0b767cfb76fb734ab638e2c192f4e53' as `0x${string}`,
  abi: [
    {
      name: 'mint',
      type: 'function',
      stateMutability: 'payable',
      inputs: [{
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'token0',          type: 'address' },
          { name: 'token1',          type: 'address' },
          { name: 'fee',             type: 'uint24'  },
          { name: 'tickLower',       type: 'int24'   },
          { name: 'tickUpper',       type: 'int24'   },
          { name: 'amount0Desired',  type: 'uint256' },
          { name: 'amount1Desired',  type: 'uint256' },
          { name: 'amount0Min',      type: 'uint256' },
          { name: 'amount1Min',      type: 'uint256' },
          { name: 'recipient',       type: 'address' },
          { name: 'deadline',        type: 'uint256' },
        ],
      }],
      outputs: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'liquidity',  type: 'uint128' },
        { name: 'amount0',    type: 'uint256' },
        { name: 'amount1',    type: 'uint256' },
      ],
    },
    {
      name: 'refundETH',
      type: 'function',
      stateMutability: 'payable',
      inputs:  [],
      outputs: [],
    },
    {
      name: 'multicall',
      type: 'function',
      stateMutability: 'payable',
      inputs:  [{ name: 'data',    type: 'bytes[]' }],
      outputs: [{ name: 'results', type: 'bytes[]' }],
    },
    // ERC721 enumeration
    { name: 'balanceOf', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }] },
    { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }] },
    // Position data (indices [2..11] = token0,token1,fee,tickLower,tickUpper,liquidity,fg0,fg1,tokensOwed0,tokensOwed1)
    { name: 'positions', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'tokenId', type: 'uint256' }],
      outputs: [
        { name: 'nonce',                    type: 'uint96'  },
        { name: 'operator',                 type: 'address' },
        { name: 'token0',                   type: 'address' },
        { name: 'token1',                   type: 'address' },
        { name: 'fee',                      type: 'uint24'  },
        { name: 'tickLower',                type: 'int24'   },
        { name: 'tickUpper',                type: 'int24'   },
        { name: 'liquidity',                type: 'uint128' },
        { name: 'feeGrowthInside0LastX128', type: 'uint256' },
        { name: 'feeGrowthInside1LastX128', type: 'uint256' },
        { name: 'tokensOwed0',              type: 'uint128' },
        { name: 'tokensOwed1',              type: 'uint128' },
      ] },
    // Remove liquidity (params.liquidity must be > 0 — contract enforced)
    { name: 'decreaseLiquidity', type: 'function', stateMutability: 'payable',
      inputs: [{ name: 'params', type: 'tuple', components: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'liquidity',  type: 'uint128' },
        { name: 'amount0Min', type: 'uint256' },
        { name: 'amount1Min', type: 'uint256' },
        { name: 'deadline',   type: 'uint256' },
      ]}],
      outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }] },
    // Collect owed tokens/fees
    { name: 'collect', type: 'function', stateMutability: 'payable',
      inputs: [{ name: 'params', type: 'tuple', components: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'recipient',  type: 'address' },
        { name: 'amount0Max', type: 'uint128' },
        { name: 'amount1Max', type: 'uint128' },
      ]}],
      outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }] },
  ] as const,
}

// Uniswap V3 SwapRouter02 — official Monad deployment (SwapRouter02 = no `deadline` in exactInputSingle)
// ⚠️ 0x721ac9... is Bean Exchange DLMM Router — DIFFERENT protocol, does NOT support exactInputSingle!
// SwapRouter02 official address on Monad: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-monad-deployments
export const UNISWAP_V3_SWAP_ROUTER = {
  address: '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as `0x${string}`,
  abi: [
    {
      // SwapRouter02: NO deadline field (unlike SwapRouter01). Selector: 0x04e45aaf
      name: 'exactInputSingle',
      type: 'function',
      stateMutability: 'payable',
      inputs: [{
        name: 'params', type: 'tuple',
        components: [
          { name: 'tokenIn',            type: 'address' },
          { name: 'tokenOut',           type: 'address' },
          { name: 'fee',                type: 'uint24'  },
          { name: 'recipient',          type: 'address' },
          { name: 'amountIn',           type: 'uint256' },
          { name: 'amountOutMinimum',   type: 'uint256' },
          { name: 'sqrtPriceLimitX96',  type: 'uint160' },
        ],
      }],
      outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
    {
      // Unwrap all WMON held by the router to native MON and send to recipient
      name: 'unwrapWETH9',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: 'amountMinimum', type: 'uint256' },
        { name: 'recipient',     type: 'address' },
      ],
      outputs: [],
    },
    {
      name: 'multicall',
      type: 'function',
      stateMutability: 'payable',
      inputs:  [{ name: 'data',    type: 'bytes[]' }],
      outputs: [{ name: 'results', type: 'bytes[]' }],
    },
  ] as const,
}

// gMON/WMON Uniswap V3 pool — fee tier 10000 (1%)
// WMON=token0 (0x3b... < 0x84...), gMON=token1
// Used for Magma instant unstake: gMON → WMON → native MON
export const GMON_WMON_V3_POOL_ADDRESS = '0x934c3864e3508a9505245642d5a0119ab5dd2446' as `0x${string}`

// V3 pool slot0 — sqrtPriceX96 + currentTick
export const UNISWAP_V3_POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96',              type: 'uint160' },
      { name: 'tick',                       type: 'int24'   },
      { name: 'observationIndex',           type: 'uint16'  },
      { name: 'observationCardinality',     type: 'uint16'  },
      { name: 'observationCardinalityNext', type: 'uint16'  },
      { name: 'feeProtocol',                type: 'uint8'   },
      { name: 'unlocked',                   type: 'bool'    },
    ],
  },
] as const

export const UNISWAP_V3_POOLS: Record<string, {
  address:     `0x${string}`
  token0:      `0x${string}`  // sorted by address (lower = token0)
  token0Dec:   number
  token0Sym:   string         // display symbol
  token1:      `0x${string}`
  token1Dec:   number
  token1Sym:   string
  fee:         number         // uint24: 3000 = 0.3%
  tickSpacing: number
  wmonSide:    'token0' | 'token1' | 'none'  // which side is native MON (WMON)
}> = {
  // WMON (0x3bd...) < USDC (0x754...) → token0=WMON, token1=USDC
  // NPM receives native MON as msg.value and wraps to WMON internally
  'uniswap-v3-wmon-usdc-3000': {
    address:     '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token1Dec:   6,  token1Sym: 'USDC',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'token0',
  },
  // SHMON (0x1b68...) < WMON (0x3bd3...) → token0=SHMON, token1=WMON
  'uniswap-v3-shmon-wmon-100': {
    address:     '0x1f86a9F2441caC9B942CFb5445530CdBB28717eD',
    token0:      '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', // shMON 18 dec
    token0Dec:   18, token0Sym: 'shMON',
    token1:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token1Dec:   18, token1Sym: 'MON',
    fee:         100, tickSpacing: 1,
    wmonSide:    'token1',
  },
  // WMON (0x3bd...) < gMON (0x849...) → token0=WMON, token1=gMON
  'uniswap-v3-wmon-gmon-100': {
    address:     '0xb80d7a8F5331A907E34CD73f575c784B43E5acb5',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', // gMON 18 dec
    token1Dec:   18, token1Sym: 'gMON',
    fee:         100, tickSpacing: 1,
    wmonSide:    'token0',
  },
  // USDC (0x754...) < DUST (0xAD96...) → token0=USDC, token1=DUST
  'uniswap-v3-usdc-dust-10000': {
    address:     '0xF98D134EF12E3D5DbcF986504B799999b7ded631',
    token0:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec:   6,  token0Sym: 'USDC',
    token1:      '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c', // DUST 18 dec
    token1Dec:   18, token1Sym: 'DUST',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'none',
  },
  // ALLOCA (0x1ad7...) < WMON (0x3bd3...) → token0=ALLOCA, token1=WMON
  'uniswap-v3-alloca-wmon-3000': {
    address:     '0x1ED2F2057901BBEf02EFbC9928b113a15844A19a',
    token0:      '0x1ad7052bb331a0529c1981c3ec2bc4663498a110', // ALLOCA 18 dec
    token0Dec:   18, token0Sym: 'ALLOCA',
    token1:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token1Dec:   18, token1Sym: 'MON',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'token1',
  },
  // USDC (0x754...) < WETH (0xee8c...) → token0=USDC, token1=WETH
  'uniswap-v3-usdc-weth-3000': {
    address:     '0x25EF1a210fF55BcEe9F8fee979aAFf6bD1bE5Bf1',
    token0:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec:   6,  token0Sym: 'USDC',
    token1:      '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', // WETH 18 dec
    token1Dec:   18, token1Sym: 'WETH',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'none',
  },
  // EURW (0x1111...) < USDC (0x754...) → token0=EURW, token1=USDC
  'uniswap-v3-eurw-usdc-100': {
    address:     '0xe153201e40F50EBc9DA7Be3AA9C419f185C97F44',
    token0:      '0x1111B3DED9F1fE1801AD4ebeF8E2788183a24111', // EURW 6 dec
    token0Dec:   6,  token0Sym: 'EURW',
    token1:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token1Dec:   6,  token1Sym: 'USDC',
    fee:         100, tickSpacing: 1,
    wmonSide:    'none',
  },
  // ── New V3 pools ────────────────────────────────────────────────────────────
  // AUSD (0x0000...) < DUST (0xAD96...) → token0=AUSD, token1=DUST, fee=10000
  'uniswap-v3-ausd-dust': {
    address:     '0xD15965968fe8BF2BAbbe39b2FC5de1Ab6749141F',
    token0:      '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', // AUSD 6 dec
    token0Dec:   6,  token0Sym: 'AUSD',
    token1:      '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c', // DUST 18 dec
    token1Dec:   18, token1Sym: 'DUST',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'none',
  },
  // EARN (0x3dB6...) < USDC (0x754...) → token0=EARN, token1=USDC, fee=10000
  'uniswap-v3-earn-usdc': {
    address:     '0x34Cb076Bcc920A76f54F4120D37472570467819C',
    token0:      '0x3dB619ff72D877490699276061FB0Fa0618FDf47', // EARN 18 dec
    token0Dec:   18, token0Sym: 'EARN',
    token1:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token1Dec:   6,  token1Sym: 'USDC',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'none',
  },
  // WMON (0x3bd3...) < EARN (0x3dB6...) → token0=WMON, token1=EARN, fee=10000
  'uniswap-v3-mon-earn': {
    address:     '0x0485A5b85266fa0A6Ef9D4d5a01E2d7A334a81dC',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x3dB619ff72D877490699276061FB0Fa0618FDf47', // EARN 18 dec
    token1Dec:   18, token1Sym: 'EARN',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'token0',
  },
  // WMON (0x3bd3...) < GMONAD (0x7DB5...) → token0=WMON, token1=GMONAD, fee=10000
  'uniswap-v3-mon-gmonad': {
    address:     '0xe305E87C6E8bec4b97879Eb96be92844CB57E95e',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x7DB552eEb6b77a6babe6e0A739b5382CD653CC3e', // GMONAD 18 dec
    token1Dec:   18, token1Sym: 'GMONAD',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'token0',
  },
  // WMON (0x3bd3...) < sMON (0xA322...) → token0=WMON, token1=sMON, fee=100
  'uniswap-v3-mon-smon': {
    address:     '0x36a81Ebd73B86b485a14911EA16F3D7c96CC00b0',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0xA3227C5969757783154C60bF0bC1944180ed81B9', // sMON 18 dec
    token1Dec:   18, token1Sym: 'sMON',
    fee:         100, tickSpacing: 1,
    wmonSide:    'token0',
  },
  // WMON (0x3bd3...) < USDC (0x754..) → token0=WMON, token1=USDC, fee=10000
  'uniswap-v3-mon-usdc-2': {
    address:     '0xC33e9E441e6f4E74CdB34f878bE51189C9CB00D8',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token1Dec:   6,  token1Sym: 'USDC',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'token0',
  },
  // WMON (0x3bd3...) < USDT0 (0xe7cd...) → token0=WMON, token1=USDT0, fee=3000
  'uniswap-v3-mon-usdt0': {
    address:     '0x16D564690D32802A0562B4A8A2378350525b365F',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USDT0 6 dec
    token1Dec:   6,  token1Sym: 'USDT0',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'token0',
  },
  // WMON (0x3bd3...) < USDT0 (0xe7cd...) → token0=WMON, token1=USDT0, fee=10000
  'uniswap-v3-mon-usdt0-2': {
    address:     '0x9665897a0b66Cb9daBEb248C279fd0967C018608',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USDT0 6 dec
    token1Dec:   6,  token1Sym: 'USDT0',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'token0',
  },
  // USDC (0x754..) < USDT0 (0xe7cd...) → token0=USDC, token1=USDT0, fee=100
  'uniswap-v3-usdc-usdt0': {
    address:     '0xacf82ECC826A9fc2D8c8C4d370d2D268fA5B3500',
    token0:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec:   6,  token0Sym: 'USDC',
    token1:      '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USDT0 6 dec
    token1Dec:   6,  token1Sym: 'USDT0',
    fee:         100, tickSpacing: 1,
    wmonSide:    'none',
  },
  // USDC (0x754..) < USDT0 (0xe7cd...) → token0=USDC, token1=USDT0, fee=500
  'uniswap-v3-usdc-usdt0-2': {
    address:     '0xa00D8Ec3c0cC20E93Cad749695392a0B61fe8Ca3',
    token0:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec:   6,  token0Sym: 'USDC',
    token1:      '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USDT0 6 dec
    token1Dec:   6,  token1Sym: 'USDT0',
    fee:         500, tickSpacing: 10,
    wmonSide:    'none',
  },
  // WBTC (0x0555..) < USDC (0x754..) → token0=WBTC, token1=USDC, fee=3000
  'uniswap-v3-wbtc-usdc': {
    address:     '0xB0B083E0353f7df4D5EE1C812eA8c6960c080373',
    token0:      '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // WBTC 8 dec
    token0Dec:   8,  token0Sym: 'WBTC',
    token1:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token1Dec:   6,  token1Sym: 'USDC',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'none',
  },
  // ── old-format aliases (no fee suffix → canonical config with fee) ──────────
  'uniswap-v3-alloca-mon':  { address: '0x1ED2F2057901BBEf02EFbC9928b113a15844A19a', token0: '0x1ad7052bb331a0529c1981c3ec2bc4663498a110', token0Dec: 18, token0Sym: 'ALLOCA', token1: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', token1Dec: 18, token1Sym: 'MON',  fee: 3000,  tickSpacing: 60,  wmonSide: 'token1' },
  'uniswap-v3-shmon-mon':   { address: '0x1f86a9F2441caC9B942CFb5445530CdBB28717eD', token0: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', token0Dec: 18, token0Sym: 'shMON', token1: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', token1Dec: 18, token1Sym: 'MON',  fee: 100,   tickSpacing: 1,   wmonSide: 'token1' },
  'uniswap-v3-mon-gmon':    { address: '0xb80d7a8F5331A907E34CD73f575c784B43E5acb5', token0: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', token0Dec: 18, token0Sym: 'MON',   token1: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', token1Dec: 18, token1Sym: 'gMON', fee: 100,   tickSpacing: 1,   wmonSide: 'token0' },
  'uniswap-v3-mon-usdc':    { address: '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da', token0: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', token0Dec: 18, token0Sym: 'MON',   token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', token1Dec: 6,  token1Sym: 'USDC', fee: 3000,  tickSpacing: 60,  wmonSide: 'token0' },
  'uniswap-v3-usdc-dust':   { address: '0xF98D134EF12E3D5DbcF986504B799999b7ded631', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', token0Dec: 6,  token0Sym: 'USDC',  token1: '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c', token1Dec: 18, token1Sym: 'DUST', fee: 10000, tickSpacing: 200, wmonSide: 'none'   },
  'uniswap-v3-usdc-weth':   { address: '0x25EF1a210fF55BcEe9F8fee979aAFf6bD1bE5Bf1', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', token0Dec: 6,  token0Sym: 'USDC',  token1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', token1Dec: 18, token1Sym: 'WETH', fee: 3000,  tickSpacing: 60,  wmonSide: 'none'   },
  'uniswap-v3-eurw-usdc':   { address: '0xe153201e40F50EBc9DA7Be3AA9C419f185C97F44', token0: '0x1111B3DED9F1fE1801AD4ebeF8E2788183a24111', token0Dec: 6,  token0Sym: 'EURW',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', token1Dec: 6,  token1Sym: 'USDC', fee: 100,   tickSpacing: 1,   wmonSide: 'none'   },
}

// ── Uniswap V2 ────────────────────────────────────────────────────────────────
// Verified Apr 2026: Router02.factory() = 0x182a927... ✅, Router02.WETH() = WMON ✅
export const UNISWAP_V2_ROUTER = {
  address: '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804' as `0x${string}`,
  abi: [
    {
      name: 'addLiquidity',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'tokenA',         type: 'address' },
        { name: 'tokenB',         type: 'address' },
        { name: 'amountADesired', type: 'uint256' },
        { name: 'amountBDesired', type: 'uint256' },
        { name: 'amountAMin',     type: 'uint256' },
        { name: 'amountBMin',     type: 'uint256' },
        { name: 'to',             type: 'address' },
        { name: 'deadline',       type: 'uint256' },
      ],
      outputs: [
        { name: 'amountA',   type: 'uint256' },
        { name: 'amountB',   type: 'uint256' },
        { name: 'liquidity', type: 'uint256' },
      ],
    },
    {
      name: 'removeLiquidity',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'tokenA',    type: 'address' },
        { name: 'tokenB',    type: 'address' },
        { name: 'liquidity', type: 'uint256' },
        { name: 'amountAMin', type: 'uint256' },
        { name: 'amountBMin', type: 'uint256' },
        { name: 'to',        type: 'address' },
        { name: 'deadline',  type: 'uint256' },
      ],
      outputs: [
        { name: 'amountA', type: 'uint256' },
        { name: 'amountB', type: 'uint256' },
      ],
    },
  ] as const,
}

export const UNISWAP_V2_PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0',           type: 'uint112' },
      { name: 'reserve1',           type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32'  },
    ],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ── Uniswap V4 ────────────────────────────────────────────────────────────────
// Verified Apr 2026 from official Uniswap V4 Monad deployment docs (chainId 143)
// PoolManager:          0x188d586ddcf52439676ca21a244753fa19f9ea8e
// PositionDescriptor:   0x5770d2914355a6d0a39a70aeea9bcce55df4201b
// Quoter:               0xa222dd357a9076d1091ed6aa2e16c9742dd26891
// StateView:            0x77395f3b2e73ae90843717371294fa97cc419d64
// Universal Router:     0x0d97dc33264bfc1c226207428a79b26757fb9dc3
// Permit2:              0x000000000022D473030F116dDEE9F6B43aC78BA3

// PositionManager — modifyLiquidities(unlockData, deadline) payable
// unlockData = abi.encode(bytes actions, bytes[] params)
// Actions: MINT_POSITION=0x02, SETTLE_PAIR=0x12, SWEEP=0x40
// Permit2 — canonical address, used by Uniswap V4 PositionManager for token transfers
// V4 PM pulls ERC20 via permit2.transferFrom, not direct ERC20 allowance
export const PERMIT2 = {
  address: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`,
  abi: [
    {
      name: 'allowance',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'owner',   type: 'address' },
        { name: 'token',   type: 'address' },
        { name: 'spender', type: 'address' },
      ],
      outputs: [
        { name: 'amount',     type: 'uint160' },
        { name: 'expiration', type: 'uint48'  },
        { name: 'nonce',      type: 'uint48'  },
      ],
    },
    {
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'token',      type: 'address' },
        { name: 'spender',    type: 'address' },
        { name: 'amount',     type: 'uint160' },
        { name: 'expiration', type: 'uint48'  },
      ],
      outputs: [],
    },
  ] as const,
}

export const UNISWAP_V4_POSITION_MANAGER = {
  address: '0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016' as `0x${string}`,
  abi: [{
    name: 'modifyLiquidities',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'unlockData', type: 'bytes'   },
      { name: 'deadline',   type: 'uint256' },
    ],
    outputs: [],
  }] as const,
}

// StateView — getSlot0(poolId) for reading live price/tick from V4 pools
export const UNISWAP_V4_STATE_VIEW = {
  address: '0x77395f3b2e73ae90843717371294fa97cc419d64' as `0x${string}`,
  abi: [{
    name: 'getSlot0',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'protocolFee',  type: 'uint24'  },
      { name: 'lpFee',        type: 'uint24'  },
    ],
  }] as const,
}

export const UNISWAP_V4_POOLS: Record<string, {
  poolId:    `0x${string}`  // bytes32 keccak256(PoolKey)
  currency0: `0x${string}`  // 0x00...00 = native MON
  c0Dec:     number
  c0Sym:     string
  currency1: `0x${string}`
  c1Dec:     number
  c1Sym:     string
  fee:       number          // in hundredths of a bip (same as V3)
  tickSpacing: number
  hasNative: boolean         // true if currency0 = address(0)
}> = {
  // AUSD (0x00000000eFE3...) < USDC (0x754704...) → currency0=AUSD, fee=9
  'uniswap-v4-ausd-usdc-9-nohook': {
    poolId:    '0xd112fde908d7342135fc7297cc53d25bf7a11d6c6e21fe7ac3e73c40f70827e8',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 9, tickSpacing: 1, hasNative: false,
  },
  // native (0x00...00) < USDC (0x754704...) → currency0=native MON, fee=500
  'uniswap-v4-mon-usdc-500-nohook': {
    poolId:    '0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 500, tickSpacing: 10, hasNative: true,
  },
  // AUSD (0x00000000eFE3...) < USDT0 (0xe7cd86...) → currency0=AUSD, fee=50
  'uniswap-v4-ausd-usdt0-50-nohook': {
    poolId:    '0xe56868928b91fcd5ebeada3d0ec8767f2bbfeb1e7da181203d13f6af76b03bf9',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0',
    fee: 50, tickSpacing: 1, hasNative: false,
  },
  // USDC (0x754704...) < WETH (0xee8c0e...) → currency0=USDC, fee=500
  'uniswap-v4-usdc-weth-500-nohook': {
    poolId:    '0xad408916c1c310da9c258d4c128a7bf50fd9edc42a218cc970da39cfc8a05d93',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // AUSD (0x000000...) < USDC (0x754704...) → currency0=AUSD, fee=50
  'uniswap-v4-ausd-usdc-50-nohook': {
    poolId:    '0x092b650478145f0aee73a1b400b342b9c6314db2e07aeb91faf7e75e8159ce72',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 50, tickSpacing: 1, hasNative: false,
  },
  // native (0x000...) < shMON (0x1b68...) → currency0=native MON, fee=100
  'uniswap-v4-mon-shmon-100-nohook': {
    poolId:    '0x0a2eb246aac042fed4eeaf8bce78df3568cbe21701c969812702633085b8f771',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', c1Dec: 18, c1Sym: 'shMON',
    fee: 100, tickSpacing: 1, hasNative: true,
  },
  // native (0x000...) < WBTC (0x0555...) → currency0=native MON, fee=500
  'uniswap-v4-mon-wbtc-500-nohook': {
    poolId:    '0x1c93dd2f2f47439330150bf728c3beeaad71de45420a49183214898b044b65d1',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // native (0x000...) < WETH (0xee8c...) → currency0=native MON, fee=500
  'uniswap-v4-mon-weth-500-nohook': {
    poolId:    '0x3783b51e33900eb366a9e8473c76cda441e7170d2e5d96927f30c16a7add93aa',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // AUSD (0x0000...) < WBTC (0x0555...) → currency0=AUSD, fee=500
  'uniswap-v4-ausd-wbtc-500-nohook': {
    poolId:    '0x6fed390faee91596851fdf2fa74c0f799d6bbe4f317b7d6ab16ef31fc974e4da',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',
    fee: 500, tickSpacing: 1, hasNative: false,
  },
  // USDC (0x7547...) < cbBTC (0xd18b...) → currency0=USDC, fee=500
  'uniswap-v4-usdc-cbbtc-500-nohook': {
    poolId:    '0x7fc6232a9ec6cc4e9434640dcde5ee08ccae3b07de3247bf788fc9e2051b449e',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // WBTC (0x0555...) < cbBTC (0xd18b...) → currency0=WBTC, fee=100
  'uniswap-v4-wbtc-cbbtc-100-nohook': {
    poolId:    '0xab7e9e8e532098ef4802c25490136d4f84089dea5900b3bec6153561d17b37bd',
    currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',
    currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // native (0x000...) < AUSD (0x00000000eFE3...) → currency0=native MON, fee=500
  'uniswap-v4-mon-ausd-500-nohook': {
    poolId:    '0xadaf30776f551bccdfb307c3fd8cdec198ca9a852434c8022ee32d1ccedd8219',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c1Dec: 6,  c1Sym: 'AUSD',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // WBTC (0x0555...) < USDC (0x7547...) → currency0=WBTC, fee=500
  'uniswap-v4-wbtc-usdc-500-nohook': {
    poolId:    '0xd77c0f253764f5d5fbc78e13888afcc35c839262e6b21cd02baa9d8551a9898a',
    currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // AUSD (0x0000...) < XAUt0 (0x01bf...) → currency0=AUSD, fee=500, no hook
  'uniswap-v4-ausd-xaut0-500-nohook': {
    poolId:    '0xe1a8600687e4d06ca4787e5d0ccdacb1d360bfc9ca6ca2a49a688e14d0ef37b4',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x01bff41798a0bcf287b996046ca68b395dbc1071', c1Dec: 6,  c1Sym: 'XAUt0',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // weETH (0xa3d6...) < WETH (0xee8c...) → currency0=weETH, fee=100
  'uniswap-v4-weeth-weth-100-nohook': {
    poolId:    '0x2884b37c4a144e7047a1377ba7201d4b8ea318f0240369e01dc400f04e6cac40',
    currency0: '0xa3d68b74bf0528fdd07263c60d6488749044914b', c0Dec: 18, c0Sym: 'weETH',
    currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // wstETH (0x10ae...) < WETH (0xee8c...) → currency0=wstETH, fee=100
  'uniswap-v4-wsteth-weth-100-nohook': {
    poolId:    '0x55d7ed991392eb9597a76a5f41dfb964e291452c15107c0e64fd3d25925394ce',
    currency0: '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417', c0Dec: 18, c0Sym: 'wstETH',
    currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // native (0x00...) < USDC (0x754...) → currency0=native MON, fee=3000, ts=60
  'uniswap-v4-mon-usdc-3000-nohook': {
    poolId:    '0x7d892749d0562b0f78a26cdec26e97ec9dc7f8d1997cb590643ab69f10a1da0e',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 3000, tickSpacing: 60, hasNative: true,
  },
  // AUSD (0x0000...) < USDC (0x754...) → currency0=AUSD, fee=8, ts=1
  'uniswap-v4-ausd-usdc-8-nohook': {
    poolId:    '0x9d466756627d512706e6feebe92b297b7c1ece27fa8a201321794953fc1a88b4',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 8, tickSpacing: 1, hasNative: false,
  },
  // native (0x00...) < CHOG (0x3500...) → currency0=native MON, fee=10000, ts=200
  'uniswap-v4-mon-chog-10000-nohook': {
    poolId:    '0xcfd2d35fee02342ed362279b83debe5691b288c0016f4993b944f8161300f60c',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', c1Dec: 18, c1Sym: 'CHOG',
    fee: 10000, tickSpacing: 200, hasNative: true,
  },
  // AUSD (0x0000...) < EARNAUSD (0x1032...) → currency0=AUSD, fee=100, ts=1
  'uniswap-v4-ausd-earnausd-100-nohook': {
    poolId:    '0x23de420388ac221df146acc41556e74049429a0d186edcd84b21c1d0f743577e',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', c1Dec: 6,  c1Sym: 'EARNAUSD',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // USDC (0x754...) < EMO (0x81A2...) → currency0=USDC, fee=10000, ts=200
  'uniswap-v4-usdc-emo-10000-nohook': {
    poolId:    '0x83e03115da2b8963d80def474a4dcb35dc3c4fdb2ec91e4503e0112fb3b53ca1',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0x81A224F8A62f52BdE942dBF23A56df77A10b7777', c1Dec: 18, c1Sym: 'EMO',
    fee: 10000, tickSpacing: 200, hasNative: false,
  },
  // ── New V4 pools (additional fee tiers / new tokens) ─────────────────────────
  // native (0x00...) < cbBTC (0xd18b...) → fee=500, ts=10
  'uniswap-v4-mon-cbbtc-500-nohook': {
    poolId:    '0x85ebb7759e91fab2c110e5af899a59ef0e1b40c8265ec939aa4f31af4447acdc',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC',
    fee: 500, tickSpacing: 10, hasNative: true,
  },
  // native (0x00...) < USDC (0x754...) → fee=10000, ts=200
  'uniswap-v4-mon-usdc-10000-nohook': {
    poolId:    '0x8b926a72640b5766c5daa65365c24009618a91cab560946b550e4aa5ce2ae5f2',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 10000, tickSpacing: 200, hasNative: true,
  },
  // native (0x00...) < USDC (0x754...) → fee=30000, ts=600
  'uniswap-v4-mon-usdc-30000-nohook': {
    poolId:    '0x58249cb3e44c955d48c6176b1dd5888b7300f0d0b2d1ae934ca8063d16968f9b',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 30000, tickSpacing: 600, hasNative: true,
  },
  // native (0x00...) < aprMON (0x0c65...) → fee=500, ts=10
  'uniswap-v4-mon-aprmon-500-nohook': {
    poolId:    '0x8d8bea4b3489edaa56c081dbf4cc9f0cf6d80eeb29cc4df6ad956b0dc1d245e2',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852', c1Dec: 18, c1Sym: 'aprMON',
    fee: 500, tickSpacing: 10, hasNative: true,
  },
  // native (0x00...) < LVMON (0x91b8...) → fee=3000, ts=60
  'uniswap-v4-mon-lvmon-3000-nohook': {
    poolId:    '0xaacb7e969638eefea2a1bb2710adab08091fb1f05f31f110b5c4aea54c6a0673',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', c1Dec: 18, c1Sym: 'LVMON',
    fee: 3000, tickSpacing: 60, hasNative: true,
  },
  // native (0x00...) < USDT0 (0xe7cd...) → fee=3000, ts=60
  'uniswap-v4-mon-usdt0-3000-nohook': {
    poolId:    '0x21751b14f200827b17546330b42ee3969fd703681db8fe7ba35c95fe617b0262',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0',
    fee: 3000, tickSpacing: 60, hasNative: true,
  },
  // native (0x00...) < wstETH (0x10ae...) → fee=500, ts=1
  'uniswap-v4-mon-wsteth-500-nohook': {
    poolId:    '0xbfd64af1b32c101eeff4f7d51a0f1f522c6a6cdf4de45ae340a58c3d1309032c',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417', c1Dec: 18, c1Sym: 'wstETH',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // shMON (0x1b68...) < USDC (0x754...) → fee=3000, ts=60
  'uniswap-v4-shmon-usdc-3000-nohook': {
    poolId:    '0xdc0ce2f0103b4355697abd804bc4df189874580afe10819adc8322c0c03a5fed',
    currency0: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', c0Dec: 18, c0Sym: 'shMON',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 3000, tickSpacing: 60, hasNative: false,
  },
  // USDC (0x754...) < USDT0 (0xe7cd...) → fee=20, ts=1
  'uniswap-v4-usdc-usdt0-20-nohook': {
    poolId:    '0x4ac1e6d2eeefa340e9e05ff0b67c0962b500fb7ab1bde4ace7a5ad631da2dc33',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0',
    fee: 20, tickSpacing: 1, hasNative: false,
  },
  // native (0x00...) < EMO (0x81A2...) → fee=10000, ts=200
  'uniswap-v4-mon-emo-10000-nohook': {
    poolId:    '0x73be9985dc311390911e4265e900e0fcc1b8a899113a660ff2e80f2ced5163b4',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x81A224F8A62f52BdE942dBF23A56df77A10b7777', c1Dec: 18, c1Sym: 'EMO',
    fee: 10000, tickSpacing: 200, hasNative: true,
  },
  // XAUt0 (0x01bf...) < WBTC (0x0555...) → fee=2500, ts=50
  'uniswap-v4-xaut0-wbtc-2500-nohook': {
    poolId:    '0xf2396fe04aa001ea62f0651f9a9d6b4d8392b50282ce5deb4c23296e95067acb',
    currency0: '0x01bff41798a0bcf287b996046ca68b395dbc1071', c0Dec: 6,  c0Sym: 'XAUt0',
    currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',
    fee: 2500, tickSpacing: 50, hasNative: false,
  },
  // WBTC (0x0555...) < eBTC (0xd691...) → fee=100, ts=1; eBTC decimals=10 (verified on-chain)
  'uniswap-v4-wbtc-ebtc-100-nohook': {
    poolId:    '0xd0507e42a65643f28cb88ec02e90199128a0dc490665f8c199e938ce706f7f7b',
    currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',
    currency1: '0xd691b0aFed67F96CEC28Ab6308Cbe5b2C103b7e9', c1Dec: 10, c1Sym: 'eBTC',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // native (0x00...) < GMONAD (0x7DB5...) → fee=10000, ts=200
  'uniswap-v4-mon-gmonad-10000-nohook': {
    poolId:    '0xf49efde6fee22f3b755d1f2020726fb5e8adac8176013d8af931b3e9bb5c9fd0',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x7DB552eEb6b77a6babe6e0A739b5382CD653CC3e', c1Dec: 18, c1Sym: 'GMONAD',
    fee: 10000, tickSpacing: 200, hasNative: true,
  },
  // native (0x00...) < GMONAD (0x7DB5...) → fee=100, ts=1
  'uniswap-v4-mon-gmonad-100-nohook': {
    poolId:    '0xd34e629ba2de02e79ea08f2af3ea86ddf8a07a39c3825b14b3d60fd887ce1cbb',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x7DB552eEb6b77a6babe6e0A739b5382CD653CC3e', c1Dec: 18, c1Sym: 'GMONAD',
    fee: 100, tickSpacing: 1, hasNative: true,
  },
  // ── old-format aliases (no fee/suffix → canonical nohook config) ────────────
  'uniswap-v4-ausd-usdc':      { poolId: '0x092b650478145f0aee73a1b400b342b9c6314db2e07aeb91faf7e75e8159ce72', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 50,    tickSpacing: 1,   hasNative: false },
  'uniswap-v4-ausd-usdc-2':    { poolId: '0x9d466756627d512706e6feebe92b297b7c1ece27fa8a201321794953fc1a88b4', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 8,     tickSpacing: 1,   hasNative: false },
  'uniswap-v4-ausd-usdc-3':    { poolId: '0xd112fde908d7342135fc7297cc53d25bf7a11d6c6e21fe7ac3e73c40f70827e8', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 9,     tickSpacing: 1,   hasNative: false },
  'uniswap-v4-ausd-usdt0':     { poolId: '0xe56868928b91fcd5ebeada3d0ec8767f2bbfeb1e7da181203d13f6af76b03bf9', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0', fee: 50,    tickSpacing: 1,   hasNative: false },
  'uniswap-v4-ausd-wbtc':      { poolId: '0x6fed390faee91596851fdf2fa74c0f799d6bbe4f317b7d6ab16ef31fc974e4da', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',  fee: 500,   tickSpacing: 1,   hasNative: false },
  'uniswap-v4-ausd-xaut0':     { poolId: '0xe1a8600687e4d06ca4787e5d0ccdacb1d360bfc9ca6ca2a49a688e14d0ef37b4', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0x01bff41798a0bcf287b996046ca68b395dbc1071', c1Dec: 6,  c1Sym: 'XAUt0', fee: 500,   tickSpacing: 10,  hasNative: false },
  'uniswap-v4-earnausd-ausd':  { poolId: '0x23de420388ac221df146acc41556e74049429a0d186edcd84b21c1d0f743577e', currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',  currency1: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', c1Dec: 6,  c1Sym: 'EARNAUSD', fee: 100, tickSpacing: 1, hasNative: false },
  'uniswap-v4-mon-ausd':       { poolId: '0xadaf30776f551bccdfb307c3fd8cdec198ca9a852434c8022ee32d1ccedd8219', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c1Dec: 6,  c1Sym: 'AUSD',  fee: 500,   tickSpacing: 1,   hasNative: true  },
  'uniswap-v4-mon-cbbtc':      { poolId: '0x85ebb7759e91fab2c110e5af899a59ef0e1b40c8265ec939aa4f31af4447acdc', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC', fee: 500,   tickSpacing: 10,  hasNative: true  },
  'uniswap-v4-mon-chog':       { poolId: '0xcfd2d35fee02342ed362279b83debe5691b288c0016f4993b944f8161300f60c', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', c1Dec: 18, c1Sym: 'CHOG',  fee: 10000, tickSpacing: 200, hasNative: true  },
  'uniswap-v4-mon-gmonad':     { poolId: '0xf49efde6fee22f3b755d1f2020726fb5e8adac8176013d8af931b3e9bb5c9fd0', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x7DB552eEb6b77a6babe6e0A739b5382CD653CC3e', c1Dec: 18, c1Sym: 'GMONAD',fee: 10000, tickSpacing: 200, hasNative: true  },
  'uniswap-v4-mon-shmon':      { poolId: '0x0a2eb246aac042fed4eeaf8bce78df3568cbe21701c969812702633085b8f771', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', c1Dec: 18, c1Sym: 'shMON', fee: 100,   tickSpacing: 1,   hasNative: true  },
  'uniswap-v4-mon-usdc':       { poolId: '0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 500,   tickSpacing: 10,  hasNative: true  },
  'uniswap-v4-mon-usdc-2':     { poolId: '0x7d892749d0562b0f78a26cdec26e97ec9dc7f8d1997cb590643ab69f10a1da0e', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 3000,  tickSpacing: 60,  hasNative: true  },
  'uniswap-v4-mon-usdc-3':     { poolId: '0x8b926a72640b5766c5daa65365c24009618a91cab560946b550e4aa5ce2ae5f2', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 10000, tickSpacing: 200, hasNative: true  },
  'uniswap-v4-mon-wbtc':       { poolId: '0x1c93dd2f2f47439330150bf728c3beeaad71de45420a49183214898b044b65d1', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',  fee: 500,   tickSpacing: 1,   hasNative: true  },
  'uniswap-v4-mon-weth':       { poolId: '0x3783b51e33900eb366a9e8473c76cda441e7170d2e5d96927f30c16a7add93aa', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',  fee: 500,   tickSpacing: 1,   hasNative: true  },
  'uniswap-v4-mon-wsteth':     { poolId: '0xbfd64af1b32c101eeff4f7d51a0f1f522c6a6cdf4de45ae340a58c3d1309032c', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417', c1Dec: 18, c1Sym: 'wstETH',fee: 500,   tickSpacing: 1,   hasNative: true  },
  'uniswap-v4-shmon-usdc':     { poolId: '0xdc0ce2f0103b4355697abd804bc4df189874580afe10819adc8322c0c03a5fed', currency0: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', c0Dec: 18, c0Sym: 'shMON', currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 3000,  tickSpacing: 60,  hasNative: false },
  'uniswap-v4-usdc-cbbtc':     { poolId: '0x7fc6232a9ec6cc4e9434640dcde5ee08ccae3b07de3247bf788fc9e2051b449e', currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',  currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC', fee: 500,   tickSpacing: 10,  hasNative: false },
  'uniswap-v4-usdc-usdt0':     { poolId: '0x4ac1e6d2eeefa340e9e05ff0b67c0962b500fb7ab1bde4ace7a5ad631da2dc33', currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',  currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0', fee: 20,    tickSpacing: 1,   hasNative: false },
  'uniswap-v4-usdc-weth':      { poolId: '0xad408916c1c310da9c258d4c128a7bf50fd9edc42a218cc970da39cfc8a05d93', currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',  currency1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', c1Dec: 18, c1Sym: 'WETH',  fee: 500,   tickSpacing: 10,  hasNative: false },
  'uniswap-v4-wbtc-cbbtc':     { poolId: '0xab7e9e8e532098ef4802c25490136d4f84089dea5900b3bec6153561d17b37bd', currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',  currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC', fee: 100,   tickSpacing: 1,   hasNative: false },
  'uniswap-v4-wbtc-ebtc':      { poolId: '0xd0507e42a65643f28cb88ec02e90199128a0dc490665f8c199e938ce706f7f7b', currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',  currency1: '0xd691b0aFed67F96CEC28Ab6308Cbe5b2C103b7e9', c1Dec: 10, c1Sym: 'eBTC',  fee: 100,   tickSpacing: 1,   hasNative: false },
  'uniswap-v4-wbtc-usdc':      { poolId: '0xd77c0f253764f5d5fbc78e13888afcc35c839262e6b21cd02baa9d8551a9898a', currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',  currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',  fee: 500,   tickSpacing: 10,  hasNative: false },
  'uniswap-v4-weeth-weth':     { poolId: '0x2884b37c4a144e7047a1377ba7201d4b8ea318f0240369e01dc400f04e6cac40', currency0: '0xa3d68b74bf0528fdd07263c60d6488749044914b', c0Dec: 18, c0Sym: 'weETH', currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',  fee: 100,   tickSpacing: 1,   hasNative: false },
  'uniswap-v4-wsteth-weth':    { poolId: '0x55d7ed991392eb9597a76a5f41dfb964e291452c15107c0e64fd3d25925394ce', currency0: '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417', c0Dec: 18, c0Sym: 'wstETH',currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',  fee: 100,   tickSpacing: 1,   hasNative: false },
  'uniswap-v4-xaut0-wbtc':     { poolId: '0xf2396fe04aa001ea62f0651f9a9d6b4d8392b50282ce5deb4c23296e95067acb', currency0: '0x01bff41798a0bcf287b996046ca68b395dbc1071', c0Dec: 6,  c0Sym: 'XAUt0', currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',  fee: 2500,  tickSpacing: 50,  hasNative: false },
  'uniswap-v4-mon-aprmon':     { poolId: '0x8d8bea4b3489edaa56c081dbf4cc9f0cf6d80eeb29cc4df6ad956b0dc1d245e2', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x0c65A0BC65a5D819235B71F554D210D3F80E0852', c1Dec: 18, c1Sym: 'aprMON',fee: 500,   tickSpacing: 10,  hasNative: true  },
  'uniswap-v4-mon-lvmon':      { poolId: '0xaacb7e969638eefea2a1bb2710adab08091fb1f05f31f110b5c4aea54c6a0673', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', c1Dec: 18, c1Sym: 'LVMON', fee: 3000,  tickSpacing: 60,  hasNative: true  },
  'uniswap-v4-mon-usdt0':      { poolId: '0x21751b14f200827b17546330b42ee3969fd703681db8fe7ba35c95fe617b0262', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0', fee: 3000,  tickSpacing: 60,  hasNative: true  },
  'uniswap-v4-mon-emo':        { poolId: '0x73be9985dc311390911e4265e900e0fcc1b8a899113a660ff2e80f2ced5163b4', currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',   currency1: '0x81A224F8A62f52BdE942dBF23A56df77A10b7777', c1Dec: 18, c1Sym: 'EMO',   fee: 10000, tickSpacing: 200, hasNative: true  },
}

export const UNISWAP_V2_POOLS: Record<string, {
  address:   `0x${string}`
  token0:    `0x${string}`
  token0Dec: number
  token0Sym: string
  token1:    `0x${string}`
  token1Dec: number
  token1Sym: string
}> = {
  'uniswap-v2-usdc-dust': {
    address:   '0x86dbf00485871c901c5129bd525348db96c2eb2d',
    // V2 sorts by address: USDC 0x7547 < DUST 0xAD96 → token0=USDC, token1=DUST
    token0:    '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec: 6,
    token0Sym: 'USDC',
    token1:    '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c', // DUST 18 dec
    token1Dec: 18,
    token1Sym: 'DUST',
  },
  // old-format alias (reversed token order in name, same pool)
  'uniswap-v2-dust-usdc': {
    address:   '0x86dbf00485871c901c5129bd525348db96c2eb2d',
    token0:    '0x754704bc059f8c67012fed69bc8a327a5aafb603',
    token0Dec: 6,  token0Sym: 'USDC',
    token1:    '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c',
    token1Dec: 18, token1Sym: 'DUST',
  },
}

// ── PancakeSwap V3 ─────────────────────────────────────────────────────────────
// NonfungiblePositionManager — verified Apr 2026 from on-chain tx decode
// Same V3 interface as Uniswap (PancakeSwap V3 is a fork):
//   mint(MintParams) 0x88316456 ✓  refundETH() 0x12210e8a ✓  multicall(bytes[]) 0xac9650d8 ✓
// tickSpacing: fee=100→1, fee=500→10, fee=2500→50
// WMON pools: send native MON as msg.value → NPM wraps to WMON internally
export const PANCAKESWAP_V3_NPM = {
  address: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364' as `0x${string}`,
  abi: [
    {
      name: 'mint',
      type: 'function',
      stateMutability: 'payable',
      inputs: [{
        name: 'params', type: 'tuple',
        components: [
          { name: 'token0',          type: 'address' },
          { name: 'token1',          type: 'address' },
          { name: 'fee',             type: 'uint24'  },
          { name: 'tickLower',       type: 'int24'   },
          { name: 'tickUpper',       type: 'int24'   },
          { name: 'amount0Desired',  type: 'uint256' },
          { name: 'amount1Desired',  type: 'uint256' },
          { name: 'amount0Min',      type: 'uint256' },
          { name: 'amount1Min',      type: 'uint256' },
          { name: 'recipient',       type: 'address' },
          { name: 'deadline',        type: 'uint256' },
        ],
      }],
      outputs: [
        { name: 'tokenId',   type: 'uint256' },
        { name: 'liquidity', type: 'uint128' },
        { name: 'amount0',   type: 'uint256' },
        { name: 'amount1',   type: 'uint256' },
      ],
    },
    {
      name: 'refundETH',
      type: 'function',
      stateMutability: 'payable',
      inputs: [], outputs: [],
    },
    {
      name: 'multicall',
      type: 'function',
      stateMutability: 'payable',
      inputs:  [{ name: 'data',    type: 'bytes[]' }],
      outputs: [{ name: 'results', type: 'bytes[]' }],
    },
    // ERC721 enumeration
    { name: 'balanceOf', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }] },
    { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }] },
    // Position data (indices [2..11] = token0,token1,fee,tickLower,tickUpper,liquidity,fg0,fg1,tokensOwed0,tokensOwed1)
    { name: 'positions', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'tokenId', type: 'uint256' }],
      outputs: [
        { name: 'nonce',                    type: 'uint96'  },
        { name: 'operator',                 type: 'address' },
        { name: 'token0',                   type: 'address' },
        { name: 'token1',                   type: 'address' },
        { name: 'fee',                      type: 'uint24'  },
        { name: 'tickLower',                type: 'int24'   },
        { name: 'tickUpper',                type: 'int24'   },
        { name: 'liquidity',                type: 'uint128' },
        { name: 'feeGrowthInside0LastX128', type: 'uint256' },
        { name: 'feeGrowthInside1LastX128', type: 'uint256' },
        { name: 'tokensOwed0',              type: 'uint128' },
        { name: 'tokensOwed1',              type: 'uint128' },
      ] },
    // Remove liquidity (params.liquidity must be > 0 — contract enforced)
    { name: 'decreaseLiquidity', type: 'function', stateMutability: 'payable',
      inputs: [{ name: 'params', type: 'tuple', components: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'liquidity',  type: 'uint128' },
        { name: 'amount0Min', type: 'uint256' },
        { name: 'amount1Min', type: 'uint256' },
        { name: 'deadline',   type: 'uint256' },
      ]}],
      outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }] },
    // Collect owed tokens/fees
    { name: 'collect', type: 'function', stateMutability: 'payable',
      inputs: [{ name: 'params', type: 'tuple', components: [
        { name: 'tokenId',    type: 'uint256' },
        { name: 'recipient',  type: 'address' },
        { name: 'amount0Max', type: 'uint128' },
        { name: 'amount1Max', type: 'uint128' },
      ]}],
      outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }] },
  ] as const,
}

// PancakeSwap V3 pool slot0 — same ABI as Uniswap V3
export const PANCAKESWAP_V3_POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96',              type: 'uint160' },
      { name: 'tick',                       type: 'int24'   },
      { name: 'observationIndex',           type: 'uint16'  },
      { name: 'observationCardinality',     type: 'uint16'  },
      { name: 'observationCardinalityNext', type: 'uint16'  },
      { name: 'feeProtocol',                type: 'uint32'  },
      { name: 'unlocked',                   type: 'bool'    },
    ],
  },
] as const

// Pool configs — addresses + tokens verified on-chain Apr 2026
// wmonSide: 'token0' | 'token1' | 'none'
//   'token0' → WMON is token0, send native MON as msg.value for that side
//   'token1' → WMON is token1, send native MON as msg.value for that side
//   'none'   → both sides are ERC20, no native MON
export const PANCAKESWAP_V3_POOLS: Record<string, {
  address:   `0x${string}`
  token0:    `0x${string}`; t0Dec: number; t0Sym: string
  token1:    `0x${string}`; t1Dec: number; t1Sym: string
  fee:       number
  tickSpacing: number
  wmonSide:  'token0' | 'token1' | 'none'
}> = {
  // WMON pools (one side = native MON)
  'pancakeswap-v3-wmon-usdc-500':   { address: '0x63e48b725540a3db24acf6682a29f877808c53f2', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 500,  tickSpacing: 10, wmonSide: 'token0' },
  'pancakeswap-v3-ausd-wmon-500':   { address: '0xd5b70d70cbe6c42bcd1aaa662a21673a83f4615b', token0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', t0Dec: 6,  t0Sym: 'AUSD', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 500,  tickSpacing: 10, wmonSide: 'token1' },
  'pancakeswap-v3-wbtc-wmon-500':   { address: '0x0944526d2727b532653e6ca6c4d980461e170a09', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 500,  tickSpacing: 10, wmonSide: 'token1' },
  'pancakeswap-v3-wmon-weth-500':   { address: '0xb02793fe655c1169a8699b4ee462f8ac9c75e402', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'token0' },
  'pancakeswap-v3-apr-wmon-2500':   { address: '0x8506627b3362595f36ddf4d0df1f5c8940b052d0', token0: '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', t0Dec: 18, t0Sym: 'APR',  token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500, tickSpacing: 50, wmonSide: 'token1' },
  'pancakeswap-v3-wmon-cbbtc-500':  { address: '0x614b85502b89540bb79be98d5429ec032a78a284', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 500,  tickSpacing: 10, wmonSide: 'token0' },
  'pancakeswap-v3-lv-wmon-2500':    { address: '0x276664da3b25af7cd13eb4d3294d9840b60e5732', token0: '0x1001ff13bf368aa4fa85f21043648079f00e1001', t0Dec: 18, t0Sym: 'LV',   token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500, tickSpacing: 50, wmonSide: 'token1' },
  'pancakeswap-v3-wmon-cake-2500':  { address: '0x92c57d703941e29a2ece8688ebe228807daa880d', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xf59d81cd43f620e722e07f9cb3f6e41b031017a3', t1Dec: 18, t1Sym: 'CAKE',  fee: 2500, tickSpacing: 50, wmonSide: 'token0' },
  'pancakeswap-v3-wmon-usdc-2500':  { address: '0x85717a98d195c9306bbf7c9523ba71f044fea0f7', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 2500, tickSpacing: 50, wmonSide: 'token0' },
  'pancakeswap-v3-wmon-lvmon-2500': { address: '0xc59514136bdc9c0e735471cd650625ba0f5a634d', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', t1Dec: 18, t1Sym: 'LVMON', fee: 2500, tickSpacing: 50, wmonSide: 'token0' },
  // ERC20-only pools (both tokens need approval)
  'pancakeswap-v3-wbtc-weth-500':   { address: '0xbad186a74e01eb666d069a45c9ba7b2acb3274ab', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancakeswap-v3-apr-usdc-2500':   { address: '0x834d94a041c40def1d05c579b422da42082e8555', token0: '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', t0Dec: 18, t0Sym: 'APR',   token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 2500, tickSpacing: 50, wmonSide: 'none' },
  'pancakeswap-v3-wbtc-usdc-500':   { address: '0x9b60e561e3ab15782fbb23ea0a766dd8d91ff8ac', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancakeswap-v3-cbbtc-weth-500':  { address: '0xca50b90382eed621b193fe8282f90b2f3a181d03', token0: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t0Dec: 8,  t0Sym: 'cbBTC', token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancakeswap-v3-xaut0-usdt0-500': { address: '0xa5c3a55af4029724f519ac8d340be9916ac83e45', token0: '0x01bff41798a0bcf287b996046ca68b395dbc1071', t0Dec: 6,  t0Sym: 'XAUt0', token1: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', t1Dec: 6,  t1Sym: 'USDT0', fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancakeswap-v3-usdc-weth-500':   { address: '0xe5bf0f773740a48cda56b8df37e0dc182f377139', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  // Additional ERC20-only pools
  'pancakeswap-v3-usdc-cbbtc-500':  { address: '0xebc92c45c652e9aae8a886fa49fb2135796d1be1', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 500,   tickSpacing: 10,  wmonSide: 'none' },
  'pancakeswap-v3-usdc-cbbtc-2500': { address: '0x4aa79971caab1aeb239fd73aac9ac361c38f8148', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 2500,  tickSpacing: 50,  wmonSide: 'none' },
  'pancakeswap-v3-usdc-cake-2500':  { address: '0x81e8ed9a3d356697549ec0191513584277089c15', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xf59d81cd43f620e722e07f9cb3f6e41b031017a3', t1Dec: 18, t1Sym: 'CAKE',  fee: 2500,  tickSpacing: 50,  wmonSide: 'none' },
  'pancakeswap-v3-usdc-weth-2500':  { address: '0xbd49deae4ddfdc9a594267e36d2130fb63558d1b', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 2500,  tickSpacing: 50,  wmonSide: 'none' },
  'pancakeswap-v3-lv-lvmon-2500':   { address: '0x811540cf25394c6dc49e3e3be25315ad917c190b', token0: '0x1001ff13bf368aa4fa85f21043648079f00e1001', t0Dec: 18, t0Sym: 'LV',    token1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', t1Dec: 18, t1Sym: 'LVMON', fee: 2500,  tickSpacing: 50,  wmonSide: 'none' },
  'pancakeswap-v3-eurw-usdc-100':   { address: '0x87cb5088d8bbfe3257268eb9cdd400da1d000e86', token0: '0x1111b3ded9f1fe1801ad4ebef8e2788183a24111', t0Dec: 6,  t0Sym: 'EURW',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 100,   tickSpacing: 1,   wmonSide: 'none' },
  'pancakeswap-v3-usdc-lvusd-2500': { address: '0x20ef75d4ab1e459f1f2bdbb20f5766ce3eb7dd33', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xfd44b35139ae53fff7d8f2a9869c503d987f00d1', t1Dec: 18, t1Sym: 'LVUSD', fee: 2500,  tickSpacing: 50,  wmonSide: 'none' },
  // WMON pools (additional fee tiers)
  'pancakeswap-v3-wmon-usdc-10000': { address: '0xb9897986847472cd08b9a0e7bcd31ea4f1322361', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',   token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 10000, tickSpacing: 200, wmonSide: 'token0' },
  // ── New pools (additional tokens / fee tiers) ─────────────────────────────
  // AUSD (0x0000...) < USDC (0x754..) → AUSD=t0, USDC=t1, fee=100
  'pancake-ausd-usdc-100':      { address: '0xe84765b4e2634f3bd8a91c89e432f6b81f0647bc', token0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', t0Dec: 6,  t0Sym: 'AUSD', token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 100,   tickSpacing: 1,   wmonSide: 'none'   },
  // CHOG (0x3500...) < WMON (0x3bd3..) → CHOG=t0, WMON=t1, fee=10000
  'pancake-chog-wmon-10000':    { address: '0x57390310fe6542dc2ae696ffe5a6f56b84fc4229', token0: '0x350035555e10d9afaf1566aaebfced5ba6c27777', t0Dec: 18, t0Sym: 'CHOG', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 10000, tickSpacing: 200, wmonSide: 'token1' },
  // EURW (0x1111..) < WETH (0xee8c..) → EURW=t0, WETH=t1, fee=500
  'pancake-eurw-weth-500':      { address: '0xc1109022bf08c1610a4b33b6db5b8a964553fd82', token0: '0x1111b3ded9f1fe1801ad4ebef8e2788183a24111', t0Dec: 6,  t0Sym: 'EURW', token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  // IGN (0x11ed..) < WMON (0x3bd3..) → IGN=t0, WMON=t1, fee=10000
  'pancake-ign-wmon-10000':     { address: '0x2d59fc33e51ba0bfac815ec34c1f22a80360cd50', token0: '0x11ed3b12d99d508f926c870fb44f472001842c96', t0Dec: 18, t0Sym: 'IGN',  token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 10000, tickSpacing: 200, wmonSide: 'token1' },
  'pancakeswap-v3-ign-wmon-10000': { address: '0x2d59fc33e51ba0bfac815ec34c1f22a80360cd50', token0: '0x11ed3b12d99d508f926c870fb44f472001842c96', t0Dec: 18, t0Sym: 'IGN',  token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 10000, tickSpacing: 200, wmonSide: 'token1' },
  // USD1 (0x1111d2..) < USDC (0x754..) → USD1=t0, USDC=t1, fee=100
  'pancake-usd1-usdc-100':      { address: '0x8ccb070b6f871aba552972c76d3b7df8d88ffa1a', token0: '0x111111d2bf19e43c34263401e0cad979ed1cdb61', t0Dec: 6,  t0Sym: 'USD1', token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 100,   tickSpacing: 1,   wmonSide: 'none'   },
  // USD1 (0x1111d2..) < WMON (0x3bd3..) → USD1=t0, WMON=t1, fee=2500
  'pancake-usd1-wmon-2500':     { address: '0xe4228db368740b2de03174eb2f98d7976ff1e8fa', token0: '0x111111d2bf19e43c34263401e0cad979ed1cdb61', t0Dec: 6,  t0Sym: 'USD1', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500,  tickSpacing: 50,  wmonSide: 'token1' },
  // WMON (0x3bd3..) < sMON (0xa322..) → WMON=t0, sMON=t1, fee=100
  'pancake-wmon-smon-100':      { address: '0xf75dbf48192317a27bb4690c4b333535c227f0a4', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xa3227c5969757783154c60bf0bc1944180ed81b9', t1Dec: 18, t1Sym: 'sMON',  fee: 100,   tickSpacing: 1,   wmonSide: 'token0' },
  // WMON (0x3bd3..) < USDT0 (0xe7cd..) → WMON=t0, USDT0=t1, fee=500
  'pancake-wmon-usdt0-500':     { address: '0x47bae1454139da12d7541c8d5f2b97364da67568', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', t1Dec: 6,  t1Sym: 'USDT0', fee: 500,   tickSpacing: 10,  wmonSide: 'token0' },
  // ── old-format aliases (pancake-* → same config as pancakeswap-v3-*) ────────
  'pancake-wmon-usdc-500':   { address: '0x63e48b725540a3db24acf6682a29f877808c53f2', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 500,   tickSpacing: 10,  wmonSide: 'token0' },
  'pancake-ausd-wmon-500':   { address: '0xd5b70d70cbe6c42bcd1aaa662a21673a83f4615b', token0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', t0Dec: 6,  t0Sym: 'AUSD', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 500,   tickSpacing: 10,  wmonSide: 'token1' },
  'pancake-wbtc-wmon-500':   { address: '0x0944526d2727b532653e6ca6c4d980461e170a09', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 500,   tickSpacing: 10,  wmonSide: 'token1' },
  'pancake-wmon-weth-500':   { address: '0xb02793fe655c1169a8699b4ee462f8ac9c75e402', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,   tickSpacing: 10,  wmonSide: 'token0' },
  'pancake-apr-wmon-2500':   { address: '0x8506627b3362595f36ddf4d0df1f5c8940b052d0', token0: '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', t0Dec: 18, t0Sym: 'APR',  token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500,  tickSpacing: 50,  wmonSide: 'token1' },
  'pancake-wmon-cbbtc-500':  { address: '0x614b85502b89540bb79be98d5429ec032a78a284', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 500,   tickSpacing: 10,  wmonSide: 'token0' },
  'pancake-lv-wmon-2500':    { address: '0x276664da3b25af7cd13eb4d3294d9840b60e5732', token0: '0x1001ff13bf368aa4fa85f21043648079f00e1001', t0Dec: 18, t0Sym: 'LV',   token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500,  tickSpacing: 50,  wmonSide: 'token1' },
  'pancake-wmon-cake-2500':  { address: '0x92c57d703941e29a2ece8688ebe228807daa880d', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xf59d81cd43f620e722e07f9cb3f6e41b031017a3', t1Dec: 18, t1Sym: 'CAKE',  fee: 2500,  tickSpacing: 50,  wmonSide: 'token0' },
  'pancake-wmon-usdc-2500':  { address: '0x85717a98d195c9306bbf7c9523ba71f044fea0f7', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 2500,  tickSpacing: 50,  wmonSide: 'token0' },
  'pancake-wmon-lvmon-2500': { address: '0xc59514136bdc9c0e735471cd650625ba0f5a634d', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', t1Dec: 18, t1Sym: 'LVMON', fee: 2500,  tickSpacing: 50,  wmonSide: 'token0' },
  'pancake-wbtc-weth-500':   { address: '0xbad186a74e01eb666d069a45c9ba7b2acb3274ab', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC', token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  'pancake-apr-usdc-2500':   { address: '0x834d94a041c40def1d05c579b422da42082e8555', token0: '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', t0Dec: 18, t0Sym: 'APR',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 2500,  tickSpacing: 50,  wmonSide: 'none'   },
  'pancake-wbtc-usdc-500':   { address: '0x9b60e561e3ab15782fbb23ea0a766dd8d91ff8ac', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC', token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  'pancake-cbbtc-weth-500':  { address: '0xca50b90382eed621b193fe8282f90b2f3a181d03', token0: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t0Dec: 8,  t0Sym: 'cbBTC',token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  'pancake-xaut0-usdt0-500': { address: '0xa5c3a55af4029724f519ac8d340be9916ac83e45', token0: '0x01bff41798a0bcf287b996046ca68b395dbc1071', t0Dec: 6,  t0Sym: 'XAUt0',token1: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', t1Dec: 6,  t1Sym: 'USDT0', fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  'pancake-usdc-weth-500':   { address: '0xe5bf0f773740a48cda56b8df37e0dc182f377139', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC', token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  'pancake-usdc-cbbtc-500':  { address: '0xebc92c45c652e9aae8a886fa49fb2135796d1be1', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC', token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 500,   tickSpacing: 10,  wmonSide: 'none'   },
  'pancake-usdc-cbbtc-2500': { address: '0x4aa79971caab1aeb239fd73aac9ac361c38f8148', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC', token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 2500,  tickSpacing: 50,  wmonSide: 'none'   },
  'pancake-usdc-cake-2500':  { address: '0x81e8ed9a3d356697549ec0191513584277089c15', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC', token1: '0xf59d81cd43f620e722e07f9cb3f6e41b031017a3', t1Dec: 18, t1Sym: 'CAKE',  fee: 2500,  tickSpacing: 50,  wmonSide: 'none'   },
  'pancake-usdc-lvusd-2500': { address: '0x20ef75d4ab1e459f1f2bdbb20f5766ce3eb7dd33', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC', token1: '0xfd44b35139ae53fff7d8f2a9869c503d987f00d1', t1Dec: 18, t1Sym: 'LVUSD', fee: 2500,  tickSpacing: 50,  wmonSide: 'none'   },
  'pancake-usdc-weth-2500':  { address: '0xbd49deae4ddfdc9a594267e36d2130fb63558d1b', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC', token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 2500,  tickSpacing: 50,  wmonSide: 'none'   },
  'pancake-lv-lvmon-2500':   { address: '0x811540cf25394c6dc49e3e3be25315ad917c190b', token0: '0x1001ff13bf368aa4fa85f21043648079f00e1001', t0Dec: 18, t0Sym: 'LV',   token1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', t1Dec: 18, t1Sym: 'LVMON', fee: 2500,  tickSpacing: 50,  wmonSide: 'none'   },
  'pancake-eurw-usdc-100':   { address: '0x87cb5088d8bbfe3257268eb9cdd400da1d000e86', token0: '0x1111b3ded9f1fe1801ad4ebef8e2788183a24111', t0Dec: 6,  t0Sym: 'EURW', token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 100,   tickSpacing: 1,   wmonSide: 'none'   },
  'pancake-wmon-usdc-10000': { address: '0xb9897986847472cd08b9a0e7bcd31ea4f1322361', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 10000, tickSpacing: 200, wmonSide: 'token0' },
}
