/* ============================================================
   MiParqueo · vista de administración

   Tres responsabilidades:
   - Validar o rechazar reportes (aquí es donde nace un strike).
   - Resolver apelaciones (aceptarla borra el strike).
   - Habilitar o deshabilitar espacios del campus.
   ============================================================ */

const Admin = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const avisoAdmin = $("avisoAdmin");

  let estadoReportes = "pendiente";
  let pendiente = null;          // acción esperando confirmación
  let espacioSeleccionado = null;
  let iniciado = false;

  function avisar(texto, tipo = "ok") {
    avisoAdmin.textContent = texto;
    avisoAdmin.className = `aviso aviso--${tipo}`;
    avisoAdmin.hidden = false;
  }

  function hora(iso) {
    return new Date(iso).toLocaleString("es-DO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  // ---------- Reportes ----------

  async function cargarReportes() {
    const lista = $("listaReportes");
    lista.innerHTML = `<li class="lista__vacio">Cargando…</li>`;

    let reportes;
    try {
      reportes = await MiParqueo.admin.reportes(estadoReportes);
    } catch (error) {
      lista.innerHTML = `<li class="lista__vacio">${error.message}</li>`;
      return;
    }

    if (!reportes.length) {
      lista.innerHTML = `<li class="lista__vacio">No hay reportes ${estadoReportes}s.</li>`;
      return;
    }

    lista.innerHTML = reportes.map((r) => {
      const infractor = r.infractor
        ? `${r.infractor.nombre} · ${r.infractor.correo}`
        : `<strong>Placa no registrada.</strong> Vehículo ajeno al campus: no hay a quién sancionar, pero conviene avisar a seguridad.`;

      const acciones = r.estado === "pendiente"
        ? `<div class="acciones__fila">
             <button class="btn btn--primary btn--mini" data-validar="${r.id}">Validar · es un strike</button>
             <button class="btn btn--outline btn--mini" data-rechazar="${r.id}">Rechazar</button>
           </div>`
        : `<p class="lista__meta">${r.estado === "validado" ? "Validado" : "Rechazado"}${
             r.nota_admin ? ` · ${r.nota_admin}` : ""}</p>`;

      return `
        <li class="lista__item lista__item--columna">
          <div class="lista__cabecera">
            <strong>Espacio ${r.espacios ? r.espacios.codigo : "—"}</strong>
            <span class="etiqueta etiqueta--${r.estado}">${r.estado}</span>
          </div>
          <p class="lista__meta">${hora(r.ocurrido_en)} · ${r.espacios && r.espacios.zonas ? r.espacios.zonas.nombre : ""}</p>

          <div class="reporte__caras">
            <div>
              <span class="lista__meta">Reporta</span>
              <p>${r.reportante ? `${r.reportante.nombre} · ${r.reportante.correo}` : "—"}</p>
            </div>
            <div>
              <span class="lista__meta">Acusado (placa ${r.placa_reportada})</span>
              <p>${infractor}</p>
            </div>
          </div>

          <p>${r.descripcion}</p>
          ${r.foto_url
            ? `<a href="${r.foto_url}" target="_blank" rel="noopener" class="reporte__foto">
                 <img src="${r.foto_url}" alt="Evidencia fotográfica del reporte" loading="lazy" />
               </a>`
            : `<p class="lista__meta">Sin evidencia fotográfica.</p>`}
          ${acciones}
        </li>`;
    }).join("");
  }

  // ---------- Apelaciones ----------

  async function cargarApelaciones() {
    const lista = $("listaApelaciones");
    lista.innerHTML = `<li class="lista__vacio">Cargando…</li>`;

    let apelaciones;
    try {
      apelaciones = await MiParqueo.admin.apelaciones("pendiente");
    } catch (error) {
      lista.innerHTML = `<li class="lista__vacio">${error.message}</li>`;
      return;
    }

    if (!apelaciones.length) {
      lista.innerHTML = `<li class="lista__vacio">No hay apelaciones pendientes.</li>`;
      return;
    }

    lista.innerHTML = apelaciones.map((a) => {
      const r = a.reportes || {};
      return `
        <li class="lista__item lista__item--columna">
          <div class="lista__cabecera">
            <strong>${a.perfiles ? a.perfiles.nombre : "—"}</strong>
            <span class="lista__meta">${hora(a.creado_en)}</span>
          </div>
          <p class="lista__meta">
            Apela el reporte del espacio ${r.espacios ? r.espacios.codigo : "—"}
            (placa ${r.placa_reportada || "—"})
          </p>

          <blockquote class="cita">${a.texto}</blockquote>

          <details class="detalle">
            <summary>Ver el reporte original</summary>
            <p>${r.descripcion || "—"}</p>
            ${r.foto_url
              ? `<a href="${r.foto_url}" target="_blank" rel="noopener" class="reporte__foto">
                   <img src="${r.foto_url}" alt="Evidencia del reporte apelado" loading="lazy" />
                 </a>`
              : `<p class="lista__meta">Sin evidencia fotográfica.</p>`}
          </details>

          <div class="acciones__fila">
            <button class="btn btn--primary btn--mini" data-aceptar="${a.id}">Aceptar · quitar el strike</button>
            <button class="btn btn--outline btn--mini" data-negar="${a.id}">Rechazar apelación</button>
          </div>
        </li>`;
    }).join("");
  }

  // ---------- Espacios ----------

  async function cargarEspacios() {
    const rejilla = $("rejillaEspacios");
    rejilla.innerHTML = "Cargando…";

    let espacios;
    try {
      espacios = await MiParqueo.admin.espacios($("filtroZona").value);
    } catch (error) {
      rejilla.innerHTML = `<p class="aviso aviso--error">${error.message}</p>`;
      return;
    }

    rejilla.innerHTML = espacios.map((e) => `
      <button class="chip ${e.habilitado ? "chip--libre" : "chip--bloqueado"}"
              data-espacio="${e.id}" data-habilitado="${e.habilitado}"
              title="${e.habilitado ? "Habilitado" : `Deshabilitado: ${e.motivo || "sin motivo"}`}">
        ${e.numero}
      </button>`).join("");
  }

  // ---------- Eventos ----------

  function conectarEventos() {
    document.querySelectorAll(".pestana").forEach((boton) => {
      boton.addEventListener("click", () => {
        document.querySelectorAll(".pestana").forEach((b) => b.classList.remove("pestana--activa"));
        boton.classList.add("pestana--activa");

        const vista = boton.dataset.vista;
        $("adminReportes").hidden = vista !== "reportes";
        $("adminApelaciones").hidden = vista !== "apelaciones";
        $("adminEspacios").hidden = vista !== "espacios";

        if (vista === "apelaciones") cargarApelaciones();
        if (vista === "espacios") cargarEspacios();
      });
    });

    document.querySelectorAll(".filtro").forEach((boton) => {
      boton.addEventListener("click", () => {
        document.querySelectorAll(".filtro").forEach((b) => b.classList.remove("filtro--activo"));
        boton.classList.add("filtro--activo");
        estadoReportes = boton.dataset.estado;
        cargarReportes();
      });
    });

    $("listaReportes").addEventListener("click", (e) => {
      const validar = e.target.closest("[data-validar]");
      const rechazar = e.target.closest("[data-rechazar]");
      if (!validar && !rechazar) return;

      pendiente = {
        tipo: "reporte",
        id: (validar || rechazar).dataset[validar ? "validar" : "rechazar"],
        valor: !!validar,
      };

      $("tituloResolver").textContent = validar ? "Validar reporte" : "Rechazar reporte";
      $("textoResolver").textContent = validar
        ? "Este reporte pasará a contar como strike del usuario acusado. Con tres strikes pierde el acceso al parqueo."
        : "Este reporte no contará como strike.";
      $("btnConfirmarResolver").textContent = validar ? "Validar" : "Rechazar";
      $("modalResolver").hidden = false;
    });

    $("listaApelaciones").addEventListener("click", (e) => {
      const aceptar = e.target.closest("[data-aceptar]");
      const negar = e.target.closest("[data-negar]");
      if (!aceptar && !negar) return;

      pendiente = {
        tipo: "apelacion",
        id: (aceptar || negar).dataset[aceptar ? "aceptar" : "negar"],
        valor: !!aceptar,
      };

      $("tituloResolver").textContent = aceptar ? "Aceptar apelación" : "Rechazar apelación";
      $("textoResolver").textContent = aceptar
        ? "El reporte pasará a rechazado y el strike desaparecerá del expediente."
        : "El reporte se mantiene y el strike sigue contando.";
      $("btnConfirmarResolver").textContent = aceptar ? "Aceptar" : "Rechazar";
      $("modalResolver").hidden = false;
    });

    $("formResolver").addEventListener("submit", async (e) => {
      e.preventDefault();
      const boton = $("btnConfirmarResolver");
      const original = boton.textContent;
      boton.disabled = true;
      boton.textContent = "Guardando…";
      try {
        if (pendiente.tipo === "reporte") {
          await MiParqueo.admin.resolverReporte(pendiente.id, pendiente.valor, $("notaResolver").value);
          await cargarReportes();
        } else {
          await MiParqueo.admin.resolverApelacion(pendiente.id, pendiente.valor, $("notaResolver").value);
          await cargarApelaciones();
        }
        $("modalResolver").hidden = true;
        $("formResolver").reset();
        avisar("Decisión guardada.", "ok");
      } catch (error) {
        avisar(error.message, "error");
      } finally {
        boton.disabled = false;
        boton.textContent = original;
      }
    });

    $("filtroZona").addEventListener("change", cargarEspacios);

    $("rejillaEspacios").addEventListener("click", async (e) => {
      const chip = e.target.closest("[data-espacio]");
      if (!chip) return;

      if (chip.dataset.habilitado === "true") {
        // Deshabilitar pide motivo.
        espacioSeleccionado = chip.dataset.espacio;
        $("modalEspacio").hidden = false;
        $("motivoEspacio").focus();
      } else {
        // Volver a habilitar es directo.
        try {
          await MiParqueo.admin.habilitarEspacio(chip.dataset.espacio, true);
          await cargarEspacios();
          avisar("Espacio habilitado de nuevo.", "ok");
        } catch (error) {
          avisar(error.message, "error");
        }
      }
    });

    $("formEspacio").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await MiParqueo.admin.habilitarEspacio(espacioSeleccionado, false, $("motivoEspacio").value);
        $("modalEspacio").hidden = true;
        $("formEspacio").reset();
        await cargarEspacios();
        avisar("Espacio deshabilitado. Ya no se asignará a nadie.", "ok");
      } catch (error) {
        avisar(error.message, "error");
      }
    });
  }

  return {
    async mostrar() {
      if (!iniciado) { conectarEventos(); iniciado = true; }
      avisoAdmin.hidden = true;
      await cargarReportes();
    },
  };
})();
