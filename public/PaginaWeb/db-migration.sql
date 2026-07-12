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
