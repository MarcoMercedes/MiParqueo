# Base de datos

PostgreSQL sobre Supabase, que aporta además la autenticación, el
almacenamiento de las fotos de evidencia y el canal de tiempo real.

## Montaje

1. Proyecto nuevo en Supabase, región `East US`.
2. En el SQL Editor, ejecutar en orden:
   - [`migrations/0001_esquema_inicial.sql`](migrations/0001_esquema_inicial.sql)
   - [`migrations/0002_ajustes.sql`](migrations/0002_ajustes.sql)
3. `Project Settings → API`: copiar *Project URL* y la clave *publishable*
   a [`../frontend/js/config.js`](../frontend/js/config.js).
4. `Authentication → URL Configuration`: *Site URL* con la dirección desde la
   que se sirve la aplicación, y esa misma dirección seguida de `/**` en
   *Redirect URLs*.

Queda montado el esquema completo: cuatro zonas, 1.200 espacios numerados
—B1 y Posgrado Torre repartidos en seis pisos de cincuenta—, las funciones
que gobiernan las reservas, las políticas de acceso por filas y el bucket
`evidencias`.

## Cuentas

No hay autorregistro. Se crean desde `Authentication → Users` con
*Auto Confirm User* activado.

El rol de administrador se otorga solo desde la base de datos: quien valida
reportes y deshabilita espacios no puede nombrarse a sí mismo.

```sql
update public.perfiles set rol = 'admin' where correo = '...';
```

El dominio del correo está restringido a `@pucmm.edu.do` y `@ce.pucmm.edu.do`
por la restricción `correo_institucional` de `perfiles`, con la validación
equivalente en el cliente.

## Claves

La clave *publishable* viaja al navegador de cualquiera que abra la página:
es pública por diseño. Lo que limita el acceso son las políticas RLS, no el
secreto de esa clave.

La clave *secret* salta esas políticas, así que no aparece en el frontend ni
en el repositorio.

## Fuera de Supabase

El esquema corre en cualquier PostgreSQL 13 o superior ejecutando antes
[`local/compat_postgres.sql`](local/compat_postgres.sql), que crea las piezas
que Supabase trae de fábrica: el esquema `auth` con `auth.uid()`, el esquema
`storage`, los roles `anon` y `authenticated`, y la publicación de tiempo
real.

```bash
psql -d miparqueo -f local/compat_postgres.sql
psql -d miparqueo -f migrations/0001_esquema_inicial.sql
psql -d miparqueo -f migrations/0002_ajustes.sql
```

Lo que no viaja con el esquema es la capa de servicios —autenticación, API
REST, tiempo real y almacenamiento—: el frontend habla HTTP contra ella, no
directamente con PostgreSQL.

## Comprobación

```bash
cd ../frontend && python -m http.server 4000
```

El indicador de la cabecera dice **En vivo** si la conexión está resuelta y
**Sin conexión** si falta configurar `config.js`.

## Aviso

Los proyectos gratuitos de Supabase se pausan tras una semana sin actividad.
