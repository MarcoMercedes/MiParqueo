/* ============================================================
   MiParqueo · configuración

   URL del proyecto y clave pública (Supabase → Project Settings
   → API Keys). La clave publishable viaja al navegador por
   diseño; lo que protege los datos son las políticas RLS del
   script de migración. La clave secreta no va aquí nunca.
   ============================================================ */

window.MIPARQUEO_CONFIG = {
  SUPABASE_URL: "https://fsennpqdgartobrxdgig.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ynoz8GAWalgw2VGcYuo_5g_z3kDqbr7",
};
