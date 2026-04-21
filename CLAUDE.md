# Monatrix — Project Context for Claude Code

## Project Vision

Build the first **Yield & LP Aggregator on Monad EVM** — a unified platform where users
can discover, compare, and interact with every yield opportunity across Monad DeFi in one place.

**Three core problems we solve:**
- **Fragmented UX** — users jumping between protocols with no unified view
- **Blind PnL** — no real-time visibility into actual earnings, fees, and impermanent loss
- **No guidance** — new users don't know which pool fits their risk profile

**Product roadmap:**
```
v1 — Aggregator:  discover + compare all yield pools in one dashboard + one-click deposit
v2 — AI Guide:    AI explains pools, recommends based on user risk profile
v3 — Agentic:     AI agent auto-executes and compounds yield 24/7 (post-grant)
```

**⚠️ v2 Technical Upgrade — Zap Contract (đừng quên)**
```
Hiện tại (v1): swap + deposit dùng sequential transactions (3-4 wallet popups)
  → Không atomic: nếu bước giữa fail, user bị kẹt với token sai vị trí
  → Acceptable cho v1 MVP nhưng không phải production standard

Cần upgrade lên Zap/Router contract ở v2:
  → User approve 1 lần → Zap contract tự xử lý swap + deposit trong 1 tx
  → Atomic: all-or-nothing, không bao giờ kẹt giữa chừng
  → Đây là cách tất cả legit aggregators làm (Yearn ZapIn, 1inch Router, Uniswap UniversalRouter)
  → Kamino (Solana) dùng single tx với multiple instructions — tương đương về UX

Để build Zap contract:
  1. Viết Solidity contract: receive MON → swap via Uniswap V3 → deposit vào protocol → return shares to user
  2. Audit contract trước khi deploy (bắt buộc — contract nắm tiền của user)
  3. Deploy trên Monad mainnet
  4. Hardcode Zap contract address vào lib/contracts.ts (cùng security model)
  5. Cập nhật DepositModal để dùng Zap thay vì sequential flow
```

**v1 Build Phases:**
```
Phase 1 — Data Layer          ✅ DONE
          76 pools, 10 adapters, cron job every 4h, pool table UI

Phase 2 — Deposit Feature     ← ĐANG LÀM TIẾP THEO
          User deposit thẳng từ Monatrix vào protocol pools (không rời app)
          Không cần custom smart contract — frontend gọi thẳng protocol contracts
          Thứ tự: Liquid Staking → Lending → Borrowing → LP

Phase 3 — Portfolio Tracking
          Đọc on-chain balance receipt tokens (gMON, aUSDC, shares...)
          Tính earned yield + PnL
          Lưu deposit history vào Supabase theo wallet address

Phase 4 — Production Ready
          1. WalletConnect project ID (cloud.walletconnect.com)
          2. Vercel deployment + env vars
          3. Vercel Cron Jobs (vercel.json, tự động /api/cron mỗi 4h)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) + Tailwind CSS + shadcn/ui |
| Wallet | wagmi v2 + viem |
| AI Engine | TBA |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel — hiện tại localhost:3002 |
| Chain | Monad mainnet |

---

## Monad Network Info

```
Network Name:  Monad Mainnet
Chain ID:      143
RPC URL:       https://rpc.monad.xyz  (QuickNode, 25 rps)
               https://rpc1.monad.xyz (Alchemy, 15 rps)
               https://rpc2.monad.xyz (Goldsky Edge, 300/10s, historical state ✅)
               https://rpc3.monad.xyz (Ankr, 300/10s)
Currency:      MON
Explorer:      https://monadexplorer.com / https://monadscan.com
```

**Key Canonical Contracts:**
```
WMON:       0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
Multicall3: 0xcA11bde05977b3631167028862bE2a173976CA11
Permit2:    0x000000000022d473030f116ddee9f6b43ac78ba3
```

**Critical:** Always include Multicall3 in viem chain config or calls fail silently:
```typescript
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' }
  }
})
```

---

## What We Learned from the Failed v1 Build

```
❌ Do NOT use Goldsky subgraph for general Monad protocols — returns empty data
❌ Do NOT use The Graph — does not support Monad
❌ Do NOT add mock/fallback data — if fetch fails, return [] and log the error
❌ Do NOT add multiple pools at once — verify one pool fully before adding the next
❌ Do NOT use insert() — always use upsert() with onConflict: 'id'
❌ Do NOT generate pool id with randomUUID() — id must be deterministic (e.g. 'clober-mon-usdc')
❌ Do NOT compute Clober APY from subgraph volume — double-counts CLOB trades, use DefiLlama

✅ Verify data source returns real data BEFORE writing any adapter code
✅ One protocol at a time — fully working before moving to next
✅ Cross-check adapter output against protocol's own UI before shipping
✅ If fetch fails → throw error, let cron job log it, never save fake data
✅ Always filter by recency — check if latest data is within 2 days, else APY = 0
```

**Monad infrastructure gaps (as of early 2026):**
- Public RPC `getLogs`: 100 block limit — cannot scan history
- Event-based TVL indexing is NOT viable without a dedicated indexer
- Goldsky subgraph ONLY works for protocols that deployed their own subgraph

**What works on Monad:**
- Protocol public APIs (e.g. Kuru: `api.kuru.io`)
- Direct contract calls: `balanceOf`, `totalAssets`, `getReserves`
- DefiLlama `yields.llama.fi/pools` — reliable APY source for LST protocols

---

## Core Build Philosophy — One Pool at a Time

Do NOT build adapters for all protocols at once. Follow this sequence for every new pool:

```
Step 1: Verify data source in terminal (curl/query) — confirm real data exists
Step 2: Write adapter for this pool only
Step 3: Trigger cron, check console logs
Step 4: Cross-check output against protocol's own UI
Step 5: If numbers match → confirm data saved in Supabase
Step 6: Only then move to next pool
```

---

## v1 Deposit Architecture

**Flow:**
```
User → Monatrix UI → Click Deposit
  → wallet popup: approve token (nếu ERC20)
  → wallet popup: deposit vào protocol contract
  → funds nằm trong protocol pool
  → user nhận receipt token (gMON, aUSDC, shares...)
```

**Không cần build smart contract riêng.** Frontend (wagmi/viem) gọi thẳng contract của protocol.
Tiền không đi qua bất kỳ Monatrix contract nào.

**Contract addresses → hardcode trong `lib/contracts.ts`** (KHÔNG lưu vào DB).
Xem Case Study Kamino bên dưới để hiểu lý do.

**Deposit by pool type:**
| Type | Flow | Số tx |
|------|------|-------|
| Liquid staking (Magma, Fastlane, Kintsu) | Send native MON → nhận LST | 1 tx |
| ERC4626 lending (Morpho) | approve + deposit | 2 tx |
| Aave V3 (Neverland) | approve + supply | 2 tx |
| Curvance | approve + deposit | 2 tx |
| Borrowing | deposit collateral → borrow | phức tạp hơn |
| LP (Clober, Kuru, Uniswap) | approve 2 tokens + add liquidity | phức tạp nhất |

---

## Case Study: Kamino Finance — Contract Address Management

**Tại sao study Kamino:** Yield aggregator lớn nhất Solana, cùng product category.

**Kết luận:**
- Program IDs (= contract addresses trên EVM) → **hardcode trong code/SDK**, KHÔNG bao giờ từ DB
- Known market addresses → **hardcode constants**, documented rõ
- Dynamic vault discovery (LP) → fetch on-chain nếu cần, không list cứng

**Tại sao KHÔNG dùng DB cho contract addresses:**
- Contract addresses là immutable on-chain facts
- Nếu lấy từ DB → attack vector: kẻ tấn công swap address → user deposit vào contract độc hại → mất tiền
- Hardcode = type-safe, auditable, không có runtime mutation risk

**Áp dụng vào Monatrix:** `lib/contracts.ts` hardcode tất cả protocol contract addresses.

---

## Protocols Tracking

**Status:** 🔴 Not started · 🟡 In progress · 🟢 Live

### LP Pools
| Protocol | Pools | Data Source | Status |
|----------|-------|-------------|--------|
| Clober | MON/USDC, WETH/USDC, WBTC/USDC | Goldsky subgraph + DefiLlama APY | 🟢 Live |
| Kuru | MON/USDC, AUSD/USDC + vaults | REST API + RPC | 🟢 Live |
| Uniswap | 5 pools (v2/v3/v4) | GeckoTerminal | 🟢 Live |
| PancakeSwap | 18 pools | GeckoTerminal multi endpoint (2×9 batch) | 🟢 Live |

### Lending / Borrowing
| Protocol | Assets | Data Source | Status |
|----------|--------|-------------|--------|
| Morpho | 9 vaults (USDC, AUSD, WETH, WMON...) | api.morpho.org/graphql | 🟢 Live |
| Neverland | 11 lending + 6 borrowing (Aave V3 fork) | viem multicall | 🟢 Live |
| Curvance | ~13 pairs lending + borrowing | viem multicall | 🟢 Live |

### Liquid Staking
| Protocol | Asset | Data Source | Status |
|----------|-------|-------------|--------|
| Magma | MON → gMON | DefiLlama + on-chain totalAssets() | 🟢 Live |
| Fastlane | MON → shMON | DefiLlama + on-chain totalAssets() | 🟢 Live |
| Kintsu | MON → sMON | DefiLlama + on-chain totalPooled() | 🟢 Live |
| Apriori | MON → aprMON | — | 🔴 Not started |

---

## Adapter Details

### Clober
- **Data:** Goldsky subgraph (TVL + vol24h) + DefiLlama pool `286a2273-...` (APY)
- **APY source: DefiLlama** — 30-day rolling avg, matches Clober UI exactly (93%)
- ❌ Do NOT compute APY from subgraph volume — double-counts CLOB trades → 162% vs actual 93%
- **File:** `lib/adapters/clober.ts`

### Kuru
- **Data:** `api.kuru.io/api/v1/markets` + on-chain `totalAssets()` trên each vault
- **MON price:** từ highest-volume MON/USDC market `lastPrice`
- **APR:** không tính được (volume24h là market-wide, không tách được vault portion)
- **File:** `lib/adapters/kuru.ts`

### Morpho
- **Data:** `api.morpho.org/graphql` — chỉ lấy vaults có `listed: true`
- **File:** `lib/adapters/morpho.ts`

### Neverland (Aave V3 fork)
- **Contracts:** PoolDataProvider `0xfd0b6b6f...`, PriceOracle `0x94bba110...`
- **DUST rewards:** DustRewardsController `0x57ea245c...`, price từ USDC/DUST V2 pool
- **11 reserves:** USDC, WMON, USDT0, WBTC, WETH, AUSD, sMON, shMON, gMON, earnAUSD, loAZND
- **6 borrowable:** USDC, WMON, USDT0, WBTC, WETH, AUSD
- **File:** `lib/adapters/neverland.ts`

### Curvance
- **Data:** viem multicall — đọc trực tiếp từ các CToken contracts
- **File:** `lib/adapters/curvance.ts`

### Magma / Fastlane / Kintsu (Liquid Staking)
- **APY + TVL:** DefiLlama `yields.llama.fi/pools`
- **On-chain cross-check:** `totalAssets()` (Magma, Fastlane) hoặc `totalPooled()` (Kintsu — uint96, NOT ERC4626)
- **DefiLlama UUIDs:**
  - Magma gMON: `96f74061-dc9a-4ef7-8117-6cd3935230de`
  - Fastlane shMON: `ee40513c-9356-4c53-9f26-446b484a8ae2`
  - Kintsu sMON: `73c511a9-4dc0-4397-babe-e578fd75f0dd`
- **Contract addresses:**
  - Magma gMON: `0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081`
  - Fastlane shMON: `0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c`
  - Kintsu sMON: `0xA3227C5969757783154C60bF0bC1944180ed81B9`

---

## Data Schema

```typescript
// Pool types in DB: 'lending' | 'borrowing' | 'staking' | 'liquid_staking' | 'lp'

interface BasePool {
  id: string           // deterministic: 'protocol-token0-token1'
  protocol: string
  type: string
  tvl: number
  risk_score: number   // 1-4 (lib/risk.ts)
  updated_at: string
}

interface LendingPool extends BasePool {
  type: 'lending' | 'borrowing'
  asset: string
  apy: number
  utilization: number
}

interface LiquidStakingPool extends BasePool {
  type: 'liquid_staking'
  asset: string
  apy: number
  lock_period: number | null
}

interface LPPool extends BasePool {
  type: 'lp'
  token0: string; token1: string
  fee_tier: number; fee_apr: number; reward_apr: number; total_apr: number
  in_range: boolean; il_risk: 'low' | 'medium' | 'high'
}
```

---

## Supabase Schema

```sql
create table pools (
  id text primary key,
  protocol text not null,
  type text not null check (type in ('lending','borrowing','staking','liquid_staking','lp')),
  tvl numeric, risk_score numeric,
  asset text, apy numeric, utilization numeric, lock_period integer,
  token0 text, token1 text, fee_tier numeric, fee_apr numeric,
  reward_apr numeric, total_apr numeric, in_range boolean, il_risk text,
  updated_at timestamptz default now()
);
```

**Upsert — always:**
```typescript
await supabaseAdmin.from('pools').upsert(rows, { onConflict: 'id' })
```

---

## Folder Structure

```
/
├── CLAUDE.md
├── app/
│   ├── page.tsx                    ← pool discovery UI
│   ├── portfolio/page.tsx          ← user positions + PnL (Phase 3)
│   └── api/
│       ├── pools/route.ts          ← GET pools from Supabase
│       └── cron/route.ts           ← every 4h refresh (10 adapters)
├── lib/
│   ├── wagmi.ts                    ← Monad chain config + Multicall3
│   ├── supabase.ts                 ← Supabase client
│   ├── normalize.ts                ← Pool → DB row mapping
│   ├── risk.ts                     ← Risk scoring 1-4
│   ├── contracts.ts                ← (Phase 2) protocol contract addresses + ABIs
│   └── adapters/
│       ├── clober.ts   kuru.ts   uniswap.ts        ← LP
│       ├── morpho.ts   neverland.ts   curvance.ts   ← Lending/Borrowing
│       └── magma.ts   fastlane.ts   kintsu.ts       ← Liquid Staking
├── components/
│   ├── PoolTable.tsx               ← sortable pool list
│   ├── DepositModal.tsx            ← (Phase 2) deposit UI
│   └── ...
└── types/index.ts
```

---

## Environment Variables (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://nzrvyxmswtujltwnmuic.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
MONAD_RPC_URL=https://rpc.monad.xyz
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
CRON_SECRET=change-me-to-a-random-secret
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=        ← cần set trước Phase 4
```

## Dev Commands

```bash
npm run dev    # starts on http://localhost:3002
npm run build  # production build check

# Trigger cron manually:
curl -X GET http://localhost:3002/api/cron -H "x-cron-secret: change-me-to-a-random-secret"
```

---

## Coding Conventions

- TypeScript strict mode
- Each adapter exports: `fetch[Protocol]Pools(): Promise<Pool[]>`
- On error: throw — never return mock/fake data
- Pool `id` must be deterministic: `'clober-mon-usdc'`, `'kintsu-smon'`
- TVL: full precision — use `Number(string)`, never `parseFloat().toFixed()`
- Logging prefix: `[Clober]`, `[Kuru]`, `[Cron]` etc.
- Comments in English
