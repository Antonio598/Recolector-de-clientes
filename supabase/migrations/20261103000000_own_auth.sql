-- GrowVibe CRM · login propio (sin Supabase Auth ni su API).
-- La app se conecta directo a Postgres con DATABASE_URL, como la otra app del servidor.
-- Los usuarios y sus contraseñas (bcrypt) viven en growvibe.profiles; las sesiones en growvibe.sessions.
-- Los permisos por rol se aplican en el código del servidor.

begin;

alter table growvibe.profiles drop constraint if exists profiles_id_fkey;
alter table growvibe.profiles alter column id set default gen_random_uuid();
alter table growvibe.profiles
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists created_at timestamptz not null default now();

-- Trae email y hash bcrypt de los usuarios que se crearon en Supabase Auth.
update growvibe.profiles p
set email = u.email, password_hash = u.encrypted_password
from auth.users u
where u.id = p.id and p.email is null;

alter table growvibe.profiles
  alter column email set not null,
  alter column password_hash set not null;
create unique index if not exists profiles_email_key on growvibe.profiles (lower(email));

create table if not exists growvibe.sessions (
  id text primary key,                 -- sha256 del token de la cookie
  user_id uuid not null references growvibe.profiles on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on growvibe.sessions (user_id);

-- La app se conecta como "postgres" (DATABASE_URL); el SQL Editor crea las tablas como supabase_admin.
grant usage on schema growvibe to postgres;
grant select, insert, update, delete on all tables in schema growvibe to postgres;
grant usage, select on all sequences in schema growvibe to postgres;

commit;

-- Verificación: debe mostrar tu email con role = admin y hash que empieza con $2
select email, role, left(password_hash, 4) as hash from growvibe.profiles;
