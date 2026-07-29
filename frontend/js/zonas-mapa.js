/* ============================================================
   MiParqueo · contornos de las zonas sobre el mapa

   Coordenadas en unidades del viewBox 0 0 1000 669 de
   assets/mapa_pucmm.jpg. Se dibujaron con delimitar.html: se hace
   clic en cada esquina del parqueo y esa página devuelve este
   mismo bloque ya formateado.

   Si se cambia la foto del mapa hay que volver a delimitar: los
   puntos están atados a esa imagen concreta.

   Una zona sin puntos simplemente no se dibuja en el mapa; sigue
   apareciendo en las tarjetas de disponibilidad.
   ============================================================ */

/* Cada zona tiene su color propio para distinguirla de un vistazo.
   Son azules, violetas y rosas a propósito: el verde, el ámbar y el
   rojo están reservados para la disponibilidad, y si una zona fuera
   ámbar nadie sabría si es su color o que está casi llena. La etiqueta
   con el conteo sí usa el color del semáforo. */
const ZONAS_ESTILO = {
  a1:  { corto: "A1",       color: "#3b82f6" },
  b1:  { corto: "B1",       color: "#a855f7" },
  pgt: { corto: "PG Torre", color: "#06b6d4" },
  pgp: { corto: "PG Plano", color: "#ec4899" },
};

const ZONAS_MAPA = {
  a1:  [[804.3, 34.4], [810.5, 214.9], [979.5, 215.8], [981.4, 38.7]],
  b1:  [[64.8, 508.7], [165.7, 503.9], [176.7, 605.3], [79.5, 618.2]],
  pgt: [[572.9, 392.5], [719, 386.3], [721.9, 451.5], [583.8, 455.3]],
  pgp: [[334.3, 273], [472.4, 262], [475.2, 400.1], [401.9, 377.7], [398.1, 324.4], [331, 330.6]],
};
