/**
 * ====================================================================
 * SUPABASE CLIENT INITIALIZER (PRODUCCIÓN & REALTIME)
 * ====================================================================
 */

(function () {
  'use strict';

  if (!window.supabase) {
    console.error('El SDK de Supabase (@supabase/supabase-js) no está disponible en window.supabase.');
    return;
  }

  const config = window.ERP_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL;
  const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('No se encontraron las credenciales de Supabase en window.ERP_CONFIG.');
    return;
  }

  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }
})();