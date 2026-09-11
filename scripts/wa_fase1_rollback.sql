-- ================================================================
-- ROLLBACK FASE 1 — reversión completa, orden inverso a dependencias
-- ================================================================

BEGIN;

DROP TRIGGER  IF EXISTS trg_mensajes_wa_original_jid_immutable ON mensajes_wa;
DROP FUNCTION IF EXISTS fn_original_jid_immutable();

DROP TRIGGER  IF EXISTS trg_wa_contacts_updated_at ON wa_contacts;
DROP FUNCTION IF EXISTS fn_wa_contacts_set_updated_at();

DROP INDEX IF EXISTS idx_asignaciones_unique_active_contact;
DROP INDEX IF EXISTS idx_asignaciones_contact_id;
DROP INDEX IF EXISTS idx_mensajes_wa_contact_id;

ALTER TABLE asignaciones_wa DROP COLUMN IF EXISTS contact_id;
ALTER TABLE mensajes_wa     DROP COLUMN IF EXISTS original_jid;
ALTER TABLE mensajes_wa     DROP COLUMN IF EXISTS contact_id;

ALTER TABLE wa_contacts
  DROP CONSTRAINT IF EXISTS fk_wa_contacts_preferred_identity;

DROP TABLE IF EXISTS wa_contact_jids;
DROP TABLE IF EXISTS wa_contacts;

COMMIT;
