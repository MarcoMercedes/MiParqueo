/* ============================================================
   MiParqueo · herramienta para delimitar zonas

   Herramienta interna, no forma parte de la aplicación. Sirve
   para dibujar sobre el mapa el contorno de cada parqueo y sacar
   las coordenadas que después usa el mapa interactivo.

   Los puntos se guardan en unidades 0–1000 sobre el viewBox, no
   en píxeles: así el mapa se puede mostrar a cualquier tamaño y
   las zonas siguen encajando.
   ============================================================ */

(function () {
  "use strict";

  const ZONAS = [
    { id: "a1",  nombre: "Zona A1",         color: "#2f7ed8" },
    { id: "b1",  nombre: "Zona B1",         color: "#e8a33d" },
    { id: "pgt", nombre: "Posgrado Torre",  color: "#1f9d55" },
    { id: "pgp", nombre: "Posgrado Plano",  color: "#c02626" },
  ];

  const CLAVE = "miparqueo:poligonos";
  const capa = document.getElementById("capa");
  const salida = document.getElementById("salida");
  const aviso = document.getElementById("avisoCopia");

  let poligonos = JSON.parse(localStorage.getItem(CLAVE) || "{}");
  let activa = ZONAS[0].id;
  let arrastrando = null;

  // El viewBox sigue la proporción de la foto: si fuera siempre cuadrado,
  // una imagen apaisada estiraría el eje X y deformaría puntos y textos.
  let ALTO = 1000;

  function ajustarViewBox() {
    const img = document.getElementById("mapa");
    if (!img.naturalWidth) return;
    ALTO = Math.round((1000 * img.naturalHeight) / img.naturalWidth);
    capa.setAttribute("viewBox", `0 0 1000 ${ALTO}`);
    pintar();
  }

  const puntos = (id) => (poligonos[id] = poligonos[id] || []);
  const color = (id) => ZONAS.find((z) => z.id === id).color;

  function guardar() {
    localStorage.setItem(CLAVE, JSON.stringify(poligonos));
  }

  // ---------- Coordenadas ----------

  // De píxeles del navegador a unidades del viewBox.
  function aViewBox(evento) {
    const caja = capa.getBoundingClientRect();
    return {
      x: Math.round(((evento.clientX - caja.left) / caja.width) * 1000 * 10) / 10,
      y: Math.round(((evento.clientY - caja.top) / caja.height) * ALTO * 10) / 10,
    };
  }

  // ---------- Dibujo ----------

  function centro(pts) {
    return pts.reduce(
      (a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }),
      { x: 0, y: 0 }
    );
  }

  function pintar() {
    capa.innerHTML = "";

    ZONAS.forEach((z) => {
      const pts = poligonos[z.id] || [];
      if (!pts.length) return;
      const esActiva = z.id === activa;
      const d = pts.map((p) => `${p.x},${p.y}`).join(" ");

      const forma = document.createElementNS("http://www.w3.org/2000/svg",
        pts.length > 2 ? "polygon" : "polyline");
      forma.setAttribute("points", d);
      forma.setAttribute("fill", pts.length > 2 ? z.color : "none");
      forma.setAttribute("fill-opacity", esActiva ? "0.34" : "0.18");
      forma.setAttribute("stroke", z.color);
      forma.setAttribute("stroke-width", esActiva ? "4" : "2.5");
      forma.setAttribute("stroke-linejoin", "round");
      capa.appendChild(forma);

      if (pts.length > 2) {
        const c = centro(pts);
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", c.x); t.setAttribute("y", c.y);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", "26");
        t.setAttribute("font-weight", "700");
        t.setAttribute("fill", "#fff");
        t.setAttribute("stroke", "rgba(0,0,0,.55)");
        t.setAttribute("stroke-width", "5");
        t.setAttribute("paint-order", "stroke");
        t.setAttribute("pointer-events", "none");
        t.textContent = z.nombre;
        capa.appendChild(t);
      }

      if (esActiva) {
        pts.forEach((p, i) => {
          const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 9);
          c.setAttribute("class", "vertice");
          c.dataset.indice = i;
          capa.appendChild(c);
        });
      }
    });

    pintarLista();
    pintarSalida();
  }

  function pintarLista() {
    document.getElementById("zonaLista").innerHTML = ZONAS.map((z) => `
      <li>
        <button class="zonaBoton ${z.id === activa ? "zonaBoton--activa" : ""}" data-zona="${z.id}">
          <span class="zonaBoton__color" style="background:${z.color}"></span>
          ${z.nombre}
          <span class="zonaBoton__conteo">${(poligonos[z.id] || []).length} pts</span>
        </button>
      </li>`).join("");
  }

  function pintarSalida() {
    const cuerpo = ZONAS.map((z) => {
      const pts = poligonos[z.id] || [];
      const lista = pts.map((p) => `[${p.x},${p.y}]`).join(", ");
      return `  ${z.id}: [${lista}],`;
    }).join("\n");

    salida.value =
      "/* Contornos de las zonas sobre assets/mapa_pucmm.jpg\n" +
      `   Unidades del viewBox 0 0 1000 ${ALTO}. */\n` +
      "const ZONAS_MAPA = {\n" + cuerpo + "\n};\n";
  }

  // ---------- Interacción ----------

  capa.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("vertice")) {
      arrastrando = Number(e.target.dataset.indice);
      capa.setPointerCapture(e.pointerId);
      return;
    }
    puntos(activa).push(aViewBox(e));
    guardar();
    pintar();
  });

  capa.addEventListener("pointermove", (e) => {
    if (arrastrando === null) return;
    puntos(activa)[arrastrando] = aViewBox(e);
    pintar();
  });

  capa.addEventListener("pointerup", () => {
    if (arrastrando !== null) { arrastrando = null; guardar(); }
  });

  document.getElementById("zonaLista").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-zona]");
    if (!boton) return;
    activa = boton.dataset.zona;
    pintar();
  });

  document.getElementById("btnDeshacer").addEventListener("click", () => {
    puntos(activa).pop();
    guardar();
    pintar();
  });

  document.getElementById("btnLimpiar").addEventListener("click", () => {
    poligonos[activa] = [];
    guardar();
    pintar();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      puntos(activa).pop();
      guardar();
      pintar();
    }
  });

  document.getElementById("btnCopiar").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(salida.value);
      aviso.textContent = "Copiado. Pégaselo en js/zonas-mapa.js.";
    } catch {
      salida.select();
      aviso.textContent = "Selecciónalo y cópialo con Ctrl+C.";
    }
  });

  document.getElementById("btnDescargar").addEventListener("click", () => {
    const blob = new Blob([salida.value], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "zonas-mapa.js";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const imagen = document.getElementById("mapa");
  if (imagen.complete) ajustarViewBox();
  imagen.addEventListener("load", ajustarViewBox);

  pintar();
})();
