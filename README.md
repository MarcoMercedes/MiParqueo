# MiParqueo · PUCMM

Aplicación web para gestionar los parqueos del Campus Santo Tomás de Aquino
(PUCMM, Santo Domingo). Proyecto Integrador de Software.

Consultas la disponibilidad antes de salir de casa, solicitas un espacio
concreto desde el celular y lo liberas al irte. Si alguien se te pone en el
espacio asignado, lo reportas con foto y el sistema te da otro al instante.

## Qué hace

- **Disponibilidad en vivo por zona** (A1, B1 y Posgrado), pública y sin
  necesidad de cuenta. Semáforo: verde con espacios, ámbar casi llena, rojo
  llena.
- **Acceso con correo institucional**, sin contraseñas: llega un enlace y
  entras.
- **Padrón de vehículos**: placa, marca, modelo y color.
- **Asignación de espacios numerados** (`A1-037`) por seis horas, prorrogables
  las veces que haga falta. No puedes pedir otro hasta marcar tu salida.
- **Cuenta regresiva** en pantalla y aviso del navegador cuando quedan 15
  minutos.
- **Reportar y reasignar**: si tu espacio está ocupado, reportas la placa con
  foto y el sistema te asigna otro sin que tengas que pedirlo.
- **Strikes con revisión humana**: un reporte no sanciona a nadie por sí solo.
  Un administrador revisa la evidencia; a los tres strikes validados el usuario
  pierde el acceso y se le aplica la multa. El acusado puede apelar.
- **Panel de administración**: cola de reportes, apelaciones y habilitar o
  deshabilitar espacios (mantenimiento o reserva).

## Cómo verlo

```bash
cd frontend
python -m http.server 4000
```

Abre `http://localhost:4000`.

La aplicación necesita un proyecto de Supabase para funcionar; sin
credenciales lo dice claramente en vez de mostrar datos inventados. La
configuración toma unos diez minutos: [supabase/README.md](supabase/README.md).

## Estructura

```
miparqueo/
├── frontend/
│   ├── index.html                 Disponibilidad pública (incluye el mapa SVG)
│   ├── entrar.html                Acceso con enlace mágico
│   ├── app.html                   Panel del usuario
│   ├── admin.html                 Panel del administrador
│   ├── css/styles.css             Paleta institucional + semáforo
│   ├── js/config.js               Credenciales de Supabase
│   ├── js/data.js                 Único punto de contacto con Supabase
│   ├── js/app.js                  Página pública
│   ├── js/entrar.js               Acceso
│   ├── js/panel.js                Panel del usuario
│   ├── js/admin.js                Panel del administrador
│   └── assets/                    Favicon, mapa y foto del campus
├── supabase/
│   ├── migrations/0001_esquema_inicial.sql   Todo el sistema en un script
│   └── README.md                             Guía de configuración
└── docs/
    └── ARQUITECTURA.md            Decisiones, modelo de datos y seguridad
```

## Cómo funciona por dentro

Frontend estático sin frameworks ni build. Toda la lógica de negocio vive en
funciones de PostgreSQL, así que no se puede saltar desde el navegador.

La ocupación no se guarda en ningún contador: un espacio está ocupado si tiene
una asignación sin salida y sin vencer. Por eso no hay nada que pueda
descuadrarse, y una salida que el usuario olvidó marcar se cura sola al
vencerse el plazo.

Detalle completo en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Equipo

Ricardo Díaz · Juan David Taveras · Marco Mercedes · Juan Pablo Lockhart
PUCMM · Proyecto Integrador de Software
