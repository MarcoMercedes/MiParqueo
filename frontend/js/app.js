/* ============================================================
   MiParqueo · lógica de interfaz
   - Renderiza tarjetas y mapa a partir de la capa de datos
   - Anima los contadores al cambiar la disponibilidad
   - Sincroniza mapa ↔ tarjetas (clic en zona del mapa)
   - Modal de registro / reporte (pantalla de boceto)
   ============================================================ */

(function () {
  "use strict";

  const grid = document.getElementById("zonasGrid");
  const heroMeta = document.getElementById("heroMeta");
  const liveLabel = document.getElementById("liveLabel");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  liveLabel.textContent = ParqueoData.modo === "supabase" ? "En vivo" : "Demostración";

  // ---------- Estado según ocupación ----------
  function estadoDeZona(libres, capacidad) {
    if (libres === 0) return { sufijo: "lleno", texto: "Llena" };
    if (libres / capacidad <= 0.2) return { sufijo: "medio", texto: "Casi llena" };
    return { sufijo: "ok", texto: "Con espacios" };
  }

  // ---------- Tarjetas ----------
  function tarjetaZona(z) {
    const libres = z.capacidad - z.ocupados;
    const estado = estadoDeZona(libres, z.capacidad);
    const pct = Math.round((z.ocupados / z.capacidad) * 100);
    return `
      <article class="zona zona--${estado.sufijo}" id="card-${z.id}">
        <div class="zona__top">
          <h3 class="zona__nombre">${z.nombre}</h3>
          <p class="zona__estado">${estado.texto}</p>
        </div>
        <p class="zona__ref">${z.referencia}</p>
        <p class="zona__numero"><span class="js-contador" data-zona="${z.id}">${libres}</span><small>libres de ${z.capacidad}</small></p>
        <div class="zona__barra" role="img" aria-label="Ocupación ${pct}%">
          <span style="width: ${pct}%"></span>
        </div>
      </article>`;
  }

  // ---------- Contadores animados ----------
  const previos = new Map();

  function animarContador(el, desde, hasta) {
    if (reduceMotion || desde === hasta) { el.textContent = hasta; return; }
    const duracion = 500;
    const inicio = performance.now();
    function paso(t) {
      const p = Math.min(1, (t - inicio) / duracion);
      const suavizado = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(desde + (hasta - desde) * suavizado);
      if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  // ---------- Mapa ----------
  function actualizarMapa(z) {
    const g = document.getElementById(`mapa-${z.id}`);
    const num = document.getElementById(`mapa-${z.id}-num`);
    if (!g || !num) return;
    const libres = z.capacidad - z.ocupados;
    const estado = estadoDeZona(libres, z.capacidad);
    g.classList.remove("puntoMapa--ok", "puntoMapa--medio", "puntoMapa--lleno");
    g.classList.add(`puntoMapa--${estado.sufijo}`);
    num.textContent = libres;
    g.setAttribute("aria-label", `${z.nombre}: ${libres} espacios libres de ${z.capacidad} (${estado.texto})`);
  }

  function irATarjeta(id) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    card.classList.remove("zona--destello");
    void card.offsetWidth; // reinicia la animación
    card.classList.add("zona--destello");
  }

  ["a1", "b1", "pg"].forEach((id) => {
    const g = document.getElementById(`mapa-${id}`);
    if (!g) return;
    g.addEventListener("click", () => irATarjeta(id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); irATarjeta(id); }
    });
  });

  // ---------- Refresco ----------
  function marcaDeTiempo() {
    const ahora = new Date();
    const hh = String(ahora.getHours()).padStart(2, "0");
    const mm = String(ahora.getMinutes()).padStart(2, "0");
    heroMeta.textContent = `Actualizado a las ${hh}:${mm}`;
  }

  async function refrescar() {
    let zonas;
    try {
      zonas = await ParqueoData.obtenerZonas();
    } catch (e) {
      heroMeta.textContent = "No se pudo actualizar. Reintentando…";
      return;
    }

    grid.innerHTML = zonas.map(tarjetaZona).join("");
    zonas.forEach((z) => {
      const libres = z.capacidad - z.ocupados;
      const el = grid.querySelector(`.js-contador[data-zona="${z.id}"]`);
      const previo = previos.has(z.id) ? previos.get(z.id) : libres;
      animarContador(el, previo, libres);
      previos.set(z.id, libres);
      actualizarMapa(z);
    });
    marcaDeTiempo();
  }

  refrescar();
  ParqueoData.suscribir(refrescar);

  // ---------- Modal ----------
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  let ultimoFoco = null;

  function abrirModal(titulo, cuerpo) {
    ultimoFoco = document.activeElement;
    modalTitle.textContent = titulo;
    modalBody.textContent = cuerpo;
    modal.hidden = false;
    modal.querySelector(".modal__close").focus();
  }

  function cerrarModal() {
    modal.hidden = true;
    if (ultimoFoco) ultimoFoco.focus();
  }

  const abrirRegistro = () =>
    abrirModal(
      "Registrar mi vehículo",
      "Aquí completarías tu nombre, correo institucional y la placa. Al terminar recibes tu código QR de acceso."
    );

  const abrirReporte = () =>
    abrirModal(
      "Reportar un problema",
      "Aquí elegirías la zona, describirías el problema y podrías adjuntar una foto."
    );

  document.getElementById("btnRegistro").addEventListener("click", abrirRegistro);
  document.getElementById("btnRegistroTop").addEventListener("click", abrirRegistro);
  document.getElementById("btnReporte").addEventListener("click", abrirReporte);

  modal.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close")) cerrarModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) cerrarModal();
  });
})();
