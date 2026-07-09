# Arquitectura · MiParqueo

## Alcance de este documento

Describe cómo está construido el sistema y por qué. Regla general del
proyecto: **empezar simple y crecer por capas**, no construir infraestructura
antes de necesitarla.

## Vista general

```
┌─────────────────────┐        HTTPS/JSON         ┌──────────────────────────┐
│      Frontend       │ ◄───────────────────────► │         Supabase         │
│  (HTML/CSS/JS       │   supabase-js:            │  ┌────────────────────┐  │
│   estático)         │   - select zonas          │  │ PostgreSQL          │  │
│                     │   - Realtime (websocket)  │  │  zonas              │  │
│  data.js decide:    │                           │  │  vehiculos          │  │
│  supabase | demo    │                           │  │  eventos ──trigger──┼──┼─► actualiza zonas
└─────────────────────┘                           │  │  incidencias        │  │
                                                  │  └────────────────────┘  │
        ▲                                         │  Realtime · Auth · RLS   │
        │ solo lectura pública                    └────────────┬─────────────┘
        │                                                      │ service_role
   Estudiantes,                                       ┌────────┴─────────┐
   docentes,                                          │ Casetas de acceso│
   visitantes                                         │ (lector de QR)   │
                                                      └──────────────────┘
```

## Decisiones y por qué

| Decisión | Razón |
|---|---|
| Frontend estático sin frameworks | El caso de uso principal es una consulta rápida desde el celular. Carga instantánea, cero build, cero dependencias que mantener. Si el proyecto crece a paneles administrativos, se evalúa un framework en ese momento. |
| Supabase como backend | Resuelve en un solo servicio la base de datos (PostgreSQL), el tiempo real (Realtime), la autenticación y la seguridad por filas (RLS). El plan gratuito cubre el alcance académico. Alternativa evaluada: API propia en Node/Express + PostgreSQL — más control, pero más piezas que operar sin beneficio a esta escala. |
| `data.js` con doble modo (supabase/demo) | La interfaz no sabe de dónde vienen los datos. Sin credenciales configuradas, la página funciona como demostración; con credenciales, pasa a datos reales. Permite desarrollar y presentar sin depender del backend. |
| La ocupación se calcula por eventos | Las casetas insertan `eventos` (entrada/salida) y un trigger actualiza `zonas.ocupados`. El frontend jamás escribe la ocupación: una sola fuente de verdad y una auditoría completa de movimientos. |
| Estados por proporción (≤20% libre = "casi llena") | Funciona igual para una zona de 45 o de 120 espacios; no hay números mágicos por zona. |
| Realtime en vez de sondeo | Supabase publica los cambios de `zonas` por websocket; la página se actualiza al instante sin recargar ni consultar en bucle. |

## Modelo de datos

```
zonas        (id, nombre, referencia, capacidad, ocupados, actualizado_en)
vehiculos    (id, placa UNIQUE, nombre_propietario, correo, tipo, creado_en)
eventos      (id, zona_id → zonas, placa, tipo entrada|salida, ocurrido_en)
incidencias  (id, zona_id → zonas, descripcion, foto_url, estado, creado_en)
```

Reglas: `0 ≤ ocupados ≤ capacidad` (restricción en la base de datos);
los espacios libres se calculan como `capacidad - ocupados` en el cliente.

## Seguridad (RLS)

| Tabla | anon | authenticated | service_role (casetas) |
|---|---|---|---|
| zonas | leer | leer | todo |
| vehiculos | — | insertar el propio | todo |
| eventos | — | — | insertar |
| incidencias | — | insertar | todo |

La clave `anon` es pública por diseño (va en el navegador); las políticas RLS
son las que limitan lo que puede hacer. La clave `service_role` solo vive en
el software de las casetas, nunca en el repositorio ni en el frontend.

## Fases

1. **Hoy** — Frontend con mapa interactivo y disponibilidad por zona;
   esquema de base de datos completo; modo demo para presentar sin backend.
2. **Conexión** — Crear el proyecto Supabase, correr la migración y pegar
   las credenciales (ver `supabase/README.md`). El indicador pasa a "En vivo".
3. **Registro real** — Autenticación con correo institucional
   (Supabase Auth con enlaces mágicos) y formulario de vehículos.
4. **Casetas con QR** — Al registrar el vehículo, la aplicación genera un
   código QR (el `id` del vehículo firmado). En la entrada y la salida, un
   lector escanea el QR y un servicio pequeño valida el código e inserta el
   evento correspondiente usando `service_role`. El mismo QR sirve para
   entrar y salir: el tipo de evento lo define la caseta que escanea.

## Fuera de alcance (fases futuras)

Sensores físicos por espacio, cámaras lectoras de placas y barreras
automáticas. Entran como nuevas fuentes de `eventos` hacia el mismo esquema,
sin cambiar el contrato con el frontend.
