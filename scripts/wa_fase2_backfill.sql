-- ================================================================
-- FASE 2 BACKFILL — SEGURO únicamente (phone ^57[0-9]{10}$)
-- source='backfill', trust_level='inferred'
-- Sin tocar mensajes históricos ni wa_identidades
-- ================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- A. Tabla temporal con los pares (numero_sesion, jid) SEGURO
-- ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _bf2_seguro ON COMMIT DROP AS
SELECT DISTINCT
  numero  AS numero_sesion,
  contacto AS jid
FROM mensajes_wa
WHERE contacto ~ '^57[0-9]{10}$'
ORDER BY numero, contacto;

-- Verificar conteo antes de proceder
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM _bf2_seguro;
  RAISE NOTICE 'BACKFILL: % pares SEGURO a procesar', v_count;
END; $$;

-- ────────────────────────────────────────────────────────────────
-- B. Loop principal: wa_contacts + wa_contact_jids + preferred
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r              RECORD;
  v_contact_id   bigint;
  v_jid_id       bigint;
  v_n            bigint := 0;
BEGIN
  FOR r IN SELECT numero_sesion, jid FROM _bf2_seguro ORDER BY numero_sesion, jid LOOP

    INSERT INTO wa_contacts (numero_sesion)
    VALUES (r.numero_sesion)
    RETURNING id INTO v_contact_id;

    INSERT INTO wa_contact_jids
      (contact_id, numero_sesion, jid, jid_type, trust_level, source)
    VALUES
      (v_contact_id, r.numero_sesion, r.jid, 'phone', 'inferred', 'backfill')
    RETURNING id INTO v_jid_id;

    UPDATE wa_contacts
    SET preferred_identity_id = v_jid_id
    WHERE id = v_contact_id;

    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'BACKFILL DO: % contactos insertados', v_n;
END; $$;

-- ────────────────────────────────────────────────────────────────
-- C. Vincular mensajes_wa.contact_id
-- ────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE mensajes_wa mw
  SET contact_id = wc.id
  FROM wa_contact_jids wcj
  JOIN wa_contacts     wc ON wc.id = wcj.contact_id
  WHERE mw.numero    = wcj.numero_sesion
    AND mw.contacto  = wcj.jid
    AND wcj.source   = 'backfill'
    AND mw.contact_id IS NULL
  RETURNING mw.id
)
SELECT count(*) AS mensajes_actualizados FROM upd;

-- ────────────────────────────────────────────────────────────────
-- D. Vincular asignaciones_wa.contact_id
-- ────────────────────────────────────────────────────────────────
WITH upd AS (
  UPDATE asignaciones_wa aw
  SET contact_id = wc.id
  FROM wa_contact_jids wcj
  JOIN wa_contacts     wc ON wc.id = wcj.contact_id
  WHERE aw.numero    = wcj.numero_sesion
    AND aw.contacto  = wcj.jid
    AND wcj.source   = 'backfill'
    AND aw.contact_id IS NULL
  RETURNING aw.id
)
SELECT count(*) AS asignaciones_actualizadas FROM upd;

COMMIT;
