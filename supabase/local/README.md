# Base de datos local y pruebas

Aquí vive lo necesario para levantar el esquema de MiParqueo en un PostgreSQL
propio, sin Supabase y sin instalar nada en el sistema.

Sirve para dos cosas: comprobar que las reglas de negocio funcionan, y poder
entregar la base de datos sin atarla a un proveedor.

## Correr las pruebas

```bash
cd supabase/local
npm install
npm test
```

La primera vez descarga los binarios de PostgreSQL (unos 100 MB) dentro de
`node_modules`. No toca nada del sistema, no pide permisos de administrador y
no deja servicios corriendo: se levanta, prueba y se apaga.

Salida esperada:

```
=== 25 pruebas ok, 0 fallando ===
```

## Qué se comprueba

| Bloque | Qué verifica |
|---|---|
| Alta de usuarios | El perfil se crea solo al registrarse; se rechaza el correo no institucional |
| Vehículos | La placa se normaliza a mayúsculas sin espacios ni guiones |
| Solicitar | Asigna el primer espacio libre; la disponibilidad baja sola; no se puede pedir dos a la vez ni usar el vehículo de otro |
| Extender | Suma exactamente 6 horas y lleva la cuenta |
| Reportar | Crea el reporte, reasigna otro espacio, resuelve al infractor por la placa y guarda la evidencia |
| Strikes | Un reporte pendiente **no** es strike; solo el administrador lo valida |
| Apelación | Aceptarla borra el strike |
| Suspensión | A los 3 strikes no se puede solicitar parqueo |
| Espacios | Deshabilitar baja la capacidad; solo el administrador puede hacerlo |
| Seguridad (RLS) | Un usuario solo ve sus propios vehículos; las zonas siguen siendo públicas |

## Los dos archivos

- **`compat_postgres.sql`** — Supabase añade a PostgreSQL unas piezas propias
  que el esquema usa: el esquema `auth` con `auth.uid()`, el esquema `storage`,
  los roles `anon` y `authenticated`, y la publicación de tiempo real. Este
  archivo crea versiones mínimas de todas ellas para que
  `../migrations/0001_esquema_inicial.sql` corra en cualquier PostgreSQL.

  **No lo ejecutes en Supabase**: allí todo esto ya existe.

- **`pruebas.mjs`** — El recorrido completo, de crear usuarios a suspender a
  uno por acumular strikes.

## Llevar la base de datos a otro motor

Con estos dos archivos, el esquema corre en cualquier PostgreSQL 13 o
superior: el de la universidad, uno propio o el de otro proveedor.

```bash
psql -d miparqueo -f supabase/local/compat_postgres.sql
psql -d miparqueo -f supabase/migrations/0001_esquema_inicial.sql
```

Lo que **no** viaja con el esquema es la capa de servicios de Supabase
(autenticación, API REST, tiempo real y almacenamiento de fotos). El frontend
habla HTTP contra esa capa, no directamente con PostgreSQL. Para que la
aplicación funcione de punta a punta hace falta Supabase —en la nube o local
con Docker— o escribir esa capa a mano.
