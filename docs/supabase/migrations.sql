-- ====================================================================
-- SISTEMA INTEGRAL ERP AUDITORÍA & LOGÍSTICA — ESQUEMA COMPLETO v2.7.0
-- Motor de Base de Datos PostgreSQL / Supabase
-- Totalmente Idempotente y Defensivo (Sin Errores 42P10)
-- ====================================================================

-- ====================================================================
-- 1. EXTENSIONES Y FUNCIONES DE SOPORTE
-- ====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Función de actualización automática de timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 2. TABLAS BASE DEL SISTEMA
-- ====================================================================

-- 2.1 TABLA DE USUARIOS Y ROLES (RBAC)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'auditor' CHECK (rol IN ('admin', 'lider', 'jefe', 'auditor', 'compras')),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar restricción UNIQUE en usuario de forma idempotente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_usuarios_usuario'
    ) THEN
        BEGIN
            ALTER TABLE public.usuarios ADD CONSTRAINT uq_usuarios_usuario UNIQUE (usuario);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
    END IF;
END $$;

DROP TRIGGER IF EXISTS tr_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER tr_usuarios_updated_at
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.2 TABLA DE PERMISOS GRANULARES POR MÓDULO
CREATE TABLE IF NOT EXISTS public.permisos (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL,
    modulo TEXT NOT NULL,
    ver BOOLEAN NOT NULL DEFAULT false,
    crear BOOLEAN NOT NULL DEFAULT false,
    editar BOOLEAN NOT NULL DEFAULT false,
    eliminar BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar restricción UNIQUE en (usuario, modulo) de forma idempotente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_permisos_usuario_modulo'
    ) THEN
        BEGIN
            ALTER TABLE public.permisos ADD CONSTRAINT uq_permisos_usuario_modulo UNIQUE (usuario, modulo);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
    END IF;
END $$;

DROP TRIGGER IF EXISTS tr_permisos_updated_at ON public.permisos;
CREATE TRIGGER tr_permisos_updated_at
BEFORE UPDATE ON public.permisos
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.3 TABLA DE RECEPCIONES LOGÍSTICAS Y COMPRAS
CREATE TABLE IF NOT EXISTS public.recepciones (
    id BIGSERIAL PRIMARY KEY,
    proveedor TEXT NOT NULL,
    material TEXT NOT NULL,
    tipo_recepcion TEXT DEFAULT 'Cargamento Regular',
    cantidad NUMERIC NOT NULL DEFAULT 0,
    revisadas NUMERIC NOT NULL DEFAULT 0,
    novedades NUMERIC NOT NULL DEFAULT 0,
    faltantes NUMERIC NOT NULL DEFAULT 0,
    porcentaje_revisado NUMERIC NOT NULL DEFAULT 0,
    observacion TEXT,
    comentario_validacion TEXT,
    seguimiento TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    novedad_original TEXT DEFAULT 'Conforme',
    pdf_url TEXT,
    usuario_recepcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tr_recepciones_updated_at ON public.recepciones;
CREATE TRIGGER tr_recepciones_updated_at
BEFORE UPDATE ON public.recepciones
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.4 TABLA DE SEGUIMIENTO HISTÓRICO DE RECEPCIONES
CREATE TABLE IF NOT EXISTS public.seguimiento_recepcion (
    id BIGSERIAL PRIMARY KEY,
    recepcion_id BIGINT NOT NULL REFERENCES public.recepciones(id) ON DELETE CASCADE,
    estado_anterior TEXT,
    estado_nuevo TEXT NOT NULL,
    comentario TEXT NOT NULL,
    usuario TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5 TABLA DE AUDITORÍAS PERICIALES
CREATE TABLE IF NOT EXISTS public.auditorias (
    id BIGSERIAL PRIMARY KEY,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    responsable TEXT NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    proceso TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    observaciones TEXT,
    pdf_url TEXT,
    usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tr_auditorias_updated_at ON public.auditorias;
CREATE TRIGGER tr_auditorias_updated_at
BEFORE UPDATE ON public.auditorias
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.6 TABLA DE DOCUMENTOS Y EVIDENCIAS DE AUDITORÍA
CREATE TABLE IF NOT EXISTS public.auditoria_documentos (
    id BIGSERIAL PRIMARY KEY,
    auditoria_id BIGINT NOT NULL REFERENCES public.auditorias(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    url TEXT NOT NULL,
    ruta_storage TEXT,
    mime_type TEXT,
    tamano_bytes BIGINT DEFAULT 0,
    tipo_origen TEXT NOT NULL DEFAULT 'archivo',
    usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 TABLA DE INVENTARIO Y CONTEOS FÍSICOS
CREATE TABLE IF NOT EXISTS public.inventario (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL,
    producto TEXT NOT NULL,
    ubicacion TEXT DEFAULT 'Principal',
    stock_sistema NUMERIC NOT NULL DEFAULT 0,
    conteo_fisico NUMERIC,
    diferencia NUMERIC,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar restricción UNIQUE en codigo de inventario
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventario_codigo'
    ) THEN
        BEGIN
            ALTER TABLE public.inventario ADD CONSTRAINT uq_inventario_codigo UNIQUE (codigo);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
    END IF;
END $$;

DROP TRIGGER IF EXISTS tr_inventario_updated_at ON public.inventario;
CREATE TRIGGER tr_inventario_updated_at
BEFORE UPDATE ON public.inventario
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.8 TABLA DE NOVEDADES DE INVENTARIO
CREATE TABLE IF NOT EXISTS public.novedades_inventario (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL,
    material TEXT NOT NULL,
    stock_sistema NUMERIC NOT NULL DEFAULT 0,
    conteo_fisico NUMERIC NOT NULL DEFAULT 0,
    diferencia NUMERIC NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL,
    usuario TEXT,
    observacion TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.9 TABLA DE CONFIABILIDAD DE INVENTARIO
CREATE TABLE IF NOT EXISTS public.confiabilidad (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes TEXT NOT NULL,
    nombre_inventario TEXT NOT NULL,
    total_empresa NUMERIC NOT NULL DEFAULT 0,
    programados NUMERIC NOT NULL DEFAULT 0,
    auditados NUMERIC NOT NULL DEFAULT 0,
    correctos NUMERIC NOT NULL DEFAULT 0,
    sobrantes NUMERIC NOT NULL DEFAULT 0,
    faltantes NUMERIC NOT NULL DEFAULT 0,
    valor_inventario NUMERIC NOT NULL DEFAULT 0,
    valor_auditado NUMERIC NOT NULL DEFAULT 0,
    valor_diferencias NUMERIC NOT NULL DEFAULT 0,
    valor_ajustes NUMERIC NOT NULL DEFAULT 0,
    indice_general NUMERIC NOT NULL DEFAULT 0,
    confiabilidad_fisica NUMERIC NOT NULL DEFAULT 0,
    confiabilidad_economica NUMERIC NOT NULL DEFAULT 0,
    cobertura NUMERIC NOT NULL DEFAULT 0,
    cumplimiento NUMERIC NOT NULL DEFAULT 0,
    confiabilidad_ajustes NUMERIC NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'En análisis',
    usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tr_confiabilidad_updated_at ON public.confiabilidad;
CREATE TRIGGER tr_confiabilidad_updated_at
BEFORE UPDATE ON public.confiabilidad
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.10 TABLA DE HISTORIAL DE AUDITORÍA Y TRAZABILIDAD
CREATE TABLE IF NOT EXISTS public.historial (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL DEFAULT 'Sistema',
    accion TEXT NOT NULL,
    modulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.11 TABLA DE NOTIFICACIONES CENTRALIZADAS MULTI-USUARIO (PERSISTENCIA DIFERIDA & REALTIME)
CREATE TABLE IF NOT EXISTS public.notificaciones (
    id BIGSERIAL PRIMARY KEY,
    usuario_destino TEXT NOT NULL,
    usuario_origen TEXT NOT NULL DEFAULT 'Sistema',
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info', 'success', 'warning', 'error')),
    modulo TEXT NOT NULL DEFAULT 'general' CHECK (modulo IN ('recepcion', 'auditorias', 'inventario', 'confiabilidad', 'usuarios', 'general')),
    referencia_id TEXT,
    leida BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 3. ÍNDICES DE ALTO RENDIMIENTO
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON public.usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_permisos_usuario ON public.permisos(usuario);
CREATE INDEX IF NOT EXISTS idx_recepciones_created_at ON public.recepciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recepciones_proveedor ON public.recepciones(proveedor);
CREATE INDEX IF NOT EXISTS idx_recepciones_material ON public.recepciones(material);
CREATE INDEX IF NOT EXISTS idx_auditorias_fecha ON public.auditorias(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditorias_tipo ON public.auditorias(tipo);
CREATE INDEX IF NOT EXISTS idx_inventario_codigo ON public.inventario(codigo);
CREATE INDEX IF NOT EXISTS idx_novedades_codigo ON public.novedades_inventario(codigo);
CREATE INDEX IF NOT EXISTS idx_confiabilidad_anio_mes ON public.confiabilidad(anio, mes);
CREATE INDEX IF NOT EXISTS idx_historial_created_at ON public.historial(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_destino ON public.notificaciones(usuario_destino, leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_modulo ON public.notificaciones(modulo, referencia_id);

-- ====================================================================
-- 4. DISPARADORES AUTOMÁTICOS DE NOTIFICACIONES MULTI-USUARIO
-- ====================================================================

-- 4.1 TRIGGER PARA NUEVAS RECEPCIONES LOGÍSTICAS
CREATE OR REPLACE FUNCTION public.fn_notificar_nueva_recepcion()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec_user RECORD;
    u_origen TEXT;
    msg TEXT;
    tit TEXT;
    tipo_alerta TEXT;
BEGIN
    u_origen := COALESCE(NEW.usuario_recepcion, 'Recepción');
    tit := '📦 Nueva Recepción #' || NEW.id;
    msg := 'Nueva recepción registrada por ' || u_origen || ': Proveedor ' || COALESCE(NEW.proveedor, 'N/A') || ' - Material ' || COALESCE(NEW.material, 'N/A') || ' (Cant: ' || COALESCE(NEW.cantidad, 0) || ')';

    IF NEW.estado ILIKE '%dañ%' OR NEW.estado ILIKE '%falt%' OR COALESCE(NEW.faltantes, 0) > 0 OR COALESCE(NEW.novedades, 0) > 0 THEN
        tipo_alerta := 'warning';
    ELSE
        tipo_alerta := 'success';
    END IF;

    FOR rec_user IN 
        SELECT usuario FROM public.usuarios WHERE estado = 'Activo'
    LOOP
        INSERT INTO public.notificaciones (
            usuario_destino,
            usuario_origen,
            titulo,
            mensaje,
            tipo,
            modulo,
            referencia_id,
            leida,
            created_at
        ) VALUES (
            rec_user.usuario,
            u_origen,
            tit,
            msg,
            tipo_alerta,
            'recepcion',
            NEW.id::text,
            false,
            NOW()
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notificar_nueva_recepcion ON public.recepciones;
CREATE TRIGGER tr_notificar_nueva_recepcion
AFTER INSERT ON public.recepciones
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_nueva_recepcion();

-- 4.2 TRIGGER PARA SEGUIMIENTO COMERCIAL & PROVEEDORES
CREATE OR REPLACE FUNCTION public.fn_notificar_nuevo_seguimiento()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec_user RECORD;
    u_origen TEXT;
    prov TEXT;
    msg TEXT;
    tit TEXT;
BEGIN
    u_origen := COALESCE(NEW.usuario, 'Compras');
    
    SELECT proveedor INTO prov FROM public.recepciones WHERE id = NEW.recepcion_id;
    prov := COALESCE(prov, 'Recepción #' || NEW.recepcion_id);

    tit := '🛒 Intervención en Recepción #' || NEW.recepcion_id;
    msg := u_origen || ' actualizó el estado a [' || COALESCE(NEW.estado_nuevo, 'Seguimiento') || '] para ' || prov || ': ' || COALESCE(NEW.comentario, '');

    FOR rec_user IN 
        SELECT usuario FROM public.usuarios WHERE estado = 'Activo'
    LOOP
        INSERT INTO public.notificaciones (
            usuario_destino,
            usuario_origen,
            titulo,
            mensaje,
            tipo,
            modulo,
            referencia_id,
            leida,
            created_at
        ) VALUES (
            rec_user.usuario,
            u_origen,
            tit,
            msg,
            'info',
            'recepcion',
            NEW.recepcion_id::text,
            false,
            NOW()
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notificar_nuevo_seguimiento ON public.seguimiento_recepcion;
CREATE TRIGGER tr_notificar_nuevo_seguimiento
AFTER INSERT ON public.seguimiento_recepcion
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_nuevo_seguimiento();

-- 4.3 TRIGGER PARA NUEVAS AUDITORÍAS PERICIALES
CREATE OR REPLACE FUNCTION public.fn_notificar_nueva_auditoria()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec_user RECORD;
    u_origen TEXT;
    msg TEXT;
    tit TEXT;
BEGIN
    u_origen := COALESCE(NEW.usuario, NEW.responsable, 'Auditoría');
    tit := '📋 Nueva Auditoría: ' || COALESCE(NEW.nombre, 'Sin título');
    msg := 'Auditoría (' || COALESCE(NEW.tipo, 'General') || ') registrada por ' || u_origen || ' - Proceso: ' || COALESCE(NEW.proceso, 'N/A') || ' - Estado: ' || COALESCE(NEW.estado, 'Pendiente');

    FOR rec_user IN 
        SELECT usuario FROM public.usuarios WHERE estado = 'Activo'
    LOOP
        INSERT INTO public.notificaciones (
            usuario_destino,
            usuario_origen,
            titulo,
            mensaje,
            tipo,
            modulo,
            referencia_id,
            leida,
            created_at
        ) VALUES (
            rec_user.usuario,
            u_origen,
            tit,
            msg,
            'info',
            'auditorias',
            NEW.id::text,
            false,
            NOW()
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notificar_nueva_auditoria ON public.auditorias;
CREATE TRIGGER tr_notificar_nueva_auditoria
AFTER INSERT ON public.auditorias
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_nueva_auditoria();

-- 4.4 TRIGGER PARA NOVEDADES DE INVENTARIO
CREATE OR REPLACE FUNCTION public.fn_notificar_novedad_inventario()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec_user RECORD;
    u_origen TEXT;
    msg TEXT;
    tit TEXT;
BEGIN
    u_origen := COALESCE(NEW.usuario, 'Inventario');
    tit := '⚠️ Novedad en Inventario: ' || COALESCE(NEW.codigo, '');
    msg := 'Discrepancia [' || COALESCE(NEW.tipo, 'Novedad') || '] reportada por ' || u_origen || ' en material ' || COALESCE(NEW.material, '') || ' (Dif: ' || COALESCE(NEW.diferencia, 0) || ')';

    FOR rec_user IN 
        SELECT usuario FROM public.usuarios WHERE estado = 'Activo'
    LOOP
        INSERT INTO public.notificaciones (
            usuario_destino,
            usuario_origen,
            titulo,
            mensaje,
            tipo,
            modulo,
            referencia_id,
            leida,
            created_at
        ) VALUES (
            rec_user.usuario,
            u_origen,
            tit,
            msg,
            'warning',
            'inventario',
            NEW.id::text,
            false,
            NOW()
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notificar_novedad_inventario ON public.novedades_inventario;
CREATE TRIGGER tr_notificar_novedad_inventario
AFTER INSERT ON public.novedades_inventario
FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_novedad_inventario();

-- ====================================================================
-- 5. STORAGE BUCKETS (SUPABASE STORAGE IDEMPOTENTE)
-- ====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 
    'recepciones-pdf', 
    'recepciones-pdf', 
    true, 
    104857600, 
    ARRAY['image/*', 'application/pdf', 'video/*', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'recepciones-pdf');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 
    'auditorias', 
    'auditorias', 
    true, 
    104857600, 
    ARRAY['image/*', 'application/pdf', 'video/*', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'auditorias');

UPDATE storage.buckets SET public = true WHERE id IN ('recepciones-pdf', 'auditorias');

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acceso publico recepciones" ON storage.objects;
    DROP POLICY IF EXISTS "Acceso publico auditorias" ON storage.objects;
    
    CREATE POLICY "Acceso publico recepciones" 
    ON storage.objects FOR ALL 
    USING (bucket_id = 'recepciones-pdf')
    WITH CHECK (bucket_id = 'recepciones-pdf');

    CREATE POLICY "Acceso publico auditorias" 
    ON storage.objects FOR ALL 
    USING (bucket_id = 'auditorias')
    WITH CHECK (bucket_id = 'auditorias');
END $$;

-- ====================================================================
-- 6. ROW LEVEL SECURITY (RLS) DEFENSIVO & POLÍTICAS
-- ====================================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_recepcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedades_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confiabilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "rls_all_%I" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Acceso total %I" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "rls_%I_all" ON public.%I', tbl, tbl);
    END LOOP;
END $$;

-- Políticas de Acceso
CREATE POLICY "rls_usuarios_all" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_permisos_all" ON public.permisos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_recepciones_all" ON public.recepciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_seguimiento_all" ON public.seguimiento_recepcion FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_auditorias_all" ON public.auditorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_auditoria_documentos_all" ON public.auditoria_documentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_inventario_all" ON public.inventario FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_novedades_all" ON public.novedades_inventario FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_confiabilidad_all" ON public.confiabilidad FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_historial_all" ON public.historial FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_notificaciones_all" ON public.notificaciones FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- 7. HABILITACIÓN DE SUPABASE REALTIME
-- ====================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recepciones;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seguimiento_recepcion;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auditorias;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.novedades_inventario;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.confiabilidad;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- ====================================================================
-- 8. SEED DATA IDEMPOTENTE (ADMINISTRADOR & PERMISOS INICIALES)
-- ====================================================================
-- 8.1 Usuario Administrador
INSERT INTO public.usuarios (usuario, password, rol, estado)
SELECT 'admin', 'admin123', 'admin', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE usuario = 'admin');

UPDATE public.usuarios 
SET estado = 'Activo', rol = 'admin' 
WHERE usuario = 'admin';

-- 8.2 Permisos Base para Administrador
INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'inventario', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'inventario');

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'recepcion', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'recepcion');

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'auditorias', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'auditorias');

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'confiabilidad', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'confiabilidad');

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'usuarios', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'usuarios');

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'historial', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'historial');

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
SELECT 'admin', 'bi', true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.permisos WHERE usuario = 'admin' AND modulo = 'bi');

UPDATE public.permisos 
SET ver = true, crear = true, editar = true, eliminar = true 
WHERE usuario = 'admin';

-- 8.3 Registro Histórico Inicial
INSERT INTO public.historial (usuario, accion, modulo, descripcion)
SELECT 'admin', 'INICIALIZACIÓN', 'sistema', 'Inicialización de esquema maestro, seguridad RLS, triggers de notificación y Realtime.'
WHERE NOT EXISTS (SELECT 1 FROM public.historial WHERE accion = 'INICIALIZACIÓN' AND modulo = 'sistema');
