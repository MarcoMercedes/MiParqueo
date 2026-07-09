/* ============================================================
   MiParqueo · capa de datos
   Doble modo:
   - "supabase": lee public.zonas y se suscribe a cambios en
     tiempo real (Supabase Realtime).
   - "demo": datos simulados que se mueven cada pocos segundos.
   El resto de la aplicación no sabe cuál modo está activo.
   ============================================================ */

const ParqueoData = (() => {
  const cfg = window.MIPARQUEO_CONFIG || {};
  const haySupabase =
    !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  // ---------- Modo Supabase ----------
  if (haySupabase) {
    const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    return {
      modo: "supabase",

      async obtenerZonas() {
        const { data, error } = await client
          .from("zonas")
          .select("id, nombre, referencia, capacidad, ocupados")
          .order("nombre");
        if (error) throw error;
        return data;
      },

      // Llama a alCambiar() cada vez que una zona cambia en la base de datos.
      suscribir(alCambiar) {
        client
          .channel("zonas-en-vivo")
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "zonas" },
            () => alCambiar()
          )
          .subscribe();
      },
    };
  }

  // ---------- Modo demostración ----------
  const zonas = [
    { id: "a1", nombre: "Zona A1", referencia: "Edificio A1, centro del campus", capacidad: 120, ocupados: 64 },
    { id: "b1", nombre: "Zona B1", referencia: "Sector B1, por la C. Eduardo Vicioso", capacidad: 90, ocupados: 74 },
    { id: "pg", nombre: "Posgrado", referencia: "Edificio de Posgrado, lado oeste", capacidad: 45, ocupados: 45 },
  ];

  function variar(zona) {
    const delta = Math.floor(Math.random() * 5) - 2; // -2..+2
    zona.ocupados = Math.max(0, Math.min(zona.capacidad, zona.ocupados + delta));
  }

  return {
    modo: "demo",

    obtenerZonas() {
      return Promise.resolve(zonas.map((z) => ({ ...z })));
    },

    suscribir(alCambiar) {
      setInterval(() => {
        zonas.forEach(variar);
        alCambiar();
      }, 6000);
    },
  };
})();
