"""Arma entregable.zip con lo que hace falta para revisar el proyecto.

Se excluye todo lo que no aporta a la revision: dependencias descargadas,
el cluster de PostgreSQL que crean las pruebas, y la configuracion local
del entorno de trabajo.
"""
import os, zipfile, datetime

RAIZ = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.path.join(RAIZ, "entregable.zip")

INCLUIR = [
    "README.md",
    "docs/ARQUITECTURA.md",
    "frontend/index.html",
    "frontend/delimitar.html",
    "frontend/css/styles.css",
    "frontend/js/config.js",
    "frontend/js/data.js",
    "frontend/js/app.js",
    "frontend/js/parqueo.js",
    "frontend/js/perfil.js",
    "frontend/js/admin.js",
    "frontend/js/zonas-mapa.js",
    "frontend/js/delimitar.js",
    "frontend/assets/logo-pucmm.png",
    "frontend/assets/favicon.png",
    "frontend/assets/mapa_pucmm.jpg",
    "supabase/README.md",
    "supabase/migrations/0001_esquema_inicial.sql",
    "supabase/migrations/0002_ajustes.sql",
    "supabase/local/README.md",
    "supabase/local/compat_postgres.sql",
    "supabase/local/pruebas.mjs",
    "supabase/local/package.json",
]

PORTADA = """MiParqueo · Sistema de gestion de parqueos
Pontificia Universidad Catolica Madre y Maestra
Campus Santo Tomas de Aquino, Santo Domingo

Proyecto Integrador de Software
Ricardo Diaz  ·  Juan David Taveras  ·  Marco Mercedes  ·  Juan Pablo Lockhart


APLICACION EN FUNCIONAMIENTO
============================

    https://marcomercedes.github.io/MiParqueo/

Cuentas de prueba (todas con la contrasena  hola123 ):

    admin@pucmm.edu.do          Administracion   revisa reportes
    rado0001@ce.pucmm.edu.do    Ricardo Diaz     estudiante
    jdtd0002@ce.pucmm.edu.do    Juan David Taveras
    mjma0003@ce.pucmm.edu.do    Marco Mercedes

El ciclo completo se recorre en cuatro pasos: reservar una zona desde el
mapa, ver el espacio numerado asignado con su cuenta regresiva, reportar
con foto a quien lo ocupe, y revisar ese reporte desde la cuenta de
administracion. Validarlo lo convierte en strike; a los tres, multa y
suspension.


CONTENIDO
=========

  README.md                 Alcance del sistema y estructura del proyecto
  docs/ARQUITECTURA.md      Decisiones de diseno, modelo de datos y seguridad

  frontend/                 La aplicacion: HTML, CSS y JavaScript sin
                            frameworks ni compilacion

  supabase/migrations/      La base de datos, en dos scripts
  supabase/local/           Pruebas de la logica de negocio


BASE DE DATOS
=============

Se entrega el script que la construye, no un volcado. Sobre un PostgreSQL
limpio, en orden:

    supabase/migrations/0001_esquema_inicial.sql
    supabase/migrations/0002_ajustes.sql

Crea las cuatro zonas, los 1.200 espacios numerados -B1 y Posgrado Torre
repartidos en seis pisos de cincuenta-, las funciones que gobiernan las
reservas y las politicas de acceso por filas.

Esta escrito para Supabase. Fuera de Supabase, ejecutar antes
supabase/local/compat_postgres.sql. Detalles en supabase/README.md.


PRUEBAS
=======

    cd supabase/local
    npm install
    npm test

28 pruebas sobre una base de datos real que el propio script levanta.
Cubren, entre otras cosas, que un reporte no sancione por si solo, que
dos personas no puedan quedarse con el mismo espacio, que los pisos se
llenen de abajo hacia arriba y que un estudiante no vea los datos de otro.


EJECUCION LOCAL
===============

    cd frontend
    python -m http.server 4000

Las credenciales de la base de datos ya vienen en frontend/js/config.js.
"""


def main():
    faltan = [r for r in INCLUIR if not os.path.exists(os.path.join(RAIZ, r))]
    if faltan:
        raise SystemExit("Faltan archivos: " + ", ".join(faltan))

    if os.path.exists(DESTINO):
        os.remove(DESTINO)

    with zipfile.ZipFile(DESTINO, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("MiParqueo/LEEME-PRIMERO.txt", PORTADA)
        for rel in INCLUIR:
            z.write(os.path.join(RAIZ, rel), f"MiParqueo/{rel}")

    tam = os.path.getsize(DESTINO)
    print(f"entregable.zip  ·  {len(INCLUIR) + 1} archivos  ·  {tam / 1024:.0f} KB")
    with zipfile.ZipFile(DESTINO) as z:
        for n in z.namelist():
            print("   ", n)


if __name__ == "__main__":
    main()
