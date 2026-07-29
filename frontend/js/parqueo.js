/* ============================================================
   MiParqueo · vista de parqueo

   El mapa del campus, las zonas con su botón de solicitar, y
   debajo el estado de tu parqueo: cuánto tiempo te queda,
   extender, marcar salida y reportar a quien te ocupe el espacio.
   ============================================================ */

const Parqueo = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const previos = new Map();

  let asignacion = null;
  let vehiculos = [];
  let strikes = 0;
  let ultimasZonas = [];
  let reloj = null;
  let avisadoPocoTiempo = false;
  let avisadoVencimiento = false;
  let conectado = false;

  const LIMITE_STRIKES = 3;
  const CLAVE_VENCIDO = "miparqueo:vencido-visto";

  // ---------- Utilidades ----------

  function avisar(texto, tipo = "ok") {
    const el = $("avisoParqueo");
    el.textContent = texto;
    el.className = `aviso aviso--${tipo}`;
    el.hidden = false;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  function hora(iso) {
    return new Date(iso).toLocaleString("es-DO", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  function duracion(ms) {
    if (ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function notificar(titulo, cuerpo) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(titulo, { body: cuerpo, icon: "assets/favicon.png" });
  }

  // En las torres el piso va dentro del código: B1-P3-24 es el piso 3.
  // No es una columna aparte porque el número de espacio ya lo determina,
  // y así los pisos se llenan en orden sin ninguna regla extra.
  function piso(codigo) {
    const m = /-P(\d+)-/.exec(codigo || "");
    return m ? `Piso ${m[1]}` : null;
  }

  function estadoDeZona(libres, capacidad) {
    if (libres === 0) return { sufijo: "lleno", texto: "Llena" };
    if (capacidad > 0 && libres / capacidad <= 0.2) return { sufijo: "medio", texto: "Casi llena" };
    return { sufijo: "ok", texto: "Con espacios" };
  }

  // ---------- Zonas ----------

  // Por qué no se puede reservar aquí, o null si sí se puede.
  function motivoBloqueo(z) {
    if (strikes >= LIMITE_STRIKES)
      return "Tu acceso al parqueo está suspendido por tres reportes validados.";
    if (asignacion)
      return `Ya tienes el espacio ${asignacion.espacios.codigo} asignado. Marca tu salida antes de reservar otro.`;
    if (!vehiculos.length)
      return "Registra un vehículo en Mi perfil antes de reservar.";
    if (z.libres === 0)
      return "Esta zona está llena en este momento.";
    return null;
  }

  function tarjetaZona(z) {
    const estado = estadoDeZona(z.libres, z.capacidad);
    const pct = z.capacidad > 0 ? Math.round(((z.capacidad - z.libres) / z.capacidad) * 100) : 0;

    // El botón no desaparece cuando no se puede: dice por qué.
    const bloqueado = !!motivoBloqueo(z);
    const etiqueta =
      z.libres === 0 ? "Sin espacios"
      : asignacion ? "Ya tienes parqueo"
      : strikes >= LIMITE_STRIKES ? "Suspendido"
      : !vehiculos.length ? "Registra un vehículo"
      : "Solicitar parqueo";

    return `
      <article class="zona zona--${estado.sufijo}" id="card-${z.id}">
        <div class="zona__top">
          <h3 class="zona__nombre">${z.nombre}</h3>
          <p class="zona__estado">${estado.texto}</p>
        </div>
        <p class="zona__ref">${z.referencia || ""}</p>
        <div class="zona__pie">
          <p class="zona__numero"><span class="js-contador" data-zona="${z.id}">${z.libres}</span><small>libres de ${z.capacidad}</small></p>
          <button class="btn btn--primary btn--mini" data-solicitar="${z.id}" ${bloqueado ? "disabled" : ""}>${etiqueta}</button>
        </div>
        <div class="zona__barra" role="img" aria-label="Ocupación ${pct}%">
          <span style="width: ${pct}%"></span>
        </div>
        ${z.deshabilitados > 0 ? `<p class="zona__nota">${z.deshabilitados} espacios fuera de servicio</p>` : ""}
      </article>`;
  }

  function animarContador(el, desde, hasta) {
    if (!el) return;
    if (reduceMotion || desde === hasta) { el.textContent = hasta; return; }
    const inicio = performance.now();
    function paso(t) {
      const p = Math.min(1, (t - inicio) / 500);
      el.textContent = Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  // ---------- Mapa ----------
  // Cada zona es un polígono dibujado sobre la foto del campus, con su
  // contador flotando encima. Los contornos vienen de zonas-mapa.js.

  const SVG = "http://www.w3.org/2000/svg";
  const crear = (tag, attrs) => {
    const el = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  function contorno(id) {
    const pts = (typeof ZONAS_MAPA !== "undefined" && ZONAS_MAPA[id]) || [];
    return pts.length > 2 ? pts : null;
  }

  // El viewBox sigue la proporción de la foto: si fuera siempre cuadrado,
  // una imagen apaisada estiraría el eje X y deformaría las etiquetas.
  let ALTO_MAPA = 1000;

  function ajustarViewBox() {
    const img = document.querySelector(".mapaReal img");
    const capa = $("capaZonas");
    if (!img || !capa || !img.naturalWidth) return;
    ALTO_MAPA = Math.round((1000 * img.naturalHeight) / img.naturalWidth);
    capa.setAttribute("viewBox", `0 0 1000 ${ALTO_MAPA}`);
  }

  function pintarMapa(zonas) {
    const capa = $("capaZonas");
    if (!capa) return;
    capa.innerHTML = "";

    let alguna = false;
    let orden = 0;

    zonas.forEach((z) => {
      const pts = contorno(z.id);
      if (!pts) return;
      alguna = true;

      const estado = estadoDeZona(z.libres, z.capacidad);
      const g = crear("g", {
        class: `zonaMapa zonaMapa--${estado.sufijo}`,
        tabindex: "0", role: "button",
        // Entran escalonadas: se lee de dónde a dónde va cada zona.
        style: reduceMotion ? "" : `animation-delay:${orden++ * 80}ms`,
        "aria-label": `${z.nombre}: ${z.libres} espacios libres de ${z.capacidad} (${estado.texto})`,
      });
      g.dataset.zona = z.id;

      // El área lleva el color propio de la zona (para distinguirla);
      // la etiqueta lleva el del semáforo (para saber si queda sitio).
      const estilo = (typeof ZONAS_ESTILO !== "undefined" && ZONAS_ESTILO[z.id]) || {};
      g.appendChild(crear("polygon", {
        class: "zonaMapa__area",
        points: pts.map((p) => p.join(",")).join(" "),
        style: estilo.color ? `color:${estilo.color}` : "",
      }));

      const texto = `${estilo.corto || z.nombre} · ${z.libres}`;
      const ancho = Math.max(84, texto.length * 10.5 + 26);

      // La etiqueta va arriba del área, sin salirse del mapa.
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const medio = ancho / 2 + 6;
      const cx = Math.min(1000 - medio, Math.max(medio, (Math.min(...xs) + Math.max(...xs)) / 2));
      const cy = Math.max(24, Math.min(ALTO_MAPA - 24, Math.min(...ys) - 22));

      const pill = crear("g", { class: "zonaMapa__pill", transform: `translate(${cx},${cy})` });
      pill.appendChild(crear("rect", { x: -ancho / 2, y: -16, width: ancho, height: 32, rx: 16 }));
      pill.appendChild(Object.assign(
        crear("text", { class: "zonaMapa__texto", x: 0, y: 6 }), { textContent: texto }));
      g.appendChild(pill);

      capa.appendChild(g);
    });

    $("mapaAyuda").hidden = !alguna;
  }

  async function pintarZonas() {
    let zonas;
    try {
      zonas = await MiParqueo.disponibilidad();
    } catch (error) {
      $("liveLabel").textContent = "Sin conexión";
      $("liveLabel").closest(".live").classList.add("live--caida");
      $("zonasGrid").innerHTML = `<p class="aviso aviso--error">No se pudo consultar la disponibilidad. Reintenta en un momento.</p>`;
      return;
    }

    $("liveLabel").textContent = "En vivo";
    $("liveLabel").closest(".live").classList.remove("live--caida");
    $("zonasGrid").innerHTML = zonas.map(tarjetaZona).join("");

    zonas.forEach((z) => {
      const el = $("zonasGrid").querySelector(`.js-contador[data-zona="${z.id}"]`);
      animarContador(el, previos.has(z.id) ? previos.get(z.id) : z.libres, z.libres);
      previos.set(z.id, z.libres);
    });
    ultimasZonas = zonas;
    pintarMapa(zonas);

    const ahora = new Date();
    $("heroMeta").textContent =
      `Actualizado a las ${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
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
    const total = vence - new Date(asignacion.inicio).getTime();

    function latido() {
      const restante = vence - Date.now();
      $("contadorTiempo").textContent = duracion(restante);
      $("contadorBarra").style.width = `${Math.max(0, Math.min(1, restante / total)) * 100}%`;
      $("contador").classList.toggle("contador--urgente", restante <= 30 * 60 * 1000 && restante > 0);

      if (restante <= 15 * 60 * 1000 && restante > 0 && !avisadoPocoTiempo) {
        avisadoPocoTiempo = true;
        notificar("Te quedan 15 minutos",
          `Marca tu salida del ${asignacion.espacios.codigo} o extiende 6 horas más.`);
      }
      if (restante <= 0 && !avisadoVencimiento) {
        avisadoVencimiento = true;
        notificar("Tu parqueo se venció", "El espacio quedó libre. Si sigues ahí, pueden reportarte.");
        detenerReloj();
        recargar();
      }
    }

    latido();
    reloj = setInterval(latido, 1000);
  }

  // ---------- Estado del parqueo ----------

  function pintarEstado() {
    const suspendido = strikes >= LIMITE_STRIKES;
    $("bloqueSancion").hidden = !suspendido;
    $("strikesTotal").textContent = strikes;

    $("avisoSinVehiculo").hidden = vehiculos.length > 0;

    if (asignacion) {
      $("bloqueActivo").hidden = false;
      const espacio = asignacion.espacios;
      const vehiculo = asignacion.vehiculos;
      $("espacioCodigo").textContent = espacio.codigo;
      $("espacioZona").textContent =
        [espacio.zonas.nombre, piso(espacio.codigo), espacio.zonas.referencia]
          .filter(Boolean).join(" · ");
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
    }
  }

  function revisarVencimiento(historial) {
    const ultima = historial[0];
    if (!ultima) { $("bloqueVencido").hidden = true; return; }

    const vencida = !ultima.salida_en && new Date(ultima.vence_en) < new Date();
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
      MiParqueo.historial(1),
    ]);

    asignacion = asig;
    vehiculos = vehs;
    strikes = reportes.filter((r) => r.estado === "validado").length;

    pintarEstado();
    revisarVencimiento(hist);
    await pintarZonas();
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

  async function reservar(zonaId, vehiculoId, boton) {
    await conBoton(boton, "Asignando…", async () => {
      await MiParqueo.solicitar(zonaId, vehiculoId);
      $("modalReservar").hidden = true;
      $("avisoParqueo").hidden = true;
      await recargar();
      avisar(`Te asignamos el espacio ${asignacion.espacios.codigo}. Tienes 6 horas.`, "ok");
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    });
  }

  // ---------- Reserva desde el mapa ----------

  let zonaEnModal = null;

  function abrirReserva(zonaId) {
    const z = ultimasZonas.find((x) => x.id === zonaId);
    if (!z) return;
    zonaEnModal = zonaId;

    const motivo = motivoBloqueo(z);
    $("reservaZona").textContent = z.referencia || "Campus PUCMM";
    $("tituloReservar").textContent = z.nombre;
    $("reservaDetalle").textContent =
      `${z.libres} de ${z.capacidad} espacios libres ahora mismo.`;

    // La elección del vehículo se hace aquí, al confirmar, y no antes:
    // es el único momento en que importa.
    $("reservaVehiculo").innerHTML = vehiculos
      .map((v) => `<option value="${v.id}">${v.placa} · ${v.marca} ${v.modelo} ${v.color}</option>`)
      .join("");
    $("reservaSelector").hidden = !!motivo || !vehiculos.length;

    $("reservaBloqueo").hidden = !motivo;
    $("reservaBloqueo").textContent = motivo || "";
    $("btnConfirmarReserva").hidden = !!motivo;

    $("modalReservar").hidden = false;
  }

  function conectar() {
    const img = document.querySelector(".mapaReal img");
    if (img) {
      if (img.complete) ajustarViewBox();
      img.addEventListener("load", () => { ajustarViewBox(); pintarMapa(ultimasZonas); });
    }

    // Señalar una zona en el mapa resalta su tarjeta, y al revés: así se
    // ve de un vistazo qué área del campus es cada nombre.
    const resaltar = (id, encendido) => {
      const card = $(`card-${id}`);
      const area = $("capaZonas").querySelector(`[data-zona="${id}"]`);
      if (card) card.classList.toggle("zona--resaltada", encendido);
      if (area) area.classList.toggle("zonaMapa--resaltada", encendido);
    };

    const vincular = (contenedor, selector, leerId) => {
      contenedor.addEventListener("pointerover", (e) => {
        const el = e.target.closest(selector);
        if (el) resaltar(leerId(el), true);
      });
      contenedor.addEventListener("pointerout", (e) => {
        const el = e.target.closest(selector);
        if (el) resaltar(leerId(el), false);
      });
    };

    vincular($("capaZonas"), "[data-zona]", (el) => el.dataset.zona);
    vincular($("zonasGrid"), ".zona", (el) => el.id.replace("card-", ""));

    $("capaZonas").addEventListener("click", (e) => {
      const g = e.target.closest("[data-zona]");
      if (g) abrirReserva(g.dataset.zona);
    });
    $("capaZonas").addEventListener("keydown", (e) => {
      const g = e.target.closest("[data-zona]");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirReserva(g.dataset.zona); }
    });

    $("btnConfirmarReserva").addEventListener("click", (e) => {
      const vehiculo = $("reservaVehiculo").value || (vehiculos[0] || {}).id;
      if (!vehiculo) return;
      reservar(zonaEnModal, vehiculo, e.target);
    });

    // Tanto la tarjeta como el mapa llevan al mismo sitio: confirmar.
    $("zonasGrid").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-solicitar]");
      if (boton) abrirReserva(boton.dataset.solicitar);
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

    $("btnReportar").addEventListener("click", () => {
      if (!asignacion) return;
      $("rMeta").textContent =
        `Se registrará el espacio ${asignacion.espacios.codigo} y la hora actual (${hora(new Date().toISOString())}).`;
      $("modalReporte").hidden = false;
      $("rPlaca").focus();
    });

    $("formReporte").addEventListener("submit", async (e) => {
      e.preventDefault();
      const archivo = $("rFoto").files[0];
      await conBoton($("btnEnviarReporte"), "Enviando reporte…", async () => {
        let fotoUrl = null;
        if (archivo) fotoUrl = await MiParqueo.subirEvidencia(archivo);

        const nueva = await MiParqueo.reportarYReasignar({
          placa: $("rPlaca").value,
          descripcion: $("rDescripcion").value,
          fotoUrl,
        });

        $("modalReporte").hidden = true;
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
  }

  return {
    async mostrar() {
      if (!conectado) { conectar(); conectado = true; }
      $("avisoParqueo").hidden = true;
      try {
        await recargar();
      } catch (error) {
        avisar(error.message, "error");
      }
    },

    ocultar() { detenerReloj(); },

    reiniciar() {
      detenerReloj();
      asignacion = null;
      vehiculos = [];
      strikes = 0;
      previos.clear();
    },

    // Cuando alguien más solicita o libera un espacio.
    refrescarZonas() {
      if (!$("vistaInicio").hidden) pintarZonas();
    },
  };
})();
