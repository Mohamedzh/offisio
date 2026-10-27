-- Offisio schema (Neon Postgres). Run with the DIRECT connection string
-- (DATABASE_URL_UNPOOLED, no -pooler) per migration guidance.
-- App runtime uses the pooled DATABASE_URL. See docs/DESIGN.md §3.
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null check (kind in ('furnished','semifinished')),
  status text not null default 'ready',
  district text not null, rent_egp int not null, daily_egp int,
  floor_text text, available_from date,
  rent_periods text[] not null default '{}', -- daily|monthly|long_term (3-track catalog)
  title_ar text, title_en text, summary_ar text, summary_en text,
  highlights_ar jsonb not null default '[]', highlights_en jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create table if not exists specs (
  unit_id uuid primary key references units(id) on delete cascade,
  data jsonb not null, model text not null, created_at timestamptz not null default now()
);
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  kind text not null, style text, url text not null,
  is_current boolean not null default true, meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  is_booked boolean not null default false,
  unique (unit_id, starts_at)
);
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id),
  availability_ids uuid[] not null default '{}',
  track text not null check (track in ('daily','monthly','long_term')),
  renter_name text not null, renter_phone text not null, -- PII: muse-spark-1.3 only
  rent_egp_total int not null, total_egp int not null,
  status text not null default 'awaiting_payment', -- confirmed only on verified payment webhook
  created_via text not null default 'chat',
  created_at timestamptz not null default now()
);
create table if not exists booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  item_id text not null, name_ar text not null, name_en text not null,
  qty int not null, unit_price_egp int not null, deliver_at timestamptz,
  cafe_status text not null default 'pending_cafe', -- sent_to_cafe via WhatsApp line
  created_at timestamptz not null default now()
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  provider text not null default 'paymob',
  paymob_order_id text, amount_cents int not null,
  status text not null default 'pending', -- pending|success|failed (webhook-driven)
  raw jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text unique,
  unit_id uuid references units(id),
  messages jsonb not null default '[]', tool_calls jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_media_unit_kind on media(unit_id, kind);
create index if not exists idx_avail_open on availability(unit_id, starts_at) where not is_booked;
create index if not exists idx_units_status on units(status);
