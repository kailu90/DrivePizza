-- ============================================================
-- PaginaWeb - Migracion Supabase
-- Ejecutar en: https://db.everest-central.com -> SQL Editor
-- ============================================================

-- 1. Agregar columnas a la tabla sedes
ALTER TABLE sedes
  ADD COLUMN IF NOT EXISTS nombre_display   TEXT,
  ADD COLUMN IF NOT EXISTS ciudad           TEXT,
  ADD COLUMN IF NOT EXISTS direccion        TEXT,
  ADD COLUMN IF NOT EXISTS telefono         TEXT,
  ADD COLUMN IF NOT EXISTS linea_ivr        TEXT,
  ADD COLUMN IF NOT EXISTS horario_apertura TIME DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS horario_cierre   TIME DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS dias_activos     INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS activa_web       BOOLEAN DEFAULT true;

-- 2. Normalizar name a minuscula (consistente con el resto del sistema)
UPDATE sedes SET name = 'cabecera'    WHERE name = 'CABECERA';
UPDATE sedes SET name = 'cañaveral'   WHERE name = 'CAÑAVERAL';
UPDATE sedes SET name = 'acropolis'   WHERE name = 'ACROPOLIS';
UPDATE sedes SET name = 'piedecuesta' WHERE name = 'PIEDECUESTA';
UPDATE sedes SET name = 'megamall'    WHERE name = 'MEGAMALL';
UPDATE sedes SET name = 'unico'       WHERE name = 'UNICO';
UPDATE sedes SET name = 'planta'      WHERE name = 'PLANTA PRODUCCIÓN';

-- 3. Poblar datos de cada sede

UPDATE sedes SET
  nombre_display   = 'Cabecera',
  ciudad           = 'Bucaramanga',
  telefono         = '3213714622',
  linea_ivr        = '3166600690',
  horario_apertura = '15:15',
  horario_cierre   = '23:00',
  dias_activos     = '{0,1,2,3,4,5,6}',
  activa_web       = true
WHERE name = 'cabecera';

UPDATE sedes SET
  nombre_display   = 'Cañaveral',
  ciudad           = 'Bucaramanga',
  direccion        = 'Cl 31 A # 26 - 28 Barrio Cañaveral',
  telefono         = '3213714622',
  linea_ivr        = '3166600690',
  horario_apertura = '15:15',
  horario_cierre   = '23:00',
  dias_activos     = '{0,1,2,3,4,5,6}',
  activa_web       = true
WHERE name = 'cañaveral';

UPDATE sedes SET
  nombre_display   = 'Piedecuesta',
  ciudad           = 'Piedecuesta',
  direccion        = 'Transversal 1 BN # 7C - 14 Barrio La Argentina',
  telefono         = '3161111845',
  linea_ivr        = '3166600690',
  horario_apertura = '15:15',
  horario_cierre   = '23:00',
  dias_activos     = '{0,1,2,3,4,5,6}',
  activa_web       = true
WHERE name = 'piedecuesta';

UPDATE sedes SET
  nombre_display   = 'Acrópolis',
  ciudad           = 'Bucaramanga',
  direccion        = 'Centro Comercial Acrópolis, Mall de Comidas',
  telefono         = '3161111803',
  linea_ivr        = '3166600690',
  horario_apertura = '11:30',
  horario_cierre   = '21:00',
  dias_activos     = '{0,1,2,3,4,5,6}',
  activa_web       = true
WHERE name = 'acropolis';

UPDATE sedes SET
  nombre_display   = 'Megamall',
  ciudad           = 'Bucaramanga',
  direccion        = 'Centro Comercial Megamall, Mall de Comidas',
  telefono         = '3023566057',
  linea_ivr        = '3166600690',
  horario_apertura = '11:30',
  horario_cierre   = '21:00',
  dias_activos     = '{0,1,2,3,4,5,6}',
  activa_web       = true
WHERE name = 'megamall';

UPDATE sedes SET
  nombre_display   = 'Único',
  ciudad           = 'Bucaramanga',
  direccion        = 'Centro Comercial Único, Mall de Comidas',
  telefono         = '3147513040',
  linea_ivr        = '3166600690',
  horario_apertura = '12:00',
  horario_cierre   = '21:00',
  dias_activos     = '{0,1,2,3,4,5,6}',
  activa_web       = true
WHERE name = 'unico';

UPDATE sedes SET
  nombre_display   = 'Planta de Producción',
  activa_web       = false
WHERE name = 'planta';

-- 4. Verificar resultado
SELECT name, nombre_display, ciudad, direccion, telefono, linea_ivr,
       horario_apertura, horario_cierre, activa_web
FROM sedes
ORDER BY name;


-- ============================================================
-- Auth web — cuentas de clientes (parte 2)
-- Ejecutar en: https://db.everest-central.com -> SQL Editor
-- ============================================================

-- 5. Extender tabla clientes con columnas de autenticación web
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS auth_uid   uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email      text,
  ADD COLUMN IF NOT EXISTS fecha_nac  date,
  ADD COLUMN IF NOT EXISTS verificado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clientes_auth_uid ON clientes(auth_uid);

-- 6. Tabla de direcciones por cliente (web)
CREATE TABLE IF NOT EXISTS direcciones_cliente (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  alias          text        NOT NULL DEFAULT 'Casa',
  icono          text        NOT NULL DEFAULT 'casa',
  direccion      text        NOT NULL,
  barrio         text        NOT NULL,
  ciudad         text,
  telefono       text,
  predeterminada boolean     NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dir_cliente ON direcciones_cliente(cliente_id);

-- RLS: solo el cliente dueño accede a sus direcciones
ALTER TABLE direcciones_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "web_dir_own" ON direcciones_cliente
  FOR ALL TO authenticated
  USING      (cliente_id = (SELECT id FROM clientes WHERE auth_uid = auth.uid()))
  WITH CHECK (cliente_id = (SELECT id FROM clientes WHERE auth_uid = auth.uid()));

-- 7. Tabla de favoritos por cliente (web)
CREATE TABLE IF NOT EXISTS favoritos_cliente (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  producto_nombre text        NOT NULL,
  categoria       text,
  precio          integer,
  fecha_agregado  timestamptz DEFAULT now(),
  UNIQUE(cliente_id, producto_nombre)
);
CREATE INDEX IF NOT EXISTS idx_fav_cliente ON favoritos_cliente(cliente_id);

-- RLS: solo el cliente dueño accede a sus favoritos
ALTER TABLE favoritos_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "web_fav_own" ON favoritos_cliente
  FOR ALL TO authenticated
  USING      (cliente_id = (SELECT id FROM clientes WHERE auth_uid = auth.uid()))
  WITH CHECK (cliente_id = (SELECT id FROM clientes WHERE auth_uid = auth.uid()));

-- 8. Verificar columnas nuevas en clientes
SELECT id, nombre, telefono, email, auth_uid, verificado
FROM clientes
LIMIT 5;
