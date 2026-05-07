// Protocol contract addresses and ABIs — hardcoded, never from DB
// Security: immutable on-chain facts; fetching from DB would be an attack vector

// ── Liquid Staking ────────────────────────────────────────────────────────────

// Fastlane shMON — ERC4626-like vault, accepts native MON directly
// asset() = 0xEeee...eeeE (native sentinel) → no approve needed, just send MON
export const FASTLANE = {
  address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' as `0x${string}`,
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
  ] as const,
}

// Kintsu sMON — NOT ERC4626, custom deposit with slippage protection
// deposit(minShares, receiver) payable — msg.value = MON amount
// minShares = 0 for simplicity (no slippage protection in v1)
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
  ] as const,
}

// Magma gMON — ERC4626 vault, ERC1967 proxy (impl: 0xa1f511e1...78497afd2)
// depositMON(address receiver, uint256 referralId) payable — native MON, no approve needed
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
  ] as const,
}

// Apriori aprMON — ERC4626-like vault, accepts native MON directly
// deposit(uint256 assets, address receiver) payable — same interface as Fastlane
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
] as const

// ── Morpho Vaults ─────────────────────────────────────────────────────────────
// ERC4626 vaults — approve asset → deposit(amount, receiver)
// Vault + asset addresses from api.morpho.org/graphql (chainId 143, listed: true)

export const MORPHO_VAULTS: Record<string, {
  vault:    `0x${string}`
  asset:    `0x${string}`
  decimals: number
}> = {
  'morpho-c402b0ca': { vault: '0xc402B0cACC0C684427dAA40d964c8AE6fDbb96f7', asset: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', decimals: 8  }, // cbBTC
  'morpho-ba8424eb': { vault: '0xba8424EBBEd6C51bEa6d6D903B8815838E6a0322', asset: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18 }, // WETH
  'morpho-a8665084': { vault: '0xA8665084D8CD6276c00CA97Cbc0BF4BC9ae94c79', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC
  'morpho-961a59fe': { vault: '0x961a59Fe249b9795FAE7fA35f9E89629689D5278', asset: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6  }, // USDT0
  'morpho-8699bfe5': { vault: '0x8699bfe5c6D74DF561555Bc708dacF165d8E0D73', asset: '0x111111d2bf19e43C34263401e0CAd979eD1cdb61', decimals: 6  }, // USD1
  'morpho-802c91d8': { vault: '0x802c91d807A8DaCA257c4708ab264B6520964e44', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC
  'morpho-32841a85': { vault: '0x32841A8511D5c2c5b253f45668780B99139e476D', asset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6  }, // AUSD
  'morpho-21649703': { vault: '0x21649703fe63265058e9f22582552561Af4AfA3f', asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6  }, // USDC
  'morpho-0f6f5a82': { vault: '0x0f6F5A8272A4Da23e458aABCBCe6382C5cdc6b77', asset: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', decimals: 8  }, // cbBTC
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

// ── Curvance Markets ──────────────────────────────────────────────────────────
// Deposit = supply COLLATERAL (what Curvance's "Collateral" column shows).
// For some bidirectional markets, Curvance's "Collateral" is actually the adapter's
// "loan" side — those are marked with correct addresses below.
// Addresses from Reader.getDynamicMarketData() + on-chain asset() calls (Apr 2026)
export const CURVANCE_MARKETS: Record<string, {
  colCToken:  `0x${string}`   // cToken to deposit collateral into
  colAsset:   `0x${string}`   // underlying ERC20 to approve
  colDec:     number
  colSym:     string          // display name (matches Curvance UI "Collateral" column)
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
  // Bidirectional markets — Curvance's "Collateral" is the loan side in our adapter
  'curvance-ebtc-wbtc':     { colCToken: '0xdB3e888c3b50771821226d30Ab6eC14eB5ba85bA', colAsset: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', colDec: 8,  colSym: 'WBTC'     },
  'curvance-wmon-ausd':     { colCToken: '0x6E182EB501800C555bd5E662E6D350D627F504D8', colAsset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', colDec: 6,  colSym: 'AUSD'     },
  'curvance-wmon-usdc':     { colCToken: '0x8EE9FC28B8Da872c38A496e9dDB9700bb7261774', colAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', colDec: 6,  colSym: 'USDC'     },
  'curvance-wbtc-usdc':     { colCToken: '0x7C9d4f1695C6282Da5e5509Aa51fC9fb417C6f1d', colAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', colDec: 6,  colSym: 'USDC'     },
  'curvance-weth-usdc':     { colCToken: '0x21aDBb60a5fB909e7F1fB48aACC4569615CD97b5', colAsset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', colDec: 6,  colSym: 'USDC'     },
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
  'kuru-vault-mon-usdc': {
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
  ] as const,
}

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
  'uniswap-v3-mon-usdc': {
    address:     '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token1Dec:   6,  token1Sym: 'USDC',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'token0',
  },
  // SHMON (0x1b68...) < WMON (0x3bd3...) → token0=SHMON, token1=WMON
  'uniswap-v3-shmon-mon': {
    address:     '0x1f86a9F2441caC9B942CFb5445530CdBB28717eD',
    token0:      '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', // shMON 18 dec
    token0Dec:   18, token0Sym: 'shMON',
    token1:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token1Dec:   18, token1Sym: 'MON',
    fee:         100, tickSpacing: 1,
    wmonSide:    'token1',
  },
  // WMON (0x3bd...) < gMON (0x849...) → token0=WMON, token1=gMON
  'uniswap-v3-mon-gmon': {
    address:     '0xb80d7a8F5331A907E34CD73f575c784B43E5acb5',
    token0:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token0Dec:   18, token0Sym: 'MON',
    token1:      '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081', // gMON 18 dec
    token1Dec:   18, token1Sym: 'gMON',
    fee:         100, tickSpacing: 1,
    wmonSide:    'token0',
  },
  // USDC (0x754...) < DUST (0xAD96...) → token0=USDC, token1=DUST
  'uniswap-v3-usdc-dust': {
    address:     '0xF98D134EF12E3D5DbcF986504B799999b7ded631',
    token0:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec:   6,  token0Sym: 'USDC',
    token1:      '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c', // DUST 18 dec
    token1Dec:   18, token1Sym: 'DUST',
    fee:         10000, tickSpacing: 200,
    wmonSide:    'none',
  },
  // ALLOCA (0x1ad7...) < WMON (0x3bd3...) → token0=ALLOCA, token1=WMON
  'uniswap-v3-alloca-mon': {
    address:     '0x1ED2F2057901BBEf02EFbC9928b113a15844A19a',
    token0:      '0x1ad7052bb331a0529c1981c3ec2bc4663498a110', // ALLOCA 18 dec
    token0Dec:   18, token0Sym: 'ALLOCA',
    token1:      '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON 18 dec
    token1Dec:   18, token1Sym: 'MON',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'token1',
  },
  // USDC (0x754...) < WETH (0xee8c...) → token0=USDC, token1=WETH
  'uniswap-v3-usdc-weth': {
    address:     '0x25EF1a210fF55BcEe9F8fee979aAFf6bD1bE5Bf1',
    token0:      '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec:   6,  token0Sym: 'USDC',
    token1:      '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', // WETH 18 dec
    token1Dec:   18, token1Sym: 'WETH',
    fee:         3000, tickSpacing: 60,
    wmonSide:    'none',
  },
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
  // AUSD (0x00000000eFE3...) < USDC (0x754704...) → currency0=AUSD
  'uniswap-v4-ausd-usdc': {
    poolId:    '0xd112fde908d7342135fc7297cc53d25bf7a11d6c6e21fe7ac3e73c40f70827e8',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 9, tickSpacing: 1, hasNative: false,
  },
  // native (0x00...00) < USDC (0x754704...) → currency0=native MON
  'uniswap-v4-mon-usdc': {
    poolId:    '0x18a9fc874581f3ba12b7898f80a683c66fd5877fd74b26a85ba9a3a79c549954',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 500, tickSpacing: 10, hasNative: true,
  },
  // AUSD (0x00000000eFE3...) < USDT0 (0xe7cd86...) → currency0=AUSD
  'uniswap-v4-ausd-usdt0': {
    poolId:    '0xe56868928b91fcd5ebeada3d0ec8767f2bbfeb1e7da181203d13f6af76b03bf9',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0',
    fee: 50, tickSpacing: 1, hasNative: false,
  },
  // USDC (0x754704...) < WETH (0xee8c0e...) → currency0=USDC
  'uniswap-v4-usdc-weth': {
    poolId:    '0xad408916c1c310da9c258d4c128a7bf50fd9edc42a218cc970da39cfc8a05d93',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 500, tickSpacing: 10, hasNative: false,
  },

  // ── New V4 pools (verified Apr 2026 via PoolKey hash computation) ────────────

  // AUSD (0x000000...) < USDC (0x754704...) → currency0=AUSD, fee=50 (0.005%)
  'uniswap-v4-ausd-usdc-2': {
    poolId:    '0x092b650478145f0aee73a1b400b342b9c6314db2e07aeb91faf7e75e8159ce72',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 50, tickSpacing: 1, hasNative: false,
  },
  // native (0x000...) < shMON (0x1b68...) → currency0=native MON
  'uniswap-v4-mon-shmon': {
    poolId:    '0x0a2eb246aac042fed4eeaf8bce78df3568cbe21701c969812702633085b8f771',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', c1Dec: 18, c1Sym: 'shMON',
    fee: 100, tickSpacing: 1, hasNative: true,
  },
  // native (0x000...) < WBTC (0x0555...) → currency0=native MON
  'uniswap-v4-mon-wbtc': {
    poolId:    '0x1c93dd2f2f47439330150bf728c3beeaad71de45420a49183214898b044b65d1',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // native (0x000...) < WETH (0xee8c...) → currency0=native MON
  'uniswap-v4-mon-weth': {
    poolId:    '0x3783b51e33900eb366a9e8473c76cda441e7170d2e5d96927f30c16a7add93aa',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // USDC (0x7547...) < USDT0 (0xe7cd...) → currency0=USDC, fee=20 (0.002%)
  'uniswap-v4-usdc-usdt0': {
    poolId:    '0x4ac1e6d2eeefa340e9e05ff0b67c0962b500fb7ab1bde4ace7a5ad631da2dc33',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', c1Dec: 6,  c1Sym: 'USDT0',
    fee: 20, tickSpacing: 1, hasNative: false,
  },
  // AUSD (0x0000...) < WBTC (0x0555...) → currency0=AUSD
  'uniswap-v4-ausd-wbtc': {
    poolId:    '0x6fed390faee91596851fdf2fa74c0f799d6bbe4f317b7d6ab16ef31fc974e4da',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c1Dec: 8,  c1Sym: 'WBTC',
    fee: 500, tickSpacing: 1, hasNative: false,
  },
  // USDC (0x7547...) < cbBTC (0xd18b...) → currency0=USDC
  'uniswap-v4-usdc-cbbtc': {
    poolId:    '0x7fc6232a9ec6cc4e9434640dcde5ee08ccae3b07de3247bf788fc9e2051b449e',
    currency0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c0Dec: 6,  c0Sym: 'USDC',
    currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // WBTC (0x0555...) < cbBTC (0xd18b...) → currency0=WBTC, fee=100 (0.01%)
  'uniswap-v4-wbtc-cbbtc': {
    poolId:    '0xab7e9e8e532098ef4802c25490136d4f84089dea5900b3bec6153561d17b37bd',
    currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',
    currency1: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', c1Dec: 8,  c1Sym: 'cbBTC',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // native (0x000...) < AUSD (0x0000...) → Wait, AUSD starts with 0x000000... so native(0x0) < AUSD(0x000000...)
  // 0x0000000000000000000000000000000000000000 < 0x00000000efe302beaa2b3e6e1b18d08d69a9012a → native=currency0
  'uniswap-v4-mon-ausd': {
    poolId:    '0xadaf30776f551bccdfb307c3fd8cdec198ca9a852434c8022ee32d1ccedd8219',
    currency0: '0x0000000000000000000000000000000000000000', c0Dec: 18, c0Sym: 'MON',
    currency1: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c1Dec: 6,  c1Sym: 'AUSD',
    fee: 500, tickSpacing: 1, hasNative: true,
  },
  // WBTC (0x0555...) < USDC (0x7547...) → currency0=WBTC
  'uniswap-v4-wbtc-usdc': {
    poolId:    '0xd77c0f253764f5d5fbc78e13888afcc35c839262e6b21cd02baa9d8551a9898a',
    currency0: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', c0Dec: 8,  c0Sym: 'WBTC',
    currency1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', c1Dec: 6,  c1Sym: 'USDC',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // AUSD (0x0000...) < XAUt0 (0x01bf...) → currency0=AUSD
  'uniswap-v4-ausd-xaut0': {
    poolId:    '0xe1a8600687e4d06ca4787e5d0ccdacb1d360bfc9ca6ca2a49a688e14d0ef37b4',
    currency0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', c0Dec: 6,  c0Sym: 'AUSD',
    currency1: '0x01bff41798a0bcf287b996046ca68b395dbc1071', c1Dec: 6,  c1Sym: 'XAUt0',
    fee: 500, tickSpacing: 10, hasNative: false,
  },
  // weETH (0xa3d6...) < WETH (0xee8c...) → currency0=weETH, fee=100 (0.01%)
  'uniswap-v4-weeth-weth': {
    poolId:    '0x2884b37c4a144e7047a1377ba7201d4b8ea318f0240369e01dc400f04e6cac40',
    currency0: '0xa3d68b74bf0528fdd07263c60d6488749044914b', c0Dec: 18, c0Sym: 'weETH',
    currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
  // wstETH (0x10ae...) < WETH (0xee8c...) → currency0=wstETH, fee=100 (0.01%)
  'uniswap-v4-wsteth-weth': {
    poolId:    '0x55d7ed991392eb9597a76a5f41dfb964e291452c15107c0e64fd3d25925394ce',
    currency0: '0x10aeaf63194db8d453d4d85a06e5efe1dd0b5417', c0Dec: 18, c0Sym: 'wstETH',
    currency1: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', c1Dec: 18, c1Sym: 'WETH',
    fee: 100, tickSpacing: 1, hasNative: false,
  },
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
  'uniswap-v2-dust-usdc': {
    address:   '0x86dbf00485871c901c5129bd525348db96c2eb2d',
    // V2 sorts by address: USDC 0x7547 < DUST 0xAD96 → token0=USDC, token1=DUST
    token0:    '0x754704bc059f8c67012fed69bc8a327a5aafb603', // USDC 6 dec
    token0Dec: 6,
    token0Sym: 'USDC',
    token1:    '0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c', // DUST 18 dec
    token1Dec: 18,
    token1Sym: 'DUST',
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
  'pancake-wmon-usdc-500':   { address: '0x63e48b725540a3db24acf6682a29f877808c53f2', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 500,  tickSpacing: 10, wmonSide: 'token0' },
  'pancake-ausd-wmon-500':   { address: '0xd5b70d70cbe6c42bcd1aaa662a21673a83f4615b', token0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', t0Dec: 6,  t0Sym: 'AUSD', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 500,  tickSpacing: 10, wmonSide: 'token1' },
  'pancake-wbtc-wmon-500':   { address: '0x0944526d2727b532653e6ca6c4d980461e170a09', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC', token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 500,  tickSpacing: 10, wmonSide: 'token1' },
  'pancake-wmon-weth-500':   { address: '0xb02793fe655c1169a8699b4ee462f8ac9c75e402', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'token0' },
  'pancake-apr-wmon-2500':   { address: '0x8506627b3362595f36ddf4d0df1f5c8940b052d0', token0: '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', t0Dec: 18, t0Sym: 'APR',  token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500, tickSpacing: 50, wmonSide: 'token1' },
  'pancake-wmon-cbtc-500':   { address: '0x614b85502b89540bb79be98d5429ec032a78a284', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t1Dec: 8,  t1Sym: 'cbBTC', fee: 500,  tickSpacing: 10, wmonSide: 'token0' },
  'pancake-lv-wmon-2500':    { address: '0x276664da3b25af7cd13eb4d3294d9840b60e5732', token0: '0x1001ff13bf368aa4fa85f21043648079f00e1001', t0Dec: 18, t0Sym: 'LV',   token1: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t1Dec: 18, t1Sym: 'MON',   fee: 2500, tickSpacing: 50, wmonSide: 'token1' },
  'pancake-wmon-cake-2500':  { address: '0x92c57d703941e29a2ece8688ebe228807daa880d', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0xf59d81cd43f620e722e07f9cb3f6e41b031017a3', t1Dec: 18, t1Sym: 'Cake',  fee: 2500, tickSpacing: 50, wmonSide: 'token0' },
  'pancake-wmon-usdc-2500':  { address: '0x85717a98d195c9306bbf7c9523ba71f044fea0f7', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 2500, tickSpacing: 50, wmonSide: 'token0' },
  'pancake-wmon-lvmon-2500': { address: '0xc59514136bdc9c0e735471cd650625ba0f5a634d', token0: '0x3bd359c1119da7da1d913d1c4d2b7c461115433a', t0Dec: 18, t0Sym: 'MON',  token1: '0x91b81bfbe3a747230f0529aa28d8b2bc898e6d56', t1Dec: 18, t1Sym: 'LVMON', fee: 2500, tickSpacing: 50, wmonSide: 'token0' },
  // ERC20-only pools (both tokens need approval)
  'pancake-ausd-usdt0-100':  { address: '0x3e9d111a71bbf5d1dff8ad444f2b3287c3f56145', token0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', t0Dec: 6,  t0Sym: 'AUSD',  token1: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', t1Dec: 6,  t1Sym: 'USDT0', fee: 100,  tickSpacing: 1,  wmonSide: 'none' },
  'pancake-wbtc-weth-500':   { address: '0xbad186a74e01eb666d069a45c9ba7b2acb3274ab', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancake-apr-usdc-2500':   { address: '0x834d94a041c40def1d05c579b422da42082e8555', token0: '0x0a332311633c0625f63cfc51ee33fc49826e0a3c', t0Dec: 18, t0Sym: 'APR',   token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 2500, tickSpacing: 50, wmonSide: 'none' },
  'pancake-ausd-usdc-100':   { address: '0xe84765b4e2634f3bd8a91c89e432f6b81f0647bc', token0: '0x00000000efe302beaa2b3e6e1b18d08d69a9012a', t0Dec: 6,  t0Sym: 'AUSD',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 100,  tickSpacing: 1,  wmonSide: 'none' },
  'pancake-wbtc-usdc-500':   { address: '0x9b60e561e3ab15782fbb23ea0a766dd8d91ff8ac', token0: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', t0Dec: 8,  t0Sym: 'WBTC',  token1: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t1Dec: 6,  t1Sym: 'USDC',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancake-cbtc-weth-500':   { address: '0xca50b90382eed621b193fe8282f90b2f3a181d03', token0: '0xd18b7ec58cdf4876f6afebd3ed1730e4ce10414b', t0Dec: 8,  t0Sym: 'cbBTC', token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancake-xaut0-usdt0-500': { address: '0xa5c3a55af4029724f519ac8d340be9916ac83e45', token0: '0x01bff41798a0bcf287b996046ca68b395dbc1071', t0Dec: 6,  t0Sym: 'XAUt0', token1: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', t1Dec: 6,  t1Sym: 'USDT0', fee: 500,  tickSpacing: 10, wmonSide: 'none' },
  'pancake-usdc-weth-500':   { address: '0xe5bf0f773740a48cda56b8df37e0dc182f377139', token0: '0x754704bc059f8c67012fed69bc8a327a5aafb603', t0Dec: 6,  t0Sym: 'USDC',  token1: '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242', t1Dec: 18, t1Sym: 'WETH',  fee: 500,  tickSpacing: 10, wmonSide: 'none' },
}
