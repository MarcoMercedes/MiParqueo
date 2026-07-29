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

Recorrido sugerido:
  1. Entrar como estudiante. En el mapa del campus cada zona esta
     delimitada y muestra sus espacios libres en vivo.
  2. Tocar una zona y reservar. El sistema asigna un espacio numerado
     concreto por seis horas, llenando los pisos de abajo hacia arriba.
  3. "Hay alguien en mi espacio": reportar con foto. El sistema crea el
     reporte y reasigna otro espacio en el acto.
  4. Entrar como administracion y revisar ese reporte con su evidencia.
     Validarlo lo convierte en strike; a los tres, multa y suspension.


QUE HAY EN ESTE PAQUETE
=======================

  README.md                 Que hace el sistema y como esta organizado
  docs/ARQUITECTURA.md      Decisiones de diseno, modelo de datos y seguridad

  frontend/                 La aplicacion. HTML, CSS y JavaScript sin
                            frameworks ni compilacion: se abre y funciona

  supabase/migrations/      LA BASE DE DATOS. Dos scripts que la crean
                            entera, con sus 1.200 espacios, sus reglas de
                            negocio y su seguridad por filas

  supabase/local/           Pruebas automaticas de la logica de negocio


LA BASE DE DATOS
================

No se entrega una base de datos, se entrega el script que la construye.
Correr en un PostgreSQL limpio, en este orden:

    supabase/migrations/0001_esquema_inicial.sql
    supabase/migrations/0002_ajustes.sql

Eso crea las cuatro zonas, los 1.200 espacios numerados, las funciones
que gobiernan las reservas y las politicas de acceso.

El script esta escrito para Supabase. Para correrlo en cualquier otro
PostgreSQL, ejecutar antes supabase/local/compat_postgres.sql, que crea
las piezas que Supabase trae de fabrica.

Instrucciones detalladas en supabase/README.md.


PRUEBAS
=======

Las reglas de negocio estan cubiertas por 28 pruebas automaticas que
levantan su propio PostgreSQL, sin instalar nada en el sistema:

    cd supabase/local
    npm install
    npm test

Comprueban, entre otras cosas, que un reporte no sancione por si solo,
que dos personas no puedan quedarse con el mismo espacio, que los pisos
se llenen en orden y que un estudiante no vea los datos de otro.


COMO VER LA APLICACION SIN INTERNET
===================================

    cd frontend
    python -m http.server 4000

Y abrir http://localhost:4000  (necesita conexion a la base de datos
para mostrar datos; las credenciales ya vienen en frontend/js/config.js).
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
