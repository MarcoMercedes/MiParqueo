# Pruebas de la lógica de negocio

Las reglas del sistema viven en funciones de PostgreSQL, no en el navegador.
Estas pruebas las ejercitan contra una base de datos real: levantan su propio
PostgreSQL, montan el esquema desde cero y lo tumban al terminar. No instalan
nada en el sistema ni dejan servicios corriendo.

```bash
npm install
npm test
```

La primera ejecución descarga los binarios de PostgreSQL (~100 MB) dentro de
`node_modules`.

```
=== 28 pruebas ok, 0 fallando ===
```

## Cobertura

| Bloque | Qué verifica |
|---|---|
| Alta de usuarios | El perfil se crea solo al registrarse; se rechaza el correo no institucional |
| Vehículos | La placa se normaliza a mayúsculas sin espacios ni guiones |
| Solicitar | Asigna el primer espacio libre; la disponibilidad baja sola; no se puede pedir dos a la vez ni usar el vehículo de otro |
| Extender | Suma exactamente seis horas y lleva la cuenta |
| Reportar | Crea el reporte, reasigna otro espacio, resuelve al infractor por la placa y guarda la evidencia |
| Strikes | Un reporte pendiente **no** es strike; solo el administrador lo valida |
| Apelación | Aceptarla borra el strike |
| Suspensión | A los tres strikes no se puede solicitar parqueo |
| Pisos | El siguiente libre de una torre es el más bajo: no se sube al sexto teniendo el primero vacío |
| Espacios | Deshabilitar baja la capacidad; solo el administrador puede hacerlo |
| Seguridad (RLS) | Un usuario solo ve sus propios vehículos; las zonas siguen siendo públicas |

## compat_postgres.sql

El esquema usa piezas que Supabase añade a PostgreSQL: el esquema `auth` con
`auth.uid()`, el esquema `storage`, los roles `anon` y `authenticated`, y la
publicación de tiempo real. Este archivo crea versiones mínimas de todas
ellas, y es lo que permite montar la base de datos fuera de Supabase.

No ejecutarlo en Supabase: allí ya existen.
