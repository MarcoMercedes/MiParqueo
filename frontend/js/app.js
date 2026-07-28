/* ============================================================
   MiParqueo · controlador de la aplicación

   Una sola página. Aquí se decide qué sección se ve, quién ha
   iniciado sesión y qué puede hacer. Cada sección vive en su
   propio archivo (disponibilidad, panel, admin) y este las llama.
   ============================================================ */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Sin sesión no se ve nada de la aplicación: lo primero y lo único
  // es el acceso.
  const VISTAS = {
    entrar: { seccion: "vistaEntrar", soloInvitado: true },
    inicio: { seccion: "vistaInicio", requiereSesion: true },
    panel: { seccion: "vistaPanel", requiereSesion: true },
    admin: { seccion: "vistaAdmin", requiereAdmin: true },
  };

  let perfil = null;
  let vistaActual = null;

  // ---------- Estado de sesión ----------

  function pintarSesion() {
    const hay = !!perfil;
    const esAdmin = hay && perfil.rol === "admin";

    document.querySelectorAll("[data-si-sesion]").forEach((el) => (el.hidden = !hay));
    document.querySelectorAll("[data-si-invitado]").forEach((el) => (el.hidden = hay));
    document.querySelectorAll("[data-si-admin]").forEach((el) => (el.hidden = !esAdmin));

    $("usuarioNombre").textContent = hay ? perfil.nombre : "";
  }

  async function releerPerfil() {
    perfil = MiParqueo.configurado ? await MiParqueo.perfil() : null;
    pintarSesion();
  }

  // ---------- Navegación ----------

  function irA(nombre, { reemplazar = false } = {}) {
    let destino = VISTAS[nombre] ? nombre : (perfil ? "inicio" : "entrar");
    const v = VISTAS[destino];

    // Reglas de acceso: nadie llega a donde no le toca, ni escribiendo
    // la dirección a mano.
    if (v.requiereAdmin && (!perfil || perfil.rol !== "admin")) destino = perfil ? "panel" : "entrar";
    else if (v.requiereSesion && !perfil) destino = "entrar";
    else if (v.soloInvitado && perfil) destino = "panel";

    if (destino !== vistaActual) {
      if (vistaActual === "panel") Panel.ocultar();

      Object.entries(VISTAS).forEach(([nombre, cfg]) => {
        $(cfg.seccion).hidden = nombre !== destino;
      });

      document.querySelectorAll(".nav__enlace").forEach((b) =>
        b.classList.toggle("nav__enlace--activo", b.dataset.ir === destino)
      );

      vistaActual = destino;
      window.scrollTo({ top: 0, behavior: "auto" });

      if (destino === "panel") Panel.mostrar();
      if (destino === "admin") Admin.mostrar();
    }

    const hash = `#${destino}`;
    if (location.hash !== hash) {
      if (reemplazar) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }
  }

  function vistaDeLaDireccion() {
    const nombre = location.hash.replace(/^#/, "");
    if (VISTAS[nombre]) return nombre;
    return perfil ? "inicio" : "entrar";
  }

  // Cualquier elemento con data-ir cambia de sección.
  document.addEventListener("click", (e) => {
    const disparador = e.target.closest("[data-ir]");
    if (!disparador) return;
    e.preventDefault();
    irA(disparador.dataset.ir);
  });

  // popstate cubre el botón atrás; hashchange cubre que alguien escriba
  // la dirección a mano.
  window.addEventListener("popstate", () => irA(vistaDeLaDireccion(), { reemplazar: true }));
  window.addEventListener("hashchange", () => irA(vistaDeLaDireccion(), { reemplazar: true }));

  // ---------- Acceso ----------

  const formEntrar = $("formEntrar");
  const avisoAcceso = $("avisoAcceso");
  let modoAcceso = "clave"; // "clave" | "enlace"

  function avisarAcceso(texto, tipo) {
    avisoAcceso.textContent = texto;
    avisoAcceso.className = `aviso aviso--${tipo}`;
    avisoAcceso.hidden = false;
  }

  function pintarModoAcceso() {
    const conClave = modoAcceso === "clave";
    $("campoClave").hidden = !conClave;
    $("campoNombre").hidden = conClave;
    $("clave").required = conClave;
    $("btnEnviar").textContent = conClave ? "Entrar" : "Enviarme el enlace";
    $("btnAlternar").textContent = conClave
      ? "¿Primera vez? Entrar con un enlace por correo"
      : "Ya tengo contraseña";
    avisoAcceso.hidden = true;
  }

  $("btnAlternar").addEventListener("click", () => {
    modoAcceso = modoAcceso === "clave" ? "enlace" : "clave";
    pintarModoAcceso();
  });

  formEntrar.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo = $("correo").value.trim().toLowerCase();
    if (!/^[^@\s]+@(ce\.)?pucmm\.edu\.do$/.test(correo)) {
      avisarAcceso("Usa tu correo institucional (@pucmm.edu.do o @ce.pucmm.edu.do).", "error");
      $("correo").focus();
      return;
    }

    const boton = $("btnEnviar");
    const original = boton.textContent;
    boton.disabled = true;
    boton.textContent = modoAcceso === "clave" ? "Entrando…" : "Enviando…";

    try {
      if (modoAcceso === "clave") {
        if (!$("clave").value) {
          avisarAcceso("Escribe tu contraseña.", "error");
          return;
        }
        await MiParqueo.entrarConClave(correo, $("clave").value);
        formEntrar.reset();
        avisoAcceso.hidden = true;
        await releerPerfil();
        Disponibilidad.iniciar();
        irA("inicio");
        return;
      }

      await MiParqueo.enviarEnlace(correo, $("nombre").value, location.href.split("#")[0] + "#panel");
      avisarAcceso(
        `Listo. Te enviamos un enlace a ${correo}. Ábrelo desde este mismo dispositivo.`,
        "ok"
      );
      formEntrar.reset();
    } catch (error) {
      avisarAcceso(error.message, "error");
    } finally {
      boton.disabled = false;
      boton.textContent = original;
    }
  });

  $("btnSalir").addEventListener("click", async () => {
    await MiParqueo.cerrarSesion();
    perfil = null;
    Panel.reiniciar();
    pintarSesion();
    irA("entrar");
  });

  // ---------- Modales (comunes a todas las secciones) ----------

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close")) modal.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
  });

  // ---------- Arranque ----------

  (async function iniciar() {
    pintarModoAcceso();

    if (!MiParqueo.configurado) {
      avisarAcceso(
        "La aplicación todavía no está conectada a Supabase. Completa frontend/js/config.js.",
        "error"
      );
      $("btnEnviar").disabled = true;
    } else {
      // Se espera a saber si hay sesión antes de decidir la vista:
      // así el enlace mágico del correo no cae en la pantalla de acceso.
      await releerPerfil();
      if (perfil) Disponibilidad.iniciar();
    }

    $("cargando").hidden = true;
    irA(vistaDeLaDireccion(), { reemplazar: true });
  })();
})();
