# Conectar MiParqueo a Supabase

Cinco pasos. La primera vez toma unos diez minutos.

## 1. Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (es gratis y
   no pide tarjeta).
2. **New project**: nombre `miparqueo`, región `East US` (la más cercana a
   República Dominicana) y una contraseña fuerte para la base de datos
   (guárdala aparte; no va en el código).
3. Espera a que termine de aprovisionar, un par de minutos.

## 2. Crear las tablas

1. En el menú lateral: **SQL Editor → New query**.
2. Copia todo el contenido de
   [`migrations/0001_esquema_inicial.sql`](migrations/0001_esquema_inicial.sql)
   y pégalo.
3. **Run**. Debe decir *Success*.

Eso crea las tablas, los 255 espacios numerados (120 en A1, 90 en B1 y 45 en
Posgrado), las reglas de negocio, la seguridad por filas y el bucket donde se
guardan las fotos de evidencia.

## 3. Pegar las credenciales

1. **Project Settings → API**.
2. Copia **Project URL** y la clave **anon public**.
3. Pégalas en [`../frontend/js/config.js`](../frontend/js/config.js):

```js
window.MIPARQUEO_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
};
```

La clave `anon` es pública por diseño: viaja al navegador de cualquiera que
abra la página. Lo que protege los datos son las políticas RLS del script, no
el secreto de esa clave. La clave **service_role** nunca va en el frontend ni
en el repositorio.

## 4. Permitir el enlace mágico

En **Authentication → URL Configuration**, agrega a *Redirect URLs* la
dirección desde la que vas a abrir la aplicación:

- Pruebas locales: `http://localhost:4000/**`
- Si la publicas: `https://tuusuario.github.io/**`

Sin esto, el enlace que llega al correo devuelve un error de redirección.

> El plan gratuito envía pocos correos por hora. Para una demo con varias
> cuentas, créalas con antelación o configura tu propio SMTP en
> **Authentication → Emails**.

## 5. Hacerte administrador

Los administradores validan reportes, resuelven apelaciones y deshabilitan
espacios. A propósito no hay forma de auto-nombrarse desde la aplicación.

1. Abre la aplicación y crea tu cuenta con el correo institucional.
2. Vuelve al **SQL Editor** y corre:

```sql
update public.perfiles
   set rol = 'admin'
 where correo = 'tucorreo@ce.pucmm.edu.do';
```

3. Recarga: aparece el enlace **Administración** en la barra superior.

---

## Comprobar que funciona

```bash
cd frontend
python -m http.server 4000
```

Abre `http://localhost:4000`. Si dice **En vivo** y muestra los números reales
de cada zona, está conectado. Si dice **Sin conexión**, revisa el paso 3.

Recorrido corto para ver el ciclo completo:

1. Entra, registra un vehículo y solicita parqueo en A1.
2. Te asigna un espacio (`A1-001`) y arranca el reloj de seis horas.
3. Abre la página pública en otra ventana: A1 muestra un espacio menos.
4. Marca la salida. El número sube al instante en la otra ventana.

## Notas para la presentación

- **Los proyectos gratuitos se pausan tras una semana sin actividad.** Entra al
  panel de Supabase el día antes y reactívalo si hace falta.
- **Solo se aceptan correos `@pucmm.edu.do` y `@ce.pucmm.edu.do`.** Para probar
  con otro correo, comenta la restricción `correo_institucional` de la tabla
  `perfiles` y la validación equivalente en `frontend/js/entrar.js`.

## Cómo se entrega la base de datos

El entregable no es la base de datos en la nube, es el script que la crea.
Cualquiera puede correr `0001_esquema_inicial.sql` en un PostgreSQL limpio y
obtener el sistema completo con sus datos iniciales.
