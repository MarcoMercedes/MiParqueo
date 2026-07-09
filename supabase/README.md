# Supabase · guía de configuración

Pasos para pasar del modo demostración a datos reales. Toma unos 10 minutos.

## 1. Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (el plan
   gratuito es suficiente para este proyecto).
2. **New project** → nombre `miparqueo`, región `East US` (la más cercana a
   República Dominicana), y una contraseña fuerte para la base de datos
   (guárdala; no va en el código).

## 2. Crear el esquema

1. En el panel del proyecto: **SQL Editor → New query**.
2. Pega el contenido completo de
   [`migrations/0001_esquema_inicial.sql`](migrations/0001_esquema_inicial.sql)
   y ejecuta (**Run**).
3. Verifica en **Table Editor** que existen `zonas`, `vehiculos`, `eventos`
   e `incidencias`, y que `zonas` tiene las 3 filas iniciales.

## 3. Conectar el frontend

1. En **Project Settings → API** copia:
   - **Project URL**
   - **anon public key** (esta clave está diseñada para usarse en el
     navegador; las políticas RLS limitan lo que puede hacer)
2. Pégalas en [`frontend/js/config.js`](../frontend/js/config.js).
3. Abre la página: el indicador cambia de "Demostración" a "En vivo".

## 4. Probar el tiempo real

En **SQL Editor** simula una entrada a la zona A1:

```sql
insert into public.eventos (zona_id, tipo) values ('a1', 'entrada');
```

El contador de A1 en la página debe bajar en 1 sin recargar.

## Importante

- La clave **service_role** nunca va en el frontend ni en el repositorio.
  Es solo para el software de las casetas (lado servidor).
- Si el dominio del correo institucional no es `@pucmm.edu.do` /
  `@ce.pucmm.edu.do`, ajusta la restricción `correo_institucional` en el SQL.
