/* ============================================================
   MiParqueo · pantalla de acceso

   Dos formas de entrar:
   - Contraseña: inmediata, para cuentas ya creadas.
   - Enlace mágico: crea la cuenta la primera vez y no exige
     recordar ninguna contraseña.
   ============================================================ */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const form = $("formEntrar");
  const correo = $("correo");
  const clave = $("clave");
  const nombre = $("nombre");
  const boton = $("btnEnviar");
  const alternar = $("btnAlternar");
  const aviso = $("aviso");

  let modo = "clave"; // "clave" | "enlace"

  function mostrar(texto, tipo) {
    aviso.textContent = texto;
    aviso.className = `aviso aviso--${tipo}`;
    aviso.hidden = false;
  }

  function limpiar() {
    aviso.hidden = true;
  }

  function pintarModo() {
    const conClave = modo === "clave";
    $("campoClave").hidden = !conClave;
    $("campoNombre").hidden = conClave;
    clave.required = conClave;
    boton.textContent = conClave ? "Entrar" : "Enviarme el enlace";
    alternar.textContent = conClave
      ? "¿Primera vez? Entrar con un enlace por correo"
      : "Ya tengo contraseña";
    limpiar();
  }

  alternar.addEventListener("click", () => {
    modo = modo === "clave" ? "enlace" : "clave";
    pintarModo();
  });

  if (!MiParqueo.configurado) {
    mostrar(
      "La aplicación todavía no está conectada a Supabase. Completa frontend/js/config.js con la URL y la clave publishable.",
      "error"
    );
    boton.disabled = true;
    return;
  }

  // Si ya hay sesión abierta, no tiene sentido pedir el correo otra vez.
  MiParqueo.sesion().then((sesion) => {
    if (sesion) window.location.replace("app.html");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const valor = correo.value.trim().toLowerCase();
    if (!/^[^@\s]+@(ce\.)?pucmm\.edu\.do$/.test(valor)) {
      mostrar("Usa tu correo institucional (@pucmm.edu.do o @ce.pucmm.edu.do).", "error");
      correo.focus();
      return;
    }

    const original = boton.textContent;
    boton.disabled = true;
    boton.textContent = modo === "clave" ? "Entrando…" : "Enviando…";

    try {
      if (modo === "clave") {
        if (!clave.value) {
          mostrar("Escribe tu contraseña.", "error");
          clave.focus();
          return;
        }
        await MiParqueo.entrarConClave(valor, clave.value);
        window.location.replace("app.html");
        return;
      }

      const destino = new URL("app.html", window.location.href).href;
      await MiParqueo.enviarEnlace(valor, nombre.value, destino);
      mostrar(
        `Listo. Te enviamos un enlace a ${valor}. Ábrelo desde este mismo dispositivo.`,
        "ok"
      );
      form.reset();
    } catch (error) {
      mostrar(error.message, "error");
    } finally {
      boton.disabled = false;
      boton.textContent = original;
    }
  });

  pintarModo();
})();
