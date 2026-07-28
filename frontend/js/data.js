/* ============================================================
   MiParqueo · capa de datos

   Único punto de contacto con Supabase. Las pantallas no saben
   de SQL: llaman a estos métodos y reciben datos ya listos.

   Las reglas de negocio (asignar, extender, reportar, sancionar)
   viven en funciones de PostgreSQL, no aquí: así no se pueden
   saltar manipulando el navegador.
   ============================================================ */

const MiParqueo = (() => {
  const cfg = window.MIPARQUEO_CONFIG || {};
  const configurado = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  if (!configurado) {
    // Sin credenciales no hay aplicación. Se avisa claro en vez de
    // inventar datos: un número falso es peor que un error honesto.
    console.error(
      "MiParqueo: falta configurar frontend/js/config.js con la URL y la clave anon de Supabase."
    );
  }

  const db = configurado
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  function exigirConfig() {
    if (!db) throw new Error("La aplicación no está conectada a Supabase. Revisa js/config.js.");
  }

  // Convierte el error de Postgres en algo legible para el usuario.
  function fallo(error) {
    if (!error) return null;
    return new Error(error.message || "Ocurrió un error inesperado.");
  }

  async function rpc(nombre, args) {
    exigirConfig();
    const { data, error } = await db.rpc(nombre, args || {});
    if (error) throw fallo(error);
    return data;
  }

  return {
    configurado,
    db,

    // ---------- Sesión ----------

    async sesion() {
      if (!db) return null;
      const { data } = await db.auth.getSession();
      return data.session;
    },

    async perfil() {
      exigirConfig();
      const sesion = await this.sesion();
      if (!sesion) return null;
      const { data, error } = await db
        .from("perfiles")
        .select("id, nombre, correo, tipo, rol")
        .eq("id", sesion.user.id)
        .maybeSingle();
      if (error) throw fallo(error);
      return data;
    },

    // Con contraseña: entrada inmediata, sin depender del correo.
    async entrarConClave(correo, clave) {
      exigirConfig();
      const { error } = await db.auth.signInWithPassword({
        email: correo.trim().toLowerCase(),
        password: clave,
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("Correo o contraseña incorrectos.");
        }
        throw fallo(error);
      }
    },

    // Enlace mágico: el usuario recibe un correo y entra sin contraseña.
    // También sirve para crear la cuenta la primera vez.
    async enviarEnlace(correo, nombre, destino) {
      exigirConfig();
      const { error } = await db.auth.signInWithOtp({
        email: correo.trim().toLowerCase(),
        options: {
          emailRedirectTo: destino,
          data: nombre ? { nombre: nombre.trim() } : undefined,
        },
      });
      if (error) throw fallo(error);
    },

    async cerrarSesion() {
      exigirConfig();
      await db.auth.signOut();
    },

    alCambiarSesion(fn) {
      if (!db) return;
      db.auth.onAuthStateChange((_evento, sesion) => fn(sesion));
    },

    // ---------- Disponibilidad (pública) ----------

    async disponibilidad() {
      exigirConfig();
      const { data, error } = await db
        .from("disponibilidad")
        .select("id, nombre, referencia, capacidad, libres, deshabilitados")
        .order("orden");
      if (error) throw fallo(error);
      return data;
    },

    // Avisa cuando cambia algo que afecta la disponibilidad.
    suscribir(alCambiar) {
      if (!db) return;
      db.channel("miparqueo-en-vivo")
        .on("postgres_changes", { event: "*", schema: "public", table: "asignaciones" }, alCambiar)
        .on("postgres_changes", { event: "*", schema: "public", table: "espacios" }, alCambiar)
        .subscribe();
    },

    // ---------- Vehículos ----------

    async misVehiculos() {
      exigirConfig();
      const { data, error } = await db
        .from("vehiculos")
        .select("id, placa, marca, modelo, color")
        .order("creado_en");
      if (error) throw fallo(error);
      return data;
    },

    async registrarVehiculo({ placa, marca, modelo, color }) {
      exigirConfig();
      const sesion = await this.sesion();
      const { data, error } = await db
        .from("vehiculos")
        .insert({
          usuario_id: sesion.user.id,
          placa: placa.trim(),
          marca: marca.trim(),
          modelo: modelo.trim(),
          color: color.trim(),
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("Esa placa ya está registrada.");
        throw fallo(error);
      }
      return data;
    },

    async eliminarVehiculo(id) {
      exigirConfig();
      const { error } = await db.from("vehiculos").delete().eq("id", id);
      if (error) throw fallo(error);
    },

    // ---------- Parqueo ----------

    async miAsignacion() {
      exigirConfig();
      const { data, error } = await db
        .from("asignaciones")
        .select(
          "id, inicio, vence_en, extensiones, " +
            "espacios(id, codigo, zona_id, zonas(nombre, referencia)), " +
            "vehiculos(placa, marca, modelo, color)"
        )
        .is("salida_en", null)
        .gt("vence_en", new Date().toISOString())
        .maybeSingle();
      if (error) throw fallo(error);
      return data;
    },

    solicitar(zonaId, vehiculoId) {
      return rpc("solicitar_parqueo", { p_zona: zonaId, p_vehiculo: vehiculoId });
    },

    extender() {
      return rpc("extender_parqueo");
    },

    marcarSalida() {
      return rpc("marcar_salida");
    },

    cancelar() {
      return rpc("cancelar_parqueo");
    },

    async historial(limite = 20) {
      exigirConfig();
      const { data, error } = await db
        .from("asignaciones")
        .select("id, inicio, vence_en, salida_en, cerrada_por, espacios(codigo, zonas(nombre))")
        .order("inicio", { ascending: false })
        .limit(limite);
      if (error) throw fallo(error);
      return data;
    },

    // ---------- Reportes ----------

    // Sube la foto al bucket público de evidencias y devuelve su URL.
    async subirEvidencia(archivo) {
      exigirConfig();
      const sesion = await this.sesion();
      const extension = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const ruta = `${sesion.user.id}/${Date.now()}.${extension}`;
      const { error } = await db.storage.from("evidencias").upload(ruta, archivo, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw fallo(error);
      const { data } = db.storage.from("evidencias").getPublicUrl(ruta);
      return data.publicUrl;
    },

    // Crea el reporte, suelta el espacio ocupado y asigna otro.
    // Devuelve la nueva asignación, o null si la zona quedó llena.
    reportarYReasignar({ placa, descripcion, fotoUrl }) {
      return rpc("reportar_y_reasignar", {
        p_placa: placa,
        p_descripcion: descripcion,
        p_foto_url: fotoUrl || null,
      });
    },

    // Reportes en mi contra (los que pueden costarme un strike).
    async reportesEnMiContra() {
      exigirConfig();
      const sesion = await this.sesion();
      const { data, error } = await db
        .from("reportes")
        .select("id, placa_reportada, descripcion, foto_url, ocurrido_en, estado, nota_admin, espacios(codigo), apelaciones(id, estado, texto, nota_admin)")
        .eq("infractor_id", sesion.user.id)
        .order("creado_en", { ascending: false });
      if (error) throw fallo(error);
      return data;
    },

    async misStrikes() {
      const reportes = await this.reportesEnMiContra();
      return reportes.filter((r) => r.estado === "validado").length;
    },

    async apelar(reporteId, texto) {
      exigirConfig();
      const sesion = await this.sesion();
      const { error } = await db.from("apelaciones").insert({
        reporte_id: reporteId,
        usuario_id: sesion.user.id,
        texto: texto.trim(),
      });
      if (error) {
        if (error.code === "23505") throw new Error("Ya apelaste ese reporte.");
        throw fallo(error);
      }
    },

    // ---------- Incidencias generales ----------

    async reportarIncidencia({ zonaId, descripcion, fotoUrl }) {
      exigirConfig();
      const sesion = await this.sesion();
      const { error } = await db.from("incidencias").insert({
        usuario_id: sesion.user.id,
        zona_id: zonaId || null,
        descripcion: descripcion.trim(),
        foto_url: fotoUrl || null,
      });
      if (error) throw fallo(error);
    },

    // ---------- Administración ----------

    admin: {
      async reportes(estado = "pendiente") {
        exigirConfig();
        const { data, error } = await db
          .from("reportes")
          .select(
            "id, placa_reportada, descripcion, foto_url, ocurrido_en, estado, nota_admin, " +
              "espacios(codigo, zonas(nombre)), " +
              "reportante:perfiles!reportes_reportante_id_fkey(nombre, correo), " +
              "infractor:perfiles!reportes_infractor_id_fkey(id, nombre, correo)"
          )
          .eq("estado", estado)
          .order("creado_en", { ascending: false });
        if (error) throw fallo(error);
        return data;
      },

      resolverReporte(id, valido, nota) {
        return rpc("resolver_reporte", { p_reporte: id, p_valido: valido, p_nota: nota || null });
      },

      async apelaciones(estado = "pendiente") {
        exigirConfig();
        const { data, error } = await db
          .from("apelaciones")
          .select(
            "id, texto, estado, creado_en, " +
              "perfiles(nombre, correo), " +
              "reportes(id, placa_reportada, descripcion, foto_url, ocurrido_en, espacios(codigo))"
          )
          .eq("estado", estado)
          .order("creado_en", { ascending: false });
        if (error) throw fallo(error);
        return data;
      },

      resolverApelacion(id, aceptar, nota) {
        return rpc("resolver_apelacion", {
          p_apelacion: id,
          p_aceptar: aceptar,
          p_nota: nota || null,
        });
      },

      async espacios(zonaId) {
        exigirConfig();
        let consulta = db
          .from("espacios")
          .select("id, codigo, numero, zona_id, habilitado, motivo")
          .order("numero");
        if (zonaId) consulta = consulta.eq("zona_id", zonaId);
        const { data, error } = await consulta;
        if (error) throw fallo(error);
        return data;
      },

      habilitarEspacio(id, habilitado, motivo) {
        return rpc("habilitar_espacio", {
          p_espacio: id,
          p_habilitado: habilitado,
          p_motivo: motivo || null,
        });
      },
    },
  };
})();
