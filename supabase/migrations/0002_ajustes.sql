-- ============================================================
-- MiParqueo · ajustes posteriores al esquema inicial
-- Ejecutar en: Supabase -> SQL Editor, despues de 0001.
-- ============================================================


-- ------------------------------------------------------------
-- 1. La pagina publica no se actualizaba sola
-- ------------------------------------------------------------
-- El visitante sin cuenta no tenia ningun permiso sobre
-- asignaciones, asi que Supabase Realtime no le enviaba nada y el
-- contador se quedaba congelado hasta recargar.
--
-- La solucion no es abrir la tabla entera: se deja pasar la fila,
-- pero solo se conceden las columnas que no identifican a nadie.
-- Saber que el A1-037 esta ocupado hasta las 3pm es justo el
-- proposito de la aplicacion; saber quien lo ocupa, no.

revoke select on public.asignaciones from anon;

grant select (id, espacio_id, inicio, vence_en, salida_en)
  on public.asignaciones to anon;

create policy "ocupacion visible sin cuenta"
  on public.asignaciones for select
  to anon
  using (true);


-- ------------------------------------------------------------
-- 2. usuario_id se pone solo
-- ------------------------------------------------------------
-- Antes el navegador tenia que mandar su propio id en cada insert.
-- Si se olvidaba, la politica RLS lo rechazaba con un error
-- confuso. Ahora lo pone la base de datos.

alter table public.vehiculos   alter column usuario_id set default auth.uid();
alter table public.incidencias alter column usuario_id set default auth.uid();
alter table public.apelaciones alter column usuario_id set default auth.uid();


-- ------------------------------------------------------------
-- 3. Indice para el historial
-- ------------------------------------------------------------
-- El panel del usuario pide sus ultimas asignaciones ordenadas por
-- fecha; sin esto recorre la tabla entera.

create index if not exists idx_asignaciones_historial
  on public.asignaciones (usuario_id, inicio desc);
