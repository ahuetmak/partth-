-- ============================================================
-- PARTTH — Supabase Schema
-- ============================================================

-- ── clients ─────────────────────────────────────────────────
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  email         text,
  phone         text,
  city          text,
  service       text,
  message       text,
  source        text,
  created_at    timestamptz default now()
);

alter table public.clients enable row level security;

-- NOTE: These permissive policies allow anon users to insert and read all rows.
-- For production, migrate to an Edge Function using service_role so client
-- data is never exposed via the public API. See AUDITORIA-SETUP.md.
create policy "clients_anon_insert" on public.clients
  for insert to anon with check (true);

create policy "clients_anon_select" on public.clients
  for select to anon using (true);

create policy "clients_anon_update" on public.clients
  for update to anon using (true) with check (true);

-- ── intent_conversations ─────────────────────────────────────
create table if not exists public.intent_conversations (
  id            uuid primary key default gen_random_uuid(),
  session_id    text,
  email         text,
  intent        text,
  metadata      jsonb,
  created_at    timestamptz default now()
);

alter table public.intent_conversations enable row level security;

-- Allow anonymous inserts (email CTA capture)
create policy "public_insert" on public.intent_conversations
  for insert to anon with check (true);

-- ── projects ─────────────────────────────────────────────────
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  city          text,
  service       text,
  description   text,
  status        text default 'open',
  client_id     uuid references public.clients(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.projects enable row level security;

create policy "projects_anon_select" on public.projects
  for select to anon using (status = 'open');

-- ── payments ─────────────────────────────────────────────────
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  paypal_order_id text unique,
  paypal_capture_id text,
  type            text,          -- 'commitment' | 'essential' | 'professional'
  amount          numeric(10, 2),
  currency        text default 'USD',
  status          text default 'pending',
  client_id       uuid references public.clients(id),
  metadata        jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.payments enable row level security;

-- ── system_activity_log ──────────────────────────────────────
create table if not exists public.system_activity_log (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,
  source      text,
  payload     jsonb,
  created_at  timestamptz default now()
);

alter table public.system_activity_log enable row level security;

-- Only service_role can read/write activity log
create policy "log_service_only" on public.system_activity_log
  for all to service_role using (true) with check (true);
