/* ============================================================
   MiParqueo · vista de disponibilidad

   El mapa del campus y las tarjetas por zona. Es lo primero que
   ve cualquiera, con o sin cuenta.
   ============================================================ */

const Disponibilidad = (() => {
  "use strict";

  const grid = document.getElementById("zonasGrid");
  const heroMeta = document.getElementById("heroMeta");
  const liveLabel = document.getElementById("liveLabel");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const previos = new Map();

  function estadoDeZona(libres, capacidad) {
    if (libres === 0) return { sufijo: "lleno", texto: "Llena" };
    if (capacidad > 0 && libres / capacidad <= 0.2) return { sufijo: "medio", texto: "Casi llena" };
    return { sufijo: "ok", texto: "Con espacios" };
  }

  function tarjetaZona(z) {
    const estado = estadoDeZona(z.libres, z.capacidad);
    const pct = z.capacidad > 0 ? Math.round(((z.capacidad - z.libres) / z.capacidad) * 100) : 0;
    return `
      <article class="zona zona--${estado.sufijo}" id="card-${z.id}">
        <div class="zona__top">
          <h3 class="zona__nombre">${z.nombre}</h3>
          <p class="zona__estado">${estado.texto}</p>
        </div>
        <p class="zona__ref">${z.referencia || ""}</p>
        <p class="zona__numero"><span class="js-contador" data-zona="${z.id}">${z.libres}</span><small>libres de ${z.capacidad}</small></p>
        <div class="zona__barra" role="img" aria-label="Ocupación ${pct}%">
          <span style="width: ${pct}%"></span>
        </div>
        ${z.deshabilitados > 0 ? `<p class="zona__nota">${z.deshabilitados} espacios fuera de servicio</p>` : ""}
      </article>`;
  }

  function animarContador(el, desde, hasta) {
    if (!el) return;
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

  function actualizarMapa(z) {
    const g = document.getElementById(`mapa-${z.id}`);
    const num = document.getElementById(`mapa-${z.id}-num`);
    if (!g || !num) return;
    const estado = estadoDeZona(z.libres, z.capacidad);
    g.classList.remove("puntoMapa--ok", "puntoMapa--medio", "puntoMapa--lleno");
    g.classList.add(`puntoMapa--${estado.sufijo}`);
    num.textContent = z.libres;
    g.setAttribute("aria-label",
      `${z.nombre}: ${z.libres} espacios libres de ${z.capacidad} (${estado.texto})`);
  }

  function irATarjeta(id) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    card.classList.remove("zona--destello");
    void card.offsetWidth; // reinicia la animación
    card.classList.add("zona--destello");
  }

  function marcaDeTiempo() {
    const ahora = new Date();
    const hh = String(ahora.getHours()).padStart(2, "0");
    const mm = String(ahora.getMinutes()).padStart(2, "0");
    heroMeta.textContent = `Actualizado a las ${hh}:${mm}`;
  }

  function sinConexion(mensaje) {
    liveLabel.textContent = "Sin conexión";
    liveLabel.closest(".live").classList.add("live--caida");
    heroMeta.textContent = "Sin datos en este momento";
    grid.innerHTML = `<p class="aviso aviso--error">${mensaje}</p>`;
  }

  async function refrescar() {
    let zonas;
    try {
      zonas = await MiParqueo.disponibilidad();
    } catch (error) {
      sinConexion("No se pudo consultar la disponibilidad. Reintenta en un momento.");
      return;
    }

    liveLabel.textContent = "En vivo";
    liveLabel.closest(".live").classList.remove("live--caida");
    grid.innerHTML = zonas.map(tarjetaZona).join("");

    zonas.forEach((z) => {
      const el = grid.querySelector(`.js-contador[data-zona="${z.id}"]`);
      const previo = previos.has(z.id) ? previos.get(z.id) : z.libres;
      animarContador(el, previo, z.libres);
      previos.set(z.id, z.libres);
      actualizarMapa(z);
    });
    marcaDeTiempo();
  }

  return {
    refrescar,

    iniciar() {
      ["a1", "b1", "pg"].forEach((id) => {
        const g = document.getElementById(`mapa-${id}`);
        if (!g) return;
        g.addEventListener("click", () => irATarjeta(id));
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); irATarjeta(id); }
        });
      });

      if (!MiParqueo.configurado) {
        sinConexion(
          "La aplicación todavía no está conectada a Supabase. Completa frontend/js/config.js."
        );
        return;
      }

      refrescar();
      MiParqueo.suscribir(refrescar);

      // Red de seguridad: si el tiempo real se cae o el navegador
      // suspende la pestaña, la página no se queda con datos viejos.
      setInterval(() => { if (!document.hidden) refrescar(); }, 30000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refrescar();
      });
    },
  };
})();
