-- ============================================================
-- MiParqueo · compatibilidad con un PostgreSQL cualquiera
--
-- NO CORRER ESTE ARCHIVO EN SUPABASE. Allí todo esto ya existe.
--
-- Supabase añade a PostgreSQL unas piezas propias que el esquema
-- de MiParqueo usa: el esquema `auth` (usuarios y auth.uid()),
-- el esquema `storage` (fotos de evidencia), los roles `anon` y
-- `authenticated`, y la publicación de tiempo real.
--
-- Este archivo crea versiones mínimas de esas piezas para que
-- 0001_esquema_inicial.sql se pueda ejecutar y probar en
-- cualquier PostgreSQL: uno local, uno de la universidad, o el
-- de otro proveedor. Sirve para validar el modelo y para
-- entregar la base de datos sin atarla a Supabase.
-- ============================================================

-- ---------- Roles que Supabase trae de fábrica ----------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- ---------- Esquema auth ----------
create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique not null,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- En Supabase devuelve el id del usuario del token JWT. Aquí se
-- toma de una variable de sesión que se puede fijar en las pruebas:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ---------- Esquema storage ----------
create schema if not exists storage;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text not null,
  owner     uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- ---------- Publicación de tiempo real ----------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- ---------- Permisos ----------
-- En Supabase estos permisos vienen dados. Aquí hay que concederlos a mano.
-- Como este archivo se ejecuta ANTES del esquema, se usan privilegios por
-- defecto para que apliquen también a las tablas que se creen después.
grant usage on schema public, auth, storage to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- Y a lo que ya existiera, por si se corre en cualquier orden.
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
