-- Monatrix — full schema
-- Run this once to set up (or re-run safely: all statements are idempotent)

create table if not exists pools (
  id             text primary key,
  protocol       text not null,
  type           text not null check (type in ('lending', 'borrowing', 'staking', 'liquid_staking', 'lp')),
  tvl            numeric,
  volume_24h     numeric default 0,
  risk_score     numeric,
  -- lending + staking
  asset          text,
  apy            numeric,
  utilization    numeric,
  lock_period    integer,
  -- lp only
  token0         text,
  token1         text,
  fee_tier       numeric,
  fee_apr        numeric,
  reward_apr     numeric,
  total_apr      numeric,
  in_range       boolean,
  il_risk        text,
  updated_at     timestamptz default now()
);

create index if not exists pools_type_apr  on pools (type, total_apr desc nulls last);
create index if not exists pools_updated   on pools (updated_at desc);

-- Add volume_24h to existing table if upgrading from an older schema
alter table pools add column if not exists volume_24h numeric default 0;

-- Add status column for pool availability (active | full)
alter table pools add column if not exists status text default 'active';

-- Add exchange_rate for tracking LST rate over time (used to compute APY for protocols
-- not listed on DefiLlama, e.g. Apriori aprMON: convertToAssets(1e18) stored here)
alter table pools add column if not exists exchange_rate numeric;
