# Arquitectura · MiParqueo

## Alcance de este documento

Describe cómo está construido el sistema y por qué. Regla general del
proyecto: **empezar simple y crecer por capas**, no construir infraestructura
antes de necesitarla.

## Vista general

```
┌──────────────────────────┐      HTTPS/JSON       ┌──────────────────────────┐
│         Frontend         │ ◄───────────────────► │         Supabase         │
│   (HTML/CSS/JS estático) │  supabase-js:         │  ┌────────────────────┐  │
│                          │  - auth (enlace       │  │ PostgreSQL         │  │
│  index.html · una sola   │    o contraseña)      │  │  perfiles          │  │
│  página con cuatro       │  - vista              │  │  zonas / espacios  │  │
│  secciones: inicio,      │    disponibilidad     │  │  vehiculos         │  │
│  acceso, panel y admin   │  - funciones RPC      │  │  asignaciones      │  │
│                          │  - Realtime (ws)      │  │  reportes          │  │
└──────────────────────────┘  - Storage (fotos)    │  │  apelaciones       │  │
                                                   │  └────────────────────┘  │
                                                   │  Realtime · Auth · RLS   │
                                                   │  Storage (evidencias)    │
                                                   └──────────────────────────┘
```

No hay servidor propio. Toda la lógica de negocio vive en funciones de
PostgreSQL; el navegador solo las invoca.

## El ciclo del producto

1. El estudiante consulta la disponibilidad **antes de entrar al campus**.
   Esta pantalla es pública, no requiere cuenta.
2. Entra con su correo institucional y registra su vehículo una sola vez.
3. Solicita parqueo en la zona que quiera. El sistema le **asigna un espacio
   numerado** concreto (`A1-037`) por seis horas.
4. No puede solicitar otro mientras tenga uno vigente.
5. Al irse marca su salida y el espacio se libera. Si necesita más tiempo,
   extiende seis horas cuantas veces haga falta.
6. Si al llegar encuentra su espacio ocupado, lo reporta con foto y el sistema
   **le asigna otro al instante** en la misma zona.
7. Un administrador revisa la evidencia y decide si el reporte procede.

## Decisiones y por qué

| Decisión | Razón |
|---|---|
| Frontend estático sin frameworks | El caso de uso principal es una consulta rápida desde el celular. Carga instantánea, cero build, cero dependencias que mantener. |
| Supabase como backend | Resuelve en un solo servicio la base de datos, el tiempo real, la autenticación, el almacenamiento de fotos y la seguridad por filas. El plan gratuito cubre el alcance. Alternativa evaluada: API propia en Node/Express — más control, más piezas que operar sin beneficio a esta escala. |
| Espacios numerados, no un contador | "Alguien está en mi parqueo" solo significa algo si tu parqueo es uno concreto. Además la disponibilidad se vuelve un hecho verificable en vez de un número que alguien mantiene. |
| La ocupación se **calcula**, no se guarda | Un espacio está ocupado si tiene una asignación sin salida y sin vencer. No hay contador que pueda descuadrarse ni proceso que lo corrija. |
| Plazo de 6 horas prorrogable | El usuario es quien registra su entrada y salida, y la gente olvida marcar la salida. El vencimiento libera el espacio por sí solo: el olvido se cura en seis horas en lugar de bloquear un espacio para siempre. |
| Cuentas creadas por la administración | Nadie se autorregistra en el sistema de parqueos de una universidad: el padrón de estudiantes ya existe. El dominio del correo prueba la pertenencia y la contraseña la identidad. |
| El piso se deduce del número de espacio | En las torres, los espacios 1-50 son el primer piso, 51-100 el segundo. Como la asignación toma siempre el número libre más bajo, los pisos se llenan de abajo hacia arriba sin ninguna regla adicional, y no hay una columna «piso» que pueda quedar inconsistente. |
| La lógica vive en funciones SQL | `solicitar_parqueo`, `extender_parqueo`, `reportar_y_reasignar`… No se pueden saltar manipulando el navegador, y la asignación concurrente se resuelve con `for update skip locked` en vez de con suerte. |
| El strike no es automático | Tres reportes bastan para multar a alguien y quitarle el acceso. Si el reporte fuera automático, cualquiera podría sancionar a un rival desde su teléfono. Un administrador valida la evidencia, y el acusado puede apelar. |
| Sin modo demostración | Si no hay conexión, la aplicación lo dice. Mostrar números inventados es peor que mostrar un error. |

## Modelo de datos

```
perfiles     (id → auth.users, nombre, correo, tipo, rol usuario|admin)
zonas        (id, nombre, referencia, orden)
espacios     (id, zona_id → zonas, numero, codigo 'A1-037', habilitado, motivo)
vehiculos    (id, usuario_id → perfiles, placa UNIQUE, marca, modelo, color)
asignaciones (id, usuario_id, vehiculo_id, espacio_id, inicio, vence_en,
              salida_en, extensiones, cerrada_por)
reportes     (id, reportante_id, espacio_id, placa_reportada, infractor_id,
              descripcion, foto_url, ocurrido_en, estado, revisado_por, nota_admin)
apelaciones  (id, reporte_id UNIQUE, usuario_id, texto, estado, nota_admin)
incidencias  (id, usuario_id, zona_id, descripcion, foto_url, estado)
```

Reglas derivadas, no almacenadas:

- **Asignación vigente** = `salida_en is null AND vence_en > now()`.
- **Espacio libre** = habilitado y sin asignación vigente.
- **Strikes** = reportes en tu contra con estado `validado`.
- **Suspendido** = 3 strikes o más.

La vista `disponibilidad` expone capacidad, libres y deshabilitados por zona.
Es lo único que consulta la página pública.

## Cómo se identifica al infractor

Al reportar, el usuario escribe **la placa que ve**. El sistema la busca en
`vehiculos` y resuelve al dueño. Por eso registrar el vehículo no es un
trámite decorativo: es lo que hace posible sancionar.

Si la placa no aparece en el padrón, el reporte queda sin infractor y el
administrador lo ve marcado como vehículo ajeno al campus. Ese es el valor de
seguridad que pedía el requerimiento de alertas, sin necesidad de correos
automáticos ni servidor.

## Seguridad (RLS)

| Tabla | anónimo | autenticado | administrador |
|---|---|---|---|
| zonas, espacios | leer | leer | todo |
| perfiles | — | el propio | todos |
| vehiculos | — | los propios | todos |
| asignaciones | — | las propias (solo lectura) | todas |
| reportes | — | los que hizo y los que le hicieron | todos |
| apelaciones | — | las propias; puede crear si es el acusado | todas |

Las asignaciones y los reportes no se escriben nunca con un `insert` directo:
solo a través de las funciones, que verifican las reglas. La clave `anon` es
pública por diseño; lo que limita a cada quien son estas políticas.

## Fases

1. **Hoy** — Ciclo completo funcionando: acceso, padrón, asignación por
   espacio, plazo prorrogable, reportes con evidencia, apelaciones y panel de
   administración.
2. **Casetas con QR** — Al registrar el vehículo se genera un código QR. En la
   entrada, un lector lo escanea y crea la asignación automáticamente, sin que
   el usuario tenga que marcar nada. El modelo de datos no cambia: solo cambia
   quién crea la fila.
3. **Reportes y analítica** — Ocupación por franja horaria, zonas más
   demandadas, reincidencia de infractores.

## Fuera de alcance

Sensores por espacio, cámaras lectoras de placas, barreras automáticas y
notificaciones por correo o push. Todos entran como nuevas fuentes de
asignaciones o eventos sobre el mismo esquema, sin cambiar el contrato con el
frontend.
