/* ============================================================
   MiParqueo · pruebas de la lógica de negocio

   Levanta un PostgreSQL propio (sin instalar nada en el sistema),
   crea el esquema desde cero y comprueba que las reglas se
   cumplen: quién puede solicitar, qué pasa al reportar, cuándo
   nace un strike y qué ve cada quien.

   Uso:  npm install  &&  npm test
   ============================================================ */

import EmbeddedPostgres from "embedded-postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

const pg = new EmbeddedPostgres({
  databaseDir: join(AQUI, "datos"),
  user: "postgres",
  password: "postgres",
  port: 55432,
  persistent: true,
});

let ok = 0, fallos = [];
function check(nombre, condicion, detalle = "") {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`); }
  else { fallos.push(nombre); console.log(`  FALLA ${nombre} ${detalle}`); }
}

async function esperaError(cli, sql, args, fragmento, nombre) {
  try {
    await cli.query(sql, args);
    check(nombre, false, "(no lanzó error)");
  } catch (e) {
    check(nombre, e.message.includes(fragmento), `(dijo: ${e.message})`);
  }
}

async function comoUsuario(cli, id) {
  await cli.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

async function main() {
  try { await pg.initialise(); } catch {}
  await pg.start();
  await pg.createDatabase("prueba").catch(() => {});
  const cli = pg.getPgClient("prueba");
  await cli.connect();

  // Esquema limpio
  await cli.query("drop schema if exists public cascade; create schema public;");
  await cli.query("drop schema if exists auth cascade; drop schema if exists storage cascade;");
  await cli.query("drop publication if exists supabase_realtime;");
  await cli.query(readFileSync(join(AQUI, "compat_postgres.sql"), "utf8"));
  await cli.query(readFileSync(join(RAIZ, "migrations", "0001_esquema_inicial.sql"), "utf8"));

  const nuevo = async (correo, nombre) => {
    const { rows } = await cli.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('nombre', $2::text)) returning id`,
      [correo, nombre]
    );
    return rows[0].id;
  };

  console.log("\n1. Alta de usuarios (trigger de perfil)");
  const ana = await nuevo("ana@ce.pucmm.edu.do", "Ana Pérez");
  const beto = await nuevo("beto@ce.pucmm.edu.do", "Beto Gómez");
  const admin = await nuevo("admin@pucmm.edu.do", "Lic. Gómez");
  await cli.query("update perfiles set rol='admin' where id=$1", [admin]);

  const perfiles = await cli.query("select nombre from perfiles order by nombre");
  check("se crea el perfil solo al registrarse", perfiles.rowCount === 3);
  check("toma el nombre de los metadatos",
    perfiles.rows.some((p) => p.nombre === "Ana Pérez"));

  await esperaError(cli,
    "insert into auth.users (email) values ('ana@gmail.com')", [],
    "correo_institucional", "rechaza correo no institucional");

  console.log("\n2. Vehículos");
  await comoUsuario(cli, ana);
  const { rows: [vAna] } = await cli.query(
    "insert into vehiculos (usuario_id, placa, marca, modelo, color) values ($1,'a 12-3456','Toyota','Corolla','Gris') returning id, placa",
    [ana]);
  check("normaliza la placa a mayúsculas sin guiones", vAna.placa === "A123456", `(${vAna.placa})`);

  await comoUsuario(cli, beto);
  const { rows: [vBeto] } = await cli.query(
    "insert into vehiculos (usuario_id, placa, marca, modelo, color) values ($1,'B222222','Honda','Civic','Negro') returning id",
    [beto]);

  console.log("\n3. Solicitar parqueo");
  await comoUsuario(cli, ana);
  const { rows: [asigAna] } = await cli.query("select * from solicitar_parqueo('a1', $1)", [vAna.id]);
  const { rows: [espAna] } = await cli.query("select codigo from espacios where id=$1", [asigAna.espacio_id]);
  check("asigna el primer espacio libre", espAna.codigo === "A1-001", `(${espAna.codigo})`);

  const dispo = async (z) => (await cli.query("select libres from disponibilidad where id=$1", [z])).rows[0].libres;
  check("la disponibilidad baja sola", (await dispo("a1")) === "119", `(${await dispo("a1")})`);

  await esperaError(cli, "select solicitar_parqueo('b1', $1)", [vAna.id],
    "Ya tienes un parqueo asignado", "impide pedir dos a la vez");

  await esperaError(cli, "select solicitar_parqueo('a1', $1)", [vBeto.id],
    "registrado a tu nombre", "impide usar vehículo ajeno");

  console.log("\n4. Extender");
  const antes = new Date(asigAna.vence_en).getTime();
  const { rows: [ext] } = await cli.query("select * from extender_parqueo()");
  const delta = (new Date(ext.vence_en).getTime() - antes) / 3600000;
  check("extender suma 6 horas", Math.abs(delta - 6) < 0.05, `(${delta.toFixed(2)}h)`);
  check("cuenta las extensiones", ext.extensiones === 1);

  console.log("\n5. Reportar y reasignar");
  await comoUsuario(cli, beto);
  await cli.query("select solicitar_parqueo('a1', $1)", [vBeto.id]);
  const { rows: [reasig] } = await cli.query(
    "select * from reportar_y_reasignar('A123456','Llegué y su carro estaba en mi espacio','http://foto')");
  const { rows: [espNuevo] } = await cli.query("select codigo from espacios where id=$1", [reasig.espacio_id]);
  check("reportar reasigna otro espacio", espNuevo.codigo === "A1-003", `(${espNuevo.codigo})`);

  const { rows: [rep] } = await cli.query("select * from reportes limit 1");
  check("el reporte nace pendiente, no valida solo", rep.estado === "pendiente");
  check("resuelve al infractor por la placa", rep.infractor_id === ana);
  check("guarda la evidencia", rep.foto_url === "http://foto");

  await comoUsuario(cli, ana);
  check("un reporte pendiente no es strike",
    (await cli.query("select strikes_de($1) s", [ana])).rows[0].s === 0);

  console.log("\n6. El administrador decide");
  await comoUsuario(cli, admin);
  await cli.query("select resolver_reporte($1, true, 'La foto muestra la placa')", [rep.id]);
  check("validar crea el strike",
    (await cli.query("select strikes_de($1) s", [ana])).rows[0].s === 1);

  await comoUsuario(cli, beto);
  await esperaError(cli, "select resolver_reporte($1, true, null)", [rep.id],
    "Solo un administrador", "un usuario normal no puede validar");

  console.log("\n7. Apelación");
  await comoUsuario(cli, ana);
  await cli.query("insert into apelaciones (reporte_id, usuario_id, texto) values ($1,$2,'Mi carro estaba en el taller')",
    [rep.id, ana]);
  const { rows: [ape] } = await cli.query("select id from apelaciones limit 1");
  await comoUsuario(cli, admin);
  await cli.query("select resolver_apelacion($1, true, 'Presentó factura')", [ape.id]);
  check("aceptar la apelación borra el strike",
    (await cli.query("select strikes_de($1) s", [ana])).rows[0].s === 0);

  console.log("\n8. Suspensión a los 3 strikes");
  for (let i = 0; i < 3; i++) {
    await cli.query(
      `insert into reportes (reportante_id, espacio_id, placa_reportada, infractor_id, descripcion, estado)
       select $1, id, 'A123456', $2, 'prueba', 'validado' from espacios limit 1`,
      [beto, ana]);
  }
  check("acumula 3 strikes",
    (await cli.query("select strikes_de($1) s", [ana])).rows[0].s === 3);
  await comoUsuario(cli, ana);
  await cli.query("select marcar_salida()");
  await esperaError(cli, "select solicitar_parqueo('a1', $1)", [vAna.id],
    "suspendido", "con 3 strikes no puede solicitar");

  console.log("\n9. Salida y espacios deshabilitados");
  check("marcar salida devolvió el espacio", (await dispo("a1")) === "119", `(${await dispo("a1")})`);

  await comoUsuario(cli, admin);
  const { rows: espacios } = await cli.query("select id from espacios where zona_id='pg' limit 5");
  for (const e of espacios) await cli.query("select habilitar_espacio($1, false, 'Mantenimiento')", [e.id]);
  const pgz = (await cli.query("select capacidad, libres from disponibilidad where id='pg'")).rows[0];
  check("deshabilitar baja la capacidad", pgz.capacidad === "40", `(${pgz.capacidad})`);

  await comoUsuario(cli, beto);
  await esperaError(cli, "select habilitar_espacio($1, false, 'x')", [espacios[0].id],
    "Solo un administrador", "un usuario normal no deshabilita espacios");

  console.log("\n10. Seguridad por filas (como rol authenticated)");
  await cli.query("set role authenticated");
  await comoUsuario(cli, beto);
  const vistos = await cli.query("select placa from vehiculos");
  check("solo ve sus propios vehículos",
    vistos.rowCount === 1 && vistos.rows[0].placa === "B222222",
    `(vio ${vistos.rowCount})`);
  const zonasPub = await cli.query("select id from zonas");
  check("las zonas siguen siendo públicas", zonasPub.rowCount === 3);
  await cli.query("reset role");

  console.log(`\n=== ${ok} pruebas ok, ${fallos.length} fallando ===`);
  if (fallos.length) console.log("Fallando:", fallos.join(", "));

  await cli.end();
  await pg.stop();
  process.exit(fallos.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nERROR:", e.message);
  try { await pg.stop(); } catch {}
  process.exit(1);
});
