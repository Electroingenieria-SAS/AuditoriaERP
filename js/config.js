/**
 * ====================================================================
 * ERP CONFIGURATION MODULE (CENTRALIZADO & SEGURO)
 * ====================================================================
 * Provee los parámetros de conexión y entorno para la aplicación.
 * Las llaves privadas (Service Role, API keys de backend) se mantienen
 * estrictamente en el entorno del servidor y nunca se exponen al cliente.
 */

(function () {
  'use strict';

  // Obtener variables inyectadas por el entorno o variables base de producción
  const runtimeEnv = window.__ENV || {};

  const CONFIG = {
    SUPABASE_URL: runtimeEnv.SUPABASE_URL || 'https://hurxdjoiafkjoyrmyhbd.supabase.co',
    SUPABASE_ANON_KEY: runtimeEnv.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1cnhkam9pYWZram95cm15aGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzgxMTMsImV4cCI6MjA5NTMxNDExM30.Z6fRiWft3eSEVNZbWflmcvVcHAJTAEA37tPdp4LRnTg',
    APP_VERSION: '2.7.0',
    ENVIRONMENT: runtimeEnv.NODE_ENV || 'production',
    STORAGE_BUCKETS: {
      RECEPCIONES: 'recepciones-pdf',
      AUDITORIAS: 'auditorias'
    },
    RATE_LIMIT: {
      MAX_LOGIN_ATTEMPTS: 5,
      LOCKOUT_DURATION_MS: 60000 // 1 minuto
    },
    AUDIO_NOTIFICATIONS: true
  };

  window.ERP_CONFIG = Object.freeze(CONFIG);
})();

