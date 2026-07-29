-- ============================================================
-- MiParqueo · esquema completo (Supabase / PostgreSQL)
--
-- Ejecutar en: Supabase -> SQL Editor -> New query -> pegar y correr.
-- Crea todo desde cero: tablas, espacios numerados, reglas de
-- negocio, seguridad por filas y datos iniciales.
--
-- Modelo en una frase: cada zona tiene espacios numerados; un
-- usuario solicita uno y se le asigna por 6 horas prorrogables;
-- si alguien le ocupa el espacio lo reporta con foto y un
-- administrador decide si ese reporte se convierte en strike.
-- ============================================================


-- ============================================================
-- 1. PERFILES  (extiende auth.users)
-- ============================================================

create table public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text not null,
  correo    text not null,
  tipo      text not null default 'estudiante'
            check (tipo in ('estudiante','docente','administrativo','visitante')),
  rol       text not null default 'usuario'
            check (rol in ('usuario','admin')),
  creado_en timestamptz not null default now(),

  -- Solo correo institucional. Para permitir cualquier correo durante
  -- pruebas, comentar esta linea y volver a correr el script.
  constraint correo_institucional check (correo ~* '@(ce\.)?pucmm\.edu\.do$')
);

comment on table public.perfiles is
  'Datos del usuario. Se crea solo al registrarse en Supabase Auth.';

-- Al crear una cuenta en Auth se crea su perfil automaticamente.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, correo)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger trg_crear_perfil
after insert on auth.users
for each row execute function public.crear_perfil();


-- ============================================================
-- 2. ZONAS Y ESPACIOS
-- ============================================================

create table public.zonas (
  id         text primary key,          -- 'a1', 'b1', 'pg'
  nombre     text not null,
  referencia text,
  orden      int  not null default 0
);

create table public.espacios (
  id             uuid primary key default gen_random_uuid(),
  zona_id        text not null references public.zonas(id) on delete cascade,
  numero         int  not null,
  codigo         text not null unique,           -- 'A1-037'
  habilitado     boolean not null default true,  -- el admin puede apagarlo
  motivo         text,                           -- por que esta deshabilitado
  actualizado_en timestamptz not null default now(),
  unique (zona_id, numero)
);

comment on column public.espacios.habilitado is
  'false = no se asigna a nadie (mantenimiento o reserva del administrador).';


-- ============================================================
-- 3. VEHICULOS
-- ============================================================

create table public.vehiculos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  placa      text not null unique,
  marca      text not null,
  modelo     text not null,
  color      text not null,
  creado_en  timestamptz not null default now()
);

-- La placa identifica al infractor cuando alguien lo reporta,
-- por eso se normaliza a mayusculas sin espacios.
create or replace function public.normalizar_placa()
returns trigger
language plpgsql
as $$
begin
  new.placa := upper(regexp_replace(new.placa, '\s|-', '', 'g'));
  return new;
end;
$$;

create trigger trg_normalizar_placa
before insert or update on public.vehiculos
for each row execute function public.normalizar_placa();


-- ============================================================
-- 4. ASIGNACIONES  (quien tiene que espacio y hasta cuando)
-- ============================================================

create table public.asignaciones (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles(id),
  vehiculo_id  uuid not null references public.vehiculos(id),
  espacio_id   uuid not null references public.espacios(id),
  inicio       timestamptz not null default now(),
  vence_en     timestamptz not null,
  salida_en    timestamptz,
  extensiones  int not null default 0,
  cerrada_por  text check (cerrada_por in ('usuario','cancelacion','reasignacion')),
  creado_en    timestamptz not null default now()
);

-- Una asignacion ocupa el espacio mientras no se marque la salida
-- y no se haya vencido el plazo. Al vencerse deja de ocupar sola:
-- no hace falta ningun proceso que limpie nada.
create index idx_asignaciones_vigentes
  on public.asignaciones (espacio_id, vence_en)
  where salida_en is null;

create index idx_asignaciones_usuario
  on public.asignaciones (usuario_id, vence_en)
  where salida_en is null;

comment on table public.asignaciones is
  'Vigente = salida_en is null AND vence_en > now(). El vencimiento libera el espacio por si solo.';


-- ============================================================
-- 5. REPORTES  ("alguien esta en mi espacio")
-- ============================================================

create table public.reportes (
  id                    uuid primary key default gen_random_uuid(),
  reportante_id         uuid not null references public.perfiles(id),
  espacio_id            uuid not null references public.espacios(id),
  asignacion_id         uuid references public.asignaciones(id),
  placa_reportada       text not null,
  -- Se resuelven al crear el reporte buscando la placa en el padron.
  -- Quedan en null si la placa no esta registrada (vehiculo intruso).
  infractor_id          uuid references public.perfiles(id),
  vehiculo_infractor_id uuid references public.vehiculos(id),
  descripcion           text not null,
  foto_url              text,
  ocurrido_en           timestamptz not null default now(),
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente','validado','rechazado')),
  revisado_por          uuid references public.perfiles(id),
  revisado_en           timestamptz,
  nota_admin            text,
  creado_en             timestamptz not null default now()
);

comment on table public.reportes is
  'Un reporte NO es un strike. Solo cuenta como strike si un administrador lo valida.';

create index idx_reportes_estado on public.reportes (estado, creado_en desc);
create index idx_reportes_infractor on public.reportes (infractor_id) where estado = 'validado';


-- ============================================================
-- 6. APELACIONES  (el acusado se defiende)
-- ============================================================

create table public.apelaciones (
  id           uuid primary key default gen_random_uuid(),
  reporte_id   uuid not null unique references public.reportes(id) on delete cascade,
  usuario_id   uuid not null references public.perfiles(id),
  texto        text not null,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','aceptada','rechazada')),
  resuelto_por uuid references public.perfiles(id),
  resuelto_en  timestamptz,
  nota_admin   text,
  creado_en    timestamptz not null default now()
);

comment on table public.apelaciones is
  'Si el administrador acepta la apelacion, el reporte pasa a rechazado y el strike desaparece.';


-- ============================================================
-- 7. INCIDENCIAS  (problemas generales: luz danada, etc.)
-- ============================================================

create table public.incidencias (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references public.perfiles(id),
  zona_id     text references public.zonas(id),
  descripcion text not null,
  foto_url    text,
  estado      text not null default 'abierta'
              check (estado in ('abierta','en_proceso','resuelta')),
  creado_en   timestamptz not null default now()
);


-- ============================================================
-- 8. FUNCIONES DE APOYO
-- ============================================================

-- Strikes = reportes validados en tu contra.
create or replace function public.strikes_de(p_usuario uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.reportes
   where infractor_id = p_usuario
     and estado = 'validado';
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  );
$$;

-- Asignacion vigente del usuario actual (o null).
create or replace function public.mi_asignacion()
returns public.asignaciones
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.asignaciones
   where usuario_id = auth.uid()
     and salida_en is null
     and vence_en > now()
   limit 1;
$$;


-- ============================================================
-- 9. DISPONIBILIDAD  (lo que ve la pagina publica)
-- ============================================================

create or replace view public.disponibilidad as
select
  z.id,
  z.nombre,
  z.referencia,
  z.orden,
  count(e.id) filter (where e.habilitado)                  as capacidad,
  count(e.id) filter (where e.habilitado and a.id is null) as libres,
  count(e.id) filter (where not e.habilitado)              as deshabilitados
from public.zonas z
left join public.espacios e
  on e.zona_id = z.id
left join public.asignaciones a
  on a.espacio_id = e.id
 and a.salida_en is null
 and a.vence_en > now()
group by z.id, z.nombre, z.referencia, z.orden;

comment on view public.disponibilidad is
  'Espacios libres por zona, calculado en vivo. No hay contador que se pueda descuadrar.';


-- ============================================================
-- 10. SOLICITAR PARQUEO
-- ============================================================
-- Toda la regla de negocio vive aqui para que dos personas no
-- puedan quedarse con el mismo espacio al mismo tiempo
-- (for update skip locked).

create or replace function public.solicitar_parqueo(p_zona text, p_vehiculo uuid)
returns public.asignaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_espacio uuid;
  v_asig    public.asignaciones;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if not exists (select 1 from public.vehiculos
                  where id = p_vehiculo and usuario_id = v_usuario) then
    raise exception 'Ese vehículo no está registrado a tu nombre.';
  end if;

  if public.strikes_de(v_usuario) >= 3 then
    raise exception 'Tienes 3 strikes validados: tu acceso al parqueo está suspendido.';
  end if;

  if exists (select 1 from public.asignaciones
              where usuario_id = v_usuario
                and salida_en is null
                and vence_en > now()) then
    raise exception 'Ya tienes un parqueo asignado. Marca tu salida antes de solicitar otro.';
  end if;

  select e.id into v_espacio
    from public.espacios e
   where e.zona_id = p_zona
     and e.habilitado
     and not exists (
       select 1 from public.asignaciones a
        where a.espacio_id = e.id
          and a.salida_en is null
          and a.vence_en > now())
   order by e.numero
     for update skip locked
   limit 1;

  if v_espacio is null then
    raise exception 'No hay espacios libres en esa zona en este momento.';
  end if;

  insert into public.asignaciones (usuario_id, vehiculo_id, espacio_id, vence_en)
  values (v_usuario, p_vehiculo, v_espacio, now() + interval '6 hours')
  returning * into v_asig;

  return v_asig;
end;
$$;


-- ============================================================
-- 11. EXTENDER, SALIR, CANCELAR
-- ============================================================

create or replace function public.extender_parqueo()
returns public.asignaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asig public.asignaciones;
begin
  update public.asignaciones
     set vence_en    = greatest(vence_en, now()) + interval '6 hours',
         extensiones = extensiones + 1
   where usuario_id = auth.uid()
     and salida_en is null
     and vence_en > now()
  returning * into v_asig;

  if v_asig.id is null then
    raise exception 'No tienes un parqueo vigente que extender.';
  end if;
  return v_asig;
end;
$$;

create or replace function public.marcar_salida()
returns public.asignaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asig public.asignaciones;
begin
  update public.asignaciones
     set salida_en = now(), cerrada_por = 'usuario'
   where usuario_id = auth.uid()
     and salida_en is null
     and vence_en > now()
  returning * into v_asig;

  if v_asig.id is null then
    raise exception 'No tienes un parqueo vigente.';
  end if;
  return v_asig;
end;
$$;

create or replace function public.cancelar_parqueo()
returns public.asignaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asig public.asignaciones;
begin
  update public.asignaciones
     set salida_en = now(), cerrada_por = 'cancelacion'
   where usuario_id = auth.uid()
     and salida_en is null
     and vence_en > now()
  returning * into v_asig;

  if v_asig.id is null then
    raise exception 'No tienes un parqueo vigente que cancelar.';
  end if;
  return v_asig;
end;
$$;


-- ============================================================
-- 12. REPORTAR OCUPACION Y REASIGNAR
-- ============================================================
-- Reportar no basta: el usuario sigue sin donde parquear. Esta
-- funcion crea el reporte, suelta el espacio ocupado y le asigna
-- otro en la misma zona. Si la zona ya no tiene espacios libres
-- devuelve null y el reporte queda creado igual.

create or replace function public.reportar_y_reasignar(
  p_placa       text,
  p_descripcion text,
  p_foto_url    text default null
)
returns public.asignaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario  uuid := auth.uid();
  v_asig     public.asignaciones;
  v_placa    text := upper(regexp_replace(coalesce(p_placa, ''), '\s|-', '', 'g'));
  v_veh      public.vehiculos;
  v_zona     text;
  v_vehiculo uuid;
  v_nuevo    uuid;
  v_nueva    public.asignaciones;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_asig
    from public.asignaciones
   where usuario_id = v_usuario and salida_en is null and vence_en > now()
   limit 1;

  if v_asig.id is null then
    raise exception 'No tienes un parqueo asignado que reportar.';
  end if;

  if v_placa = '' then
    raise exception 'Debes indicar la placa del vehículo que ocupa tu espacio.';
  end if;

  -- Se busca al dueno en el padron. Si no aparece, es un intruso
  -- y el reporte queda sin infractor para que lo vea el administrador.
  select * into v_veh from public.vehiculos where placa = v_placa limit 1;

  insert into public.reportes (
    reportante_id, espacio_id, asignacion_id, placa_reportada,
    infractor_id, vehiculo_infractor_id, descripcion, foto_url
  ) values (
    v_usuario, v_asig.espacio_id, v_asig.id, v_placa,
    v_veh.usuario_id, v_veh.id, p_descripcion, p_foto_url
  );

  select zona_id into v_zona from public.espacios where id = v_asig.espacio_id;
  v_vehiculo := v_asig.vehiculo_id;

  -- Suelta el espacio ocupado.
  update public.asignaciones
     set salida_en = now(), cerrada_por = 'reasignacion'
   where id = v_asig.id;

  -- Busca otro en la misma zona.
  select e.id into v_nuevo
    from public.espacios e
   where e.zona_id = v_zona
     and e.habilitado
     and e.id <> v_asig.espacio_id
     and not exists (
       select 1 from public.asignaciones a
        where a.espacio_id = e.id
          and a.salida_en is null
          and a.vence_en > now())
   order by e.numero
     for update skip locked
   limit 1;

  if v_nuevo is null then
    return null;   -- reporte creado, pero la zona esta llena
  end if;

  insert into public.asignaciones (usuario_id, vehiculo_id, espacio_id, vence_en)
  values (v_usuario, v_vehiculo, v_nuevo, now() + interval '6 hours')
  returning * into v_nueva;

  return v_nueva;
end;
$$;


-- ============================================================
-- 13. RESOLUCION POR EL ADMINISTRADOR
-- ============================================================

create or replace function public.resolver_reporte(
  p_reporte uuid,
  p_valido  boolean,
  p_nota    text default null
)
returns public.reportes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.reportes;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede resolver reportes.';
  end if;

  update public.reportes
     set estado       = case when p_valido then 'validado' else 'rechazado' end,
         revisado_por = auth.uid(),
         revisado_en  = now(),
         nota_admin   = p_nota
   where id = p_reporte
  returning * into v_rep;

  if v_rep.id is null then
    raise exception 'Ese reporte no existe.';
  end if;
  return v_rep;
end;
$$;

create or replace function public.resolver_apelacion(
  p_apelacion uuid,
  p_aceptar   boolean,
  p_nota      text default null
)
returns public.apelaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ape public.apelaciones;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede resolver apelaciones.';
  end if;

  update public.apelaciones
     set estado       = case when p_aceptar then 'aceptada' else 'rechazada' end,
         resuelto_por = auth.uid(),
         resuelto_en  = now(),
         nota_admin   = p_nota
   where id = p_apelacion
  returning * into v_ape;

  if v_ape.id is null then
    raise exception 'Esa apelación no existe.';
  end if;

  -- Apelacion aceptada = el reporte deja de contar como strike.
  if p_aceptar then
    update public.reportes
       set estado = 'rechazado', nota_admin = coalesce(p_nota, 'Apelacion aceptada')
     where id = v_ape.reporte_id;
  end if;

  return v_ape;
end;
$$;

create or replace function public.habilitar_espacio(
  p_espacio    uuid,
  p_habilitado boolean,
  p_motivo     text default null
)
returns public.espacios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esp public.espacios;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede habilitar o deshabilitar espacios.';
  end if;

  update public.espacios
     set habilitado     = p_habilitado,
         motivo         = case when p_habilitado then null else p_motivo end,
         actualizado_en = now()
   where id = p_espacio
  returning * into v_esp;

  if v_esp.id is null then
    raise exception 'Ese espacio no existe.';
  end if;
  return v_esp;
end;
$$;


-- ============================================================
-- 14. TIEMPO REAL
-- ============================================================
-- Segun el proyecto, la publicacion puede pertenecer a otro rol.
-- Si no se puede modificar, la aplicacion sigue funcionando: solo
-- pierde la actualizacion instantanea (se puede activar a mano en
-- Database -> Replication).

do $$
begin
  alter publication supabase_realtime add table public.asignaciones;
  alter publication supabase_realtime add table public.espacios;
exception
  when insufficient_privilege or duplicate_object then
    raise notice 'Tiempo real no configurado desde el script: actívalo en Database -> Replication.';
end
$$;


-- ============================================================
-- 15. SEGURIDAD POR FILAS (RLS)
-- ============================================================

alter table public.perfiles     enable row level security;
alter table public.zonas        enable row level security;
alter table public.espacios     enable row level security;
alter table public.vehiculos    enable row level security;
alter table public.asignaciones enable row level security;
alter table public.reportes     enable row level security;
alter table public.apelaciones  enable row level security;
alter table public.incidencias  enable row level security;

-- --- perfiles ---
create policy "ver mi perfil" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

create policy "editar mi perfil" on public.perfiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and rol = 'usuario');

-- --- zonas y espacios: lectura publica (es el proposito de la app) ---
create policy "zonas publicas" on public.zonas
  for select using (true);

create policy "espacios publicos" on public.espacios
  for select using (true);

create policy "admin gestiona espacios" on public.espacios
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- --- vehiculos ---
create policy "ver mis vehiculos" on public.vehiculos
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin());

create policy "registrar mi vehiculo" on public.vehiculos
  for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "editar mi vehiculo" on public.vehiculos
  for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy "borrar mi vehiculo" on public.vehiculos
  for delete to authenticated
  using (usuario_id = auth.uid());

-- --- asignaciones ---
-- Se escriben solo por las funciones de arriba, nunca directo.
create policy "ver mis asignaciones" on public.asignaciones
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin());

-- --- reportes ---
create policy "ver reportes propios" on public.reportes
  for select to authenticated
  using (reportante_id = auth.uid() or infractor_id = auth.uid() or public.es_admin());

-- --- apelaciones ---
create policy "ver mis apelaciones" on public.apelaciones
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin());

create policy "apelar un reporte mio" on public.apelaciones
  for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.reportes r
                 where r.id = reporte_id and r.infractor_id = auth.uid())
  );

-- --- incidencias ---
create policy "ver mis incidencias" on public.incidencias
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin());

create policy "crear incidencia" on public.incidencias
  for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "admin gestiona incidencias" on public.incidencias
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ============================================================
-- 16. EVIDENCIA FOTOGRAFICA (Storage)
-- ============================================================

-- El esquema storage puede pertenecer a otro rol. Si el script no
-- puede tocarlo, se crea el bucket "evidencias" a mano desde
-- Storage -> New bucket (marcandolo como publico) y las politicas
-- quedan igual desde esa misma pantalla.

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('evidencias', 'evidencias', true)
  on conflict (id) do nothing;

  create policy "subir evidencia" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'evidencias');

  create policy "ver evidencia" on storage.objects
    for select using (bucket_id = 'evidencias');
exception
  when insufficient_privilege or duplicate_object then
    raise notice 'Bucket de evidencias no creado desde el script: créalo en Storage -> New bucket (público), nombre "evidencias".';
end
$$;


-- ============================================================
-- 17. DATOS INICIALES
-- ============================================================

insert into public.zonas (id, nombre, referencia, orden) values
  ('a1',  'Zona A1',        'Junto a aulas y biblioteca',               1),
  ('b1',  'Zona B1',        'Torre de seis niveles, entrada principal', 2),
  ('pgt', 'Posgrado Torre', 'Torre de posgrado, seis niveles'          , 3),
  ('pgp', 'Posgrado Plano', 'Parqueo a nivel del edificio de posgrado', 4);

-- Zonas a nivel: numeracion corrida.  A1-001..A1-120, PP-001..PP-020
insert into public.espacios (zona_id, numero, codigo)
select 'a1', n, 'A1-' || lpad(n::text, 3, '0') from generate_series(1, 120) n
union all
select 'pgp', n, 'PP-' || lpad(n::text, 3, '0') from generate_series(1, 20) n;

-- Torres: seis pisos de cincuenta.  B1-P1-01 .. B1-P6-50
--
-- El piso no es una columna: se deduce del numero (1-50 es el primero,
-- 51-100 el segundo, y asi) y va escrito en el codigo. Eso hace que
-- solicitar_parqueo, que ya ordena por numero, llene los pisos de abajo
-- hacia arriba sin ninguna regla extra: nadie sube al sexto teniendo
-- espacios libres en el primero.
insert into public.espacios (zona_id, numero, codigo)
select z.zona, n,
       z.prefijo || '-P' || ceil(n / 50.0)::int
                 || '-' || lpad((((n - 1) % 50) + 1)::text, 2, '0')
from (values ('b1', 'B1'), ('pgt', 'PT')) as z(zona, prefijo),
     generate_series(1, 300) n;


-- ============================================================
-- 18. DESPUES DE CORRER ESTE SCRIPT
-- ============================================================
-- 1) Crear tu cuenta desde la aplicacion (entrar.html).
-- 2) Convertirte en administrador, corriendo aqui mismo:
--
--      update public.perfiles set rol = 'admin'
--       where correo = 'tucorreo@ce.pucmm.edu.do';
--
-- 3) Pegar URL y clave anon en frontend/js/config.js
-- ============================================================
