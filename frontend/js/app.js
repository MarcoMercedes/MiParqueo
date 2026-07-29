/* ============================================================
   MiParqueo · controlador de la aplicación

   Una sola página. Aquí se decide qué sección se ve, quién ha
   iniciado sesión y qué le toca a cada quien.

   Estudiantes y administración usan la misma aplicación pero no
   comparten nada: el estudiante solicita y reporta; la
   administración revisa. Un administrador no parquea.
   ============================================================ */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const VISTAS = {
    entrar: { seccion: "vistaEntrar", soloInvitado: true },
    inicio: { seccion: "vistaInicio", soloEstudiante: true },
    perfil: { seccion: "vistaPerfil", soloEstudiante: true },
    admin: { seccion: "vistaAdmin", soloAdmin: true },
  };

  let perfil = null;
  let vistaActual = null;

  const esAdmin = () => !!perfil && perfil.rol === "admin";
  const esEstudiante = () => !!perfil && perfil.rol !== "admin";

  // A dónde va cada quien al entrar.
  const vistaPorDefecto = () => (!perfil ? "entrar" : esAdmin() ? "admin" : "inicio");

  // ---------- Estado de sesión ----------

  function pintarSesion() {
    document.querySelectorAll("[data-si-sesion]").forEach((el) => (el.hidden = !perfil));
    document.querySelectorAll("[data-si-invitado]").forEach((el) => (el.hidden = !!perfil));
    document.querySelectorAll("[data-si-admin]").forEach((el) => (el.hidden = !esAdmin()));
    document.querySelectorAll("[data-si-estudiante]").forEach((el) => (el.hidden = !esEstudiante()));
    $("usuarioNombre").textContent = perfil ? perfil.nombre : "";
  }

  async function releerPerfil() {
    perfil = MiParqueo.configurado ? await MiParqueo.perfil() : null;
    pintarSesion();
  }

  // ---------- Navegación ----------

  function permitida(nombre) {
    const v = VISTAS[nombre];
    if (!v) return false;
    if (v.soloInvitado) return !perfil;
    if (v.soloAdmin) return esAdmin();
    if (v.soloEstudiante) return esEstudiante();
    return !!perfil;
  }

  function irA(nombre, { reemplazar = false } = {}) {
    // Nadie llega a donde no le toca, ni escribiendo la dirección a mano.
    const destino = permitida(nombre) ? nombre : vistaPorDefecto();

    if (destino !== vistaActual) {
      if (vistaActual === "inicio") Parqueo.ocultar();

      Object.entries(VISTAS).forEach(([n, cfg]) => {
        $(cfg.seccion).hidden = n !== destino;
      });

      document.querySelectorAll(".nav__enlace").forEach((b) =>
        b.classList.toggle("nav__enlace--activo", b.dataset.ir === destino)
      );

      vistaActual = destino;
      window.scrollTo({ top: 0, behavior: "auto" });

      if (destino === "inicio") Parqueo.mostrar();
      if (destino === "perfil") Perfil.mostrar();
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
    return VISTAS[nombre] ? nombre : vistaPorDefecto();
  }

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

  function avisarAcceso(texto, tipo) {
    avisoAcceso.textContent = texto;
    avisoAcceso.className = `aviso aviso--${tipo}`;
    avisoAcceso.hidden = false;
  }

  formEntrar.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo = $("correo").value.trim().toLowerCase();
    if (!/^[^@\s]+@(ce\.)?pucmm\.edu\.do$/.test(correo)) {
      avisarAcceso("Usa tu correo institucional (@pucmm.edu.do o @ce.pucmm.edu.do).", "error");
      $("correo").focus();
      return;
    }
    if (!$("clave").value) {
      avisarAcceso("Escribe tu contraseña.", "error");
      $("clave").focus();
      return;
    }

    const boton = $("btnEnviar");
    boton.disabled = true;
    boton.textContent = "Entrando…";

    try {
      await MiParqueo.entrarConClave(correo, $("clave").value);
      formEntrar.reset();
      avisoAcceso.hidden = true;
      await releerPerfil();
      irA(vistaPorDefecto());
    } catch (error) {
      avisarAcceso(error.message, "error");
    } finally {
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
  });

  $("btnSalir").addEventListener("click", async () => {
    await MiParqueo.cerrarSesion();
    perfil = null;
    Parqueo.reiniciar();
    Perfil.reiniciar();
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
    if (!MiParqueo.configurado) {
      avisarAcceso(
        "La aplicación todavía no está conectada a Supabase. Completa frontend/js/config.js.",
        "error"
      );
      $("btnEnviar").disabled = true;
    } else {
      // Se espera a saber si hay sesión antes de decidir la vista: si no,
      // quien ya entró vería la pantalla de acceso por un instante.
      await releerPerfil();

      if (esEstudiante()) {
        // La disponibilidad cambia mientras miras la pantalla.
        MiParqueo.suscribir(() => Parqueo.refrescarZonas());
        setInterval(() => {
          if (!document.hidden) Parqueo.refrescarZonas();
        }, 30000);
      }
    }

    $("cargando").hidden = true;
    irA(vistaDeLaDireccion(), { reemplazar: true });
  })();
})();
