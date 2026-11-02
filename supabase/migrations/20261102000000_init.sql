-- ═══════════════════════════════════════════════════════════════════════
-- GrowVibe CRM · Fase 1 · esquema base
-- Todo vive en el esquema "growvibe" para no tocar "public" (lo usa otra app).
-- Se puede pegar completo en el SQL Editor de Supabase. Corre en una transacción:
-- si algo falla, no se aplica nada.
-- ═══════════════════════════════════════════════════════════════════════

begin;

create schema if not exists growvibe;

create type growvibe.lead_status as enum ('nuevo','calificado','descartado','contactado','respondio','interesado','no_interesado','baja');
create type growvibe.channel as enum ('whatsapp','email');

-- Solo los usuarios de auth con fila aquí pueden usar GrowVibe.
-- (auth.users es compartido con la otra app: NO hay trigger automático.)
create table growvibe.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'vendedor' check (role in ('admin','vendedor'))
);

create table growvibe.campaigns (
  id uuid primary key default gen_random_uuid(),
  zone text not null,
  service text not null,
  zone_bounds jsonb,
  niches jsonb,
  queries jsonb,
  channels growvibe.channel[] not null default '{whatsapp,email}',
  status text not null default 'borrador'
    check (status in ('borrador','buscando','lista','enviando','pausada','terminada')),
  created_by uuid references growvibe.profiles,
  created_at timestamptz default now()
);

create table growvibe.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references growvibe.campaigns on delete cascade,
  place_id text not null,
  name text not null,
  niche text,
  address text,
  phone_e164 text,
  has_whatsapp boolean,
  whatsapp_jid text,
  email text,
  website text,
  rating numeric,
  reviews_count int,
  maps_url text,
  score int check (score between 0 and 100),
  score_reason text,
  status growvibe.lead_status not null default 'nuevo',
  assigned_to uuid references growvibe.profiles,
  created_at timestamptz default now(),
  unique (campaign_id, place_id)
);
create index on growvibe.leads (phone_e164);
create index on growvibe.leads (email);
create index on growvibe.leads (assigned_to);

create table growvibe.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references growvibe.leads on delete cascade,
  channel growvibe.channel not null,
  direction text not null check (direction in ('out','in')),
  subject text,
  body text not null,
  status text not null default 'en_cola'
    check (status in ('en_cola','enviado','entregado','leido','fallido','recibido','cancelado')),
  provider_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  classification text
    check (classification is null or classification in ('interesado','no_interesado','pregunta','baja','otro')),
  created_at timestamptz default now()
);
create index on growvibe.messages (lead_id);
create index on growvibe.messages (provider_id);
create index on growvibe.messages (status, scheduled_for);

create table growvibe.opt_outs (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text,
  email text,
  reason text,
  created_at timestamptz default now(),
  check (phone_e164 is not null or email is not null)
);
create index on growvibe.opt_outs (phone_e164);
create index on growvibe.opt_outs (email);

create table growvibe.settings (
  id int primary key default 1 check (id = 1),
  whatsapp_daily_limit int not null default 20,
  email_daily_limit int not null default 100,
  send_window_start time not null default '09:00',
  send_window_end time not null default '19:00',
  send_days int[] not null default '{1,2,3,4,5}',
  min_delay_seconds int not null default 60,
  max_delay_seconds int not null default 180,
  warmup_enabled boolean not null default true,
  sender_signature text,
  privacy_url text
);
insert into growvibe.settings (id) values (1);

create table growvibe.events (
  id bigserial primary key,
  lead_id uuid references growvibe.leads on delete cascade,
  type text not null,
  data jsonb,
  created_at timestamptz default now()
);
create index on growvibe.events (lead_id, created_at);

-- ───────────── Funciones de rol ─────────────

-- Rol del usuario actual en GrowVibe; null si es un usuario de la otra app.
create function growvibe.my_role()
returns text
language sql stable
security definer set search_path = ''
as $$
  select role from growvibe.profiles where id = auth.uid();
$$;

create function growvibe.is_admin()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select coalesce(growvibe.my_role() = 'admin', false);
$$;

create function growvibe.is_member()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select growvibe.my_role() is not null;
$$;

-- ───────────── RLS ─────────────
-- Usuarios de la otra app (sin perfil en growvibe.profiles) no ven nada.
-- Admin: todo. Vendedor: lee y edita/responde solo los leads asignados a él.

alter table growvibe.profiles  enable row level security;
alter table growvibe.campaigns enable row level security;
alter table growvibe.leads     enable row level security;
alter table growvibe.messages  enable row level security;
alter table growvibe.opt_outs  enable row level security;
alter table growvibe.settings  enable row level security;
alter table growvibe.events    enable row level security;

create policy profiles_select on growvibe.profiles for select to authenticated using (growvibe.is_member());
create policy profiles_admin  on growvibe.profiles for all    to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());

create policy campaigns_select on growvibe.campaigns for select to authenticated using (growvibe.is_member());
create policy campaigns_admin  on growvibe.campaigns for all    to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());

create policy leads_select   on growvibe.leads for select to authenticated using (growvibe.is_member());
create policy leads_admin    on growvibe.leads for all    to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());
create policy leads_vendedor on growvibe.leads for update to authenticated
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

create policy messages_select   on growvibe.messages for select to authenticated using (growvibe.is_member());
create policy messages_admin    on growvibe.messages for all    to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());
create policy messages_vendedor on growvibe.messages for insert to authenticated
  with check (exists (select 1 from growvibe.leads l where l.id = lead_id and l.assigned_to = auth.uid()));

create policy events_select   on growvibe.events for select to authenticated using (growvibe.is_member());
create policy events_admin    on growvibe.events for all    to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());
create policy events_vendedor on growvibe.events for insert to authenticated
  with check (exists (select 1 from growvibe.leads l where l.id = lead_id and l.assigned_to = auth.uid()));

create policy settings_admin on growvibe.settings for all to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());
create policy opt_outs_admin on growvibe.opt_outs for all to authenticated using (growvibe.is_admin()) with check (growvibe.is_admin());

-- ───────────── Permisos para la API (PostgREST) ─────────────
-- anon no recibe nada: las rutas públicas (/u/[token], webhooks) usan service_role en el servidor.

grant usage on schema growvibe to authenticated, service_role;
grant select, insert, update, delete on all tables in schema growvibe to authenticated, service_role;
grant usage, select on all sequences in schema growvibe to authenticated, service_role;
grant execute on all functions in schema growvibe to authenticated, service_role;
revoke execute on all functions in schema growvibe from anon, public;

alter default privileges in schema growvibe grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema growvibe grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema growvibe grant execute on functions to authenticated, service_role;

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table growvibe.campaigns, growvibe.leads, growvibe.messages;

commit;
