-- ============================================================
-- MiParqueo · esquema inicial (Supabase / PostgreSQL)
-- Ejecutar en: Supabase → SQL Editor → New query → pegar y correr
-- ============================================================

-- ---------- Tablas ----------

create table public.zonas (
  id             text primary key,               -- 'a1', 'b1', 'pg'
  nombre         text not null,
  referencia     text,
  capacidad      int  not null check (capacidad > 0),
  ocupados       int  not null default 0 check (ocupados >= 0),
  actualizado_en timestamptz not null default now(),
  constraint ocupados_no_excede check (ocupados <= capacidad)
);

create table public.vehiculos (
  id                 uuid primary key default gen_random_uuid(),
  placa              text not null unique,
  nombre_propietario text not null,
  correo             text not null,
  tipo               text not null default 'estudiante'
                     check (tipo in ('estudiante','docente','administrativo','visitante')),
  creado_en          timestamptz not null default now(),
  -- Ajustar el dominio si el correo institucional es otro
  constraint correo_institucional check (correo ~* '@(ce\.)?pucmm\.edu\.do$')
);

create table public.eventos (
  id          bigint generated always as identity primary key,
  zona_id     text not null references public.zonas(id),
  placa       text,
  tipo        text not null check (tipo in ('entrada','salida')),
  ocurrido_en timestamptz not null default now()
);

create table public.incidencias (
  id          bigint generated always as identity primary key,
  zona_id     text references public.zonas(id),
  descripcion text not null,
  foto_url    text,
  estado      text not null default 'abierta'
              check (estado in ('abierta','en_proceso','resuelta')),
  creado_en   timestamptz not null default now()
);

-- ---------- Ocupación automática ----------
-- Cada evento de entrada/salida actualiza la zona; el frontend
-- nunca escribe la ocupación directamente.

create or replace function public.aplicar_evento()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.zonas
     set ocupados = greatest(0, least(capacidad,
                    ocupados + case when new.tipo = 'entrada' then 1 else -1 end)),
         actualizado_en = now()
   where id = new.zona_id;
  return new;
end;
$$;

create trigger trg_aplicar_evento
after insert on public.eventos
for each row execute function public.aplicar_evento();

-- ---------- Tiempo real ----------
-- Publica los cambios de zonas para que el frontend los reciba al instante.

alter publication supabase_realtime add table public.zonas;

-- ---------- Seguridad (RLS) ----------

alter table public.zonas       enable row level security;
alter table public.vehiculos   enable row level security;
alter table public.eventos     enable row level security;
alter table public.incidencias enable row level security;

-- Cualquiera puede consultar la disponibilidad (es el propósito de la app).
create policy "lectura publica de zonas"
  on public.zonas for select
  using (true);

-- Usuarios autenticados registran su vehículo y reportan incidencias.
create policy "registrar vehiculo"
  on public.vehiculos for insert
  to authenticated
  with check (true);

create policy "crear incidencia"
  on public.incidencias for insert
  to authenticated
  with check (true);

-- eventos: sin políticas para anon/authenticated a propósito.
-- Solo las casetas (con la clave service_role, del lado del servidor)
-- pueden insertar entradas y salidas.

-- ---------- Datos iniciales ----------

insert into public.zonas (id, nombre, referencia, capacidad, ocupados) values
  ('a1', 'Zona A1',  'Junto a aulas y biblioteca',                 120, 64),
  ('b1', 'Zona B1',  'Entrada principal, frente a administración',  90, 74),
  ('pg', 'Posgrado', 'Edificio de posgrado, acceso posterior',      45, 45);
