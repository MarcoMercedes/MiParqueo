# MiParqueo · PUCMM

Aplicación web para consultar la disponibilidad de parqueos en el Campus
Santo Tomás de Aquino (PUCMM, Santo Domingo) antes de llegar. Proyecto
Integrador de Software.

## Qué hace

- **Mapa interactivo del campus** con las zonas A1, B1 y Posgrado: cada una
  muestra sus espacios libres en vivo y al tocarla lleva a su detalle.
- **Semáforo de disponibilidad**: verde (con espacios), ámbar (casi llena),
  rojo (llena). El color siempre significa disponibilidad.
- **Tres acciones, nada más**: ver disponibilidad, registrar mi vehículo,
  reportar un problema.
- **Tiempo real** con Supabase Realtime; sin backend configurado corre en
  modo demostración con datos simulados.

## Cómo verlo

```bash
cd frontend
python3 -m http.server 8080
# abrir http://localhost:8080
```

O abre `frontend/index.html` directo en el navegador. Verás el indicador
"Demostración"; para datos reales sigue [supabase/README.md](supabase/README.md).

## Estructura

```
miparqueo/
├── frontend/
│   ├── index.html                 Página única (incluye el mapa SVG)
│   ├── css/styles.css             Estilos (paleta institucional + semáforo)
│   ├── js/config.js               Credenciales de Supabase (vacío = demo)
│   ├── js/data.js                 Capa de datos: supabase | demo
│   ├── js/app.js                  Render, mapa interactivo, contadores
│   └── assets/                    Favicon y foto del campus (ver LEEME.md)
├── supabase/
│   ├── migrations/0001_esquema_inicial.sql
│   └── README.md                  Guía de configuración paso a paso
└── docs/
    └── ARQUITECTURA.md            Decisiones, modelo de datos, seguridad
```

## Equipo

Ricardo Díaz · Juan David Taveras · Marco Mercedes · Juan Pablo Lockhart
PUCMM · Proyecto Integrador de Software
