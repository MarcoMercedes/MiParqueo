/* ============================================================
   MiParqueo · vista "Mi perfil"

   Vehículos, multas e historial. El historial no se carga hasta
   que se pide, y luego avanza de diez en diez: quien lleva un
   semestre parqueando tiene cientos de registros y no tiene
   sentido traerlos todos para ver los últimos.
   ============================================================ */

const Perfil = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const POR_PAGINA = 10;
  const LIMITE_STRIKES = 3;

  let conectado = false;
  let cargados = 0;
  let totalHistorial = 0;
  let reporteApelando = null;

  function avisar(texto, tipo = "ok") {
    const el = $("avisoPerfil");
    el.textContent = texto;
    el.className = `aviso aviso--${tipo}`;
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hora(iso) {
    return new Date(iso).toLocaleString("es-DO", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  // ---------- Cabecera ----------

  function pintarCabecera(perfil, strikes) {
    $("perfilNombre").textContent = perfil.nombre;
    $("perfilCorreo").textContent = perfil.correo;
    $("strikesNum").textContent = strikes;
    $("perfilStrikes").classList.toggle("perfil__strikes--riesgo", strikes > 0 && strikes < LIMITE_STRIKES);
    $("perfilStrikes").classList.toggle("perfil__strikes--suspendido", strikes >= LIMITE_STRIKES);
  }

  // ---------- Vehículos ----------

  function pintarVehiculos(vehiculos) {
    $("listaVehiculos").innerHTML = vehiculos.length
      ? vehiculos.map((v) => `
        <li class="lista__item">
          <div>
            <strong>${v.placa}</strong>
            <span class="lista__meta">${v.marca} ${v.modelo} · ${v.color}</span>
          </div>
          <button class="btn btn--ghost btn--mini" data-borrar="${v.id}">Eliminar</button>
        </li>`).join("")
      : `<li class="lista__vacio">Todavía no has registrado ningún vehículo.</li>`;
  }

  // ---------- Multas ----------

  function pintarMultas(reportes) {
    const validados = reportes.filter((r) => r.estado === "validado").length;

    if (!reportes.length) {
      $("listaMisReportes").innerHTML =
        `<li class="lista__vacio">Sin reportes en tu contra. Todo en orden.</li>`;
      return;
    }

    $("listaMisReportes").innerHTML = reportes.map((r) => {
      const apelacion = (r.apelaciones || [])[0];
      const etiqueta =
        r.estado === "validado" ? "Multa confirmada"
        : r.estado === "rechazado" ? "Desestimado"
        : "En revisión";

      let pie = "";
      if (apelacion) {
        pie = `<p class="lista__meta">Apelación ${apelacion.estado}${
          apelacion.nota_admin ? `: ${apelacion.nota_admin}` : ""}</p>`;
      } else if (r.estado !== "rechazado") {
        pie = `<button class="btn btn--outline btn--mini" data-apelar="${r.id}">Apelar</button>`;
      }

      return `
        <li class="lista__item lista__item--columna">
          <div class="lista__cabecera">
            <strong>Espacio ${r.espacios ? r.espacios.codigo : "—"}</strong>
            <span class="etiqueta etiqueta--${r.estado}">${etiqueta}</span>
          </div>
          <p class="lista__meta">${hora(r.ocurrido_en)} · placa reportada ${r.placa_reportada}</p>
          <p>${r.descripcion}</p>
          ${r.foto_url
            ? `<a href="${r.foto_url}" target="_blank" rel="noopener" class="reporte__foto">
                 <img src="${r.foto_url}" alt="Evidencia del reporte" loading="lazy" />
               </a>`
            : ""}
          ${r.nota_admin ? `<p class="lista__meta">Nota del administrador: ${r.nota_admin}</p>` : ""}
          ${pie}
        </li>`;
    }).join("");

    return validados;
  }

  // ---------- Historial ----------

  function filaHistorial(a) {
    const cerrada = a.salida_en
      ? { texto: "Salida marcada", clase: "ok" }
      : new Date(a.vence_en) < new Date()
      ? { texto: "Venció sin marcar salida", clase: "medio" }
      : { texto: "En curso", clase: "ok" };
    return `
      <li class="lista__item">
        <div>
          <strong>${a.espacios.codigo}</strong>
          <span class="lista__meta">${a.espacios.zonas.nombre} · ${hora(a.inicio)}</span>
        </div>
        <span class="etiqueta etiqueta--${cerrada.clase}">${cerrada.texto}</span>
      </li>`;
  }

  async function cargarPagina() {
    const boton = $("btnMasHistorial");
    const original = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Cargando…";

    try {
      const { filas, total } = await MiParqueo.historialPagina(POR_PAGINA, cargados);
      totalHistorial = total;

      if (cargados === 0 && !filas.length) {
        $("listaHistorial").innerHTML =
          `<li class="lista__vacio">Todavía no has usado el parqueo.</li>`;
      } else {
        $("listaHistorial").insertAdjacentHTML("beforeend", filas.map(filaHistorial).join(""));
      }

      cargados += filas.length;
      const quedan = totalHistorial - cargados;
      boton.hidden = quedan <= 0;
      boton.textContent = `Ver ${Math.min(POR_PAGINA, quedan)} más`;
      $("notaHistorial").textContent = totalHistorial
        ? `Mostrando ${cargados} de ${totalHistorial}.`
        : "";
    } catch (error) {
      avisar(error.message, "error");
      boton.textContent = original;
    } finally {
      boton.disabled = false;
    }
  }

  function reiniciarHistorial() {
    cargados = 0;
    totalHistorial = 0;
    $("listaHistorial").innerHTML = "";
    $("btnMasHistorial").hidden = true;
    $("notaHistorial").textContent = "";
    $("zonaHistorial").hidden = true;
    $("btnHistorial").textContent = "Ver historial";
    $("btnHistorial").setAttribute("aria-expanded", "false");
  }

  // ---------- Carga ----------

  async function recargar() {
    const [perfil, vehiculos, reportes] = await Promise.all([
      MiParqueo.perfil(),
      MiParqueo.misVehiculos(),
      MiParqueo.reportesEnMiContra(),
    ]);

    pintarCabecera(perfil, reportes.filter((r) => r.estado === "validado").length);
    pintarVehiculos(vehiculos);
    pintarMultas(reportes);
  }

  // ---------- Acciones ----------

  async function conBoton(boton, textoOcupado, accion) {
    const original = boton.textContent;
    boton.disabled = true;
    boton.textContent = textoOcupado;
    try {
      await accion();
    } catch (error) {
      avisar(error.message, "error");
    } finally {
      boton.disabled = false;
      boton.textContent = original;
    }
  }

  function conectar() {
    $("btnHistorial").addEventListener("click", async () => {
      const zona = $("zonaHistorial");
      const abierto = !zona.hidden;

      if (abierto) {
        zona.hidden = true;
        $("btnHistorial").textContent = "Ver historial";
        $("btnHistorial").setAttribute("aria-expanded", "false");
        return;
      }

      zona.hidden = false;
      $("btnHistorial").textContent = "Ocultar historial";
      $("btnHistorial").setAttribute("aria-expanded", "true");
      if (cargados === 0) await cargarPagina();
    });

    $("btnMasHistorial").addEventListener("click", cargarPagina);

    $("formVehiculo").addEventListener("submit", async (e) => {
      e.preventDefault();
      await conBoton(e.target.querySelector("button[type=submit]"), "Registrando…", async () => {
        await MiParqueo.registrarVehiculo({
          placa: $("vPlaca").value,
          marca: $("vMarca").value,
          modelo: $("vModelo").value,
          color: $("vColor").value,
        });
        e.target.reset();
        await recargar();
        avisar("Vehículo registrado.", "ok");
      });
    });

    $("listaVehiculos").addEventListener("click", async (e) => {
      const boton = e.target.closest("[data-borrar]");
      if (!boton) return;
      await conBoton(boton, "…", async () => {
        await MiParqueo.eliminarVehiculo(boton.dataset.borrar);
        await recargar();
        avisar("Vehículo eliminado.", "ok");
      });
    });

    $("listaMisReportes").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-apelar]");
      if (!boton) return;
      reporteApelando = boton.dataset.apelar;
      $("modalApelacion").hidden = false;
      $("aTexto").focus();
    });

    $("formApelacion").addEventListener("submit", async (e) => {
      e.preventDefault();
      await conBoton(e.target.querySelector("button[type=submit]"), "Enviando…", async () => {
        await MiParqueo.apelar(reporteApelando, $("aTexto").value);
        $("modalApelacion").hidden = true;
        $("formApelacion").reset();
        await recargar();
        avisar("Apelación enviada. Un administrador la revisará.", "ok");
      });
    });
  }

  return {
    async mostrar() {
      if (!conectado) { conectar(); conectado = true; }
      $("avisoPerfil").hidden = true;
      try {
        await recargar();
      } catch (error) {
        avisar(error.message, "error");
      }
    },

    reiniciar() { reiniciarHistorial(); },
  };
})();
