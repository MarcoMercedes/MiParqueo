/* ============================================================
   MiParqueo · panel del usuario

   Estados posibles de la pantalla:
   - suspendido      3 reportes validados: no puede solicitar.
   - con parqueo     espacio asignado + cuenta regresiva.
   - vencido         se le acabó el plazo y el espacio se liberó.
   - sin parqueo     puede solicitar en la zona que quiera.
   ============================================================ */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const contenido = $("contenido");
  const cargando = $("cargando");
  const avisoGlobal = $("avisoGlobal");

  let perfil = null;
  let asignacion = null;
  let vehiculos = [];
  let strikes = 0;
  let reloj = null;
  let avisadoPocoTiempo = false;
  let avisadoVencimiento = false;

  const LIMITE_STRIKES = 3;
  const CLAVE_VENCIDO = "miparqueo:vencido-visto";

  // ---------- Utilidades ----------

  function avisar(texto, tipo = "ok") {
    avisoGlobal.textContent = texto;
    avisoGlobal.className = `aviso aviso--${tipo}`;
    avisoGlobal.hidden = false;
    avisoGlobal.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function limpiarAviso() {
    avisoGlobal.hidden = true;
  }

  function hora(iso) {
    return new Date(iso).toLocaleString("es-DO", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  function duracion(ms) {
    if (ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function notificar(titulo, cuerpo) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(titulo, { body: cuerpo, icon: "assets/favicon.svg" });
  }

  // ---------- Cuenta regresiva ----------

  function detenerReloj() {
    if (reloj) clearInterval(reloj);
    reloj = null;
  }

  function arrancarReloj() {
    detenerReloj();
    if (!asignacion) return;

    avisadoPocoTiempo = false;
    avisadoVencimiento = false;
    const vence = new Date(asignacion.vence_en).getTime();
    const inicio = new Date(asignacion.inicio).getTime();
    const total = vence - inicio;

    function latido() {
      const restante = vence - Date.now();
      $("contadorTiempo").textContent = duracion(restante);

      const proporcion = Math.max(0, Math.min(1, restante / total));
      $("contadorBarra").style.width = `${proporcion * 100}%`;

      const contador = $("contador");
      contador.classList.toggle("contador--urgente", restante <= 30 * 60 * 1000 && restante > 0);

      if (restante <= 15 * 60 * 1000 && restante > 0 && !avisadoPocoTiempo) {
        avisadoPocoTiempo = true;
        notificar(
          "Te quedan 15 minutos",
          `Marca tu salida del ${asignacion.espacios.codigo} o extiende 6 horas más.`
        );
      }

      if (restante <= 0 && !avisadoVencimiento) {
        avisadoVencimiento = true;
        notificar(
          "Tu parqueo se venció",
          "El espacio quedó libre. Si sigues ahí, pueden reportarte."
        );
        detenerReloj();
        recargar();
      }
    }

    latido();
    reloj = setInterval(latido, 1000);
  }

  // ---------- Render ----------

  function pintarEstadoParqueo() {
    const suspendido = strikes >= LIMITE_STRIKES;

    $("bloqueSancion").hidden = !suspendido;
    $("strikesTotal").textContent = strikes;

    if (asignacion) {
      $("bloqueActivo").hidden = false;
      $("bloqueSolicitar").hidden = true;

      const espacio = asignacion.espacios;
      const vehiculo = asignacion.vehiculos;
      $("espacioCodigo").textContent = espacio.codigo;
      $("espacioZona").textContent = `${espacio.zonas.nombre} · ${espacio.zonas.referencia || ""}`;
      $("espacioVehiculo").textContent =
        `${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.color} · placa ${vehiculo.placa}`;
      $("notaExtensiones").textContent =
        asignacion.extensiones > 0
          ? `Has extendido ${asignacion.extensiones} ${asignacion.extensiones === 1 ? "vez" : "veces"}.`
          : "";
      arrancarReloj();
    } else {
      detenerReloj();
      $("bloqueActivo").hidden = true;
      $("bloqueSolicitar").hidden = suspendido || vehiculos.length === 0;
    }
  }

  function pintarVehiculos() {
    const lista = $("listaVehiculos");
    lista.innerHTML = vehiculos.length
      ? vehiculos
          .map(
            (v) => `
        <li class="lista__item">
          <div>
            <strong>${v.placa}</strong>
            <span class="lista__meta">${v.marca} ${v.modelo} · ${v.color}</span>
          </div>
          <button class="btn btn--ghost btn--mini" data-borrar="${v.id}">Eliminar</button>
        </li>`
          )
          .join("")
      : `<li class="lista__vacio">Todavía no has registrado ningún vehículo.</li>`;

    const selector = $("vehiculoActivo");
    selector.innerHTML = vehiculos
      .map((v) => `<option value="${v.id}">${v.placa} · ${v.marca} ${v.modelo}</option>`)
      .join("");
    $("selectorVehiculo").hidden = vehiculos.length < 2;
  }

  async function pintarZonas() {
    const contenedor = $("zonasSolicitar");
    let zonas;
    try {
      zonas = await MiParqueo.disponibilidad();
    } catch (error) {
      contenedor.innerHTML = `<p class="aviso aviso--error">${error.message}</p>`;
      return;
    }

    contenedor.innerHTML = zonas
      .map((z) => {
        const sufijo = z.libres === 0 ? "lleno" : z.libres / z.capacidad <= 0.2 ? "medio" : "ok";
        const texto = z.libres === 0 ? "Llena" : sufijo === "medio" ? "Casi llena" : "Con espacios";
        return `
        <article class="zonaSolicitar zona--${sufijo}">
          <div class="zonaSolicitar__info">
            <h3>${z.nombre}</h3>
            <p class="zona__ref">${z.referencia || ""}</p>
            <p class="zona__estado">${texto}</p>
          </div>
          <p class="zonaSolicitar__numero">${z.libres}<small>libres de ${z.capacidad}</small></p>
          <button class="btn btn--primary" data-solicitar="${z.id}" ${z.libres === 0 ? "disabled" : ""}>
            ${z.libres === 0 ? "Sin espacios" : "Solicitar parqueo"}
          </button>
        </article>`;
      })
      .join("");
  }

  function pintarMisReportes(reportes) {
    const bloque = $("bloqueMisReportes");
    if (!reportes.length) {
      bloque.hidden = true;
      return;
    }
    bloque.hidden = false;

    $("listaMisReportes").innerHTML = reportes
      .map((r) => {
        const apelacion = (r.apelaciones || [])[0];
        const etiqueta =
          r.estado === "validado" ? "Validado · cuenta como strike"
          : r.estado === "rechazado" ? "Rechazado · no cuenta"
          : "Pendiente de revisión";

        let pie;
        if (apelacion) {
          pie = `<p class="lista__meta">Apelación ${apelacion.estado}${
            apelacion.nota_admin ? `: ${apelacion.nota_admin}` : ""
          }</p>`;
        } else if (r.estado !== "rechazado") {
          pie = `<button class="btn btn--outline btn--mini" data-apelar="${r.id}">Apelar</button>`;
        } else {
          pie = "";
        }

        return `
        <li class="lista__item lista__item--columna">
          <div class="lista__cabecera">
            <strong>Espacio ${r.espacios ? r.espacios.codigo : "—"}</strong>
            <span class="etiqueta etiqueta--${r.estado}">${etiqueta}</span>
          </div>
          <p class="lista__meta">${hora(r.ocurrido_en)} · placa reportada ${r.placa_reportada}</p>
          <p>${r.descripcion}</p>
          ${r.foto_url ? `<a class="lista__evidencia" href="${r.foto_url}" target="_blank" rel="noopener">Ver evidencia</a>` : ""}
          ${r.nota_admin ? `<p class="lista__meta">Nota del administrador: ${r.nota_admin}</p>` : ""}
          ${pie}
        </li>`;
      })
      .join("");
  }

  function pintarHistorial(items) {
    const bloque = $("bloqueHistorial");
    if (!items.length) {
      bloque.hidden = true;
      return;
    }
    bloque.hidden = false;

    $("listaHistorial").innerHTML = items
      .map((a) => {
        const cerrada =
          a.salida_en
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
      })
      .join("");
  }

  // Si la última asignación se venció sin marcar salida, se avisa una vez.
  function revisarVencimiento(historial) {
    const ultima = historial[0];
    if (!ultima) return;
    const vencida =
      !ultima.salida_en && new Date(ultima.vence_en) < new Date();
    const yaVisto = localStorage.getItem(`${CLAVE_VENCIDO}:${ultima.id}`);
    const reciente = Date.now() - new Date(ultima.vence_en).getTime() < 12 * 3600 * 1000;

    if (vencida && reciente && !yaVisto) {
      $("bloqueVencido").hidden = false;
      $("btnEntendidoVencido").onclick = () => {
        localStorage.setItem(`${CLAVE_VENCIDO}:${ultima.id}`, "1");
        $("bloqueVencido").hidden = true;
      };
    } else {
      $("bloqueVencido").hidden = true;
    }
  }

  // ---------- Carga ----------

  async function recargar() {
    const [asig, vehs, reportes, hist] = await Promise.all([
      MiParqueo.miAsignacion(),
      MiParqueo.misVehiculos(),
      MiParqueo.reportesEnMiContra(),
      MiParqueo.historial(),
    ]);

    asignacion = asig;
    vehiculos = vehs;
    strikes = reportes.filter((r) => r.estado === "validado").length;

    pintarVehiculos();
    pintarEstadoParqueo();
    pintarMisReportes(reportes);
    pintarHistorial(hist);
    revisarVencimiento(hist);
    if (!asignacion) await pintarZonas();

    $("notaVehiculos").hidden = vehiculos.length > 0;
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

  $("zonasSolicitar").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-solicitar]");
    if (!boton) return;
    const zona = boton.dataset.solicitar;
    const vehiculo = $("vehiculoActivo").value;

    if (!vehiculo) {
      avisar("Registra un vehículo antes de solicitar parqueo.", "error");
      return;
    }

    conBoton(boton, "Asignando…", async () => {
      await MiParqueo.solicitar(zona, vehiculo);
      limpiarAviso();
      await recargar();
      avisar(
        `Te asignamos el espacio ${asignacion.espacios.codigo}. Tienes 6 horas.`,
        "ok"
      );
      // Permiso para avisarle cuando se le acabe el tiempo.
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    });
  });

  $("btnSalida").addEventListener("click", (e) =>
    conBoton(e.target, "Cerrando…", async () => {
      await MiParqueo.marcarSalida();
      detenerReloj();
      await recargar();
      avisar("Salida registrada. El espacio quedó libre, gracias.", "ok");
    })
  );

  $("btnExtender").addEventListener("click", (e) =>
    conBoton(e.target, "Extendiendo…", async () => {
      await MiParqueo.extender();
      await recargar();
      avisar("Listo, tienes 6 horas más.", "ok");
    })
  );

  // ---------- Reportar ocupación ----------

  const modalReporte = $("modalReporte");

  $("btnReportar").addEventListener("click", () => {
    if (!asignacion) return;
    $("rMeta").textContent =
      `Se registrará el espacio ${asignacion.espacios.codigo} y la hora actual (${hora(new Date().toISOString())}).`;
    modalReporte.hidden = false;
    $("rPlaca").focus();
  });

  $("formReporte").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = $("btnEnviarReporte");
    const archivo = $("rFoto").files[0];

    await conBoton(boton, "Enviando reporte…", async () => {
      let fotoUrl = null;
      if (archivo) fotoUrl = await MiParqueo.subirEvidencia(archivo);

      const nueva = await MiParqueo.reportarYReasignar({
        placa: $("rPlaca").value,
        descripcion: $("rDescripcion").value,
        fotoUrl,
      });

      modalReporte.hidden = true;
      $("formReporte").reset();
      await recargar();

      avisar(
        nueva
          ? "Reporte enviado y te asignamos otro espacio. Un administrador revisará la evidencia."
          : "Reporte enviado, pero esa zona ya no tiene espacios libres. Prueba con otra zona.",
        nueva ? "ok" : "medio"
      );
    });
  });

  // ---------- Apelar ----------

  const modalApelacion = $("modalApelacion");
  let reporteApelando = null;

  $("listaMisReportes").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-apelar]");
    if (!boton) return;
    reporteApelando = boton.dataset.apelar;
    modalApelacion.hidden = false;
    $("aTexto").focus();
  });

  $("formApelacion").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = e.target.querySelector("button[type=submit]");
    await conBoton(boton, "Enviando…", async () => {
      await MiParqueo.apelar(reporteApelando, $("aTexto").value);
      modalApelacion.hidden = true;
      $("formApelacion").reset();
      await recargar();
      avisar("Apelación enviada. Un administrador la revisará.", "ok");
    });
  });

  // ---------- Vehículos ----------

  $("formVehiculo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = e.target.querySelector("button[type=submit]");
    await conBoton(boton, "Registrando…", async () => {
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
    });
  });

  // ---------- Modales ----------

  [modalReporte, modalApelacion].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close")) modal.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    modalReporte.hidden = true;
    modalApelacion.hidden = true;
  });

  // ---------- Sesión ----------

  $("btnSalir").addEventListener("click", async () => {
    await MiParqueo.cerrarSesion();
    window.location.replace("index.html");
  });

  // ---------- Arranque ----------

  (async function iniciar() {
    if (!MiParqueo.configurado) {
      cargando.innerHTML =
        '<span class="aviso aviso--error">La aplicación no está conectada a Supabase. Completa <code>js/config.js</code>.</span>';
      return;
    }

    const sesion = await MiParqueo.sesion();
    if (!sesion) {
      window.location.replace("index.html");
      return;
    }

    perfil = await MiParqueo.perfil();
    $("usuarioNombre").textContent = perfil ? perfil.nombre : sesion.user.email;
    $("enlaceAdmin").hidden = !perfil || perfil.rol !== "admin";

    try {
      await recargar();
    } catch (error) {
      avisar(error.message, "error");
    }

    cargando.hidden = true;
    contenido.hidden = false;

    // La disponibilidad de otras personas cambia mientras miras la pantalla.
    MiParqueo.suscribir(() => {
      if (!asignacion) pintarZonas();
    });
  })();
})();
