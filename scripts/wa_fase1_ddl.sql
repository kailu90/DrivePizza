-- ================================================================
-- FASE 1 DDL — wa_contacts + wa_contact_jids
-- Solo aditivo. Sin backfill. Sin cambios a código ni endpoints.
-- wa_identidades y mensajes históricos sin tocar.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. TABLA wa_contacts
-- ----------------------------------------------------------------
CREATE TABLE wa_contacts (
  id                    bigserial    PRIMARY KEY,
  numero_sesion         text         NOT NULL,
  preferred_identity_id bigint,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT uq_wa_contacts_id_sesion
    UNIQUE (id, numero_sesion)
);

COMMENT ON TABLE  wa_contacts IS
  'Identidad lógica de un contacto WA por sesión. '
  'trust_level vive en cada alias (wa_contact_jids), no aquí.';
COMMENT ON COLUMN wa_contacts.preferred_identity_id IS
  'FK compuesta -> wa_contact_jids(id, contact_id). DEFERRABLE INITIALLY DEFERRED. '
  'Garantiza que el JID preferido pertenece a este mismo contacto. '
  'NULL hasta Fase 2 backfill. '
  'Flujo de insercion: INSERT wa_contacts (NULL) -> INSERT wa_contact_jids -> '
  'UPDATE wa_contacts SET preferred_identity_id (dentro de la misma txn).';
COMMENT ON CONSTRAINT uq_wa_contacts_id_sesion ON wa_contacts IS
  'Expone (id, numero_sesion) como target de FK compuesta '
  'para que wa_contact_jids garantice coherencia de sesion.';

-- ----------------------------------------------------------------
-- 2. TABLA wa_contact_jids
-- ----------------------------------------------------------------
CREATE TABLE wa_contact_jids (
  id            bigserial    PRIMARY KEY,
  contact_id    bigint       NOT NULL,
  numero_sesion text         NOT NULL,
  jid           text         NOT NULL,
  jid_type      text         NOT NULL
                CHECK (jid_type IN ('phone', 'lid')),
  trust_level   text         NOT NULL DEFAULT 'unverified'
                CHECK (trust_level IN ('unverified', 'inferred', 'confirmed', 'conflict')),
  source        text         NOT NULL
                CHECK (source IN (
                  'contacts_upsert',
                  'messages_upsert',
                  'fetch_status',
                  'manual',
                  'backfill',
                  'dual_write'
                )),
  created_at    timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT uq_wa_cjids_sesion_jid
    UNIQUE (numero_sesion, jid),

  CONSTRAINT uq_wa_cjids_id_contact
    UNIQUE (id, contact_id),

  CONSTRAINT fk_wa_cjids_contact_sesion
    FOREIGN KEY (contact_id, numero_sesion)
    REFERENCES wa_contacts (id, numero_sesion)
    ON DELETE CASCADE
);

COMMENT ON TABLE  wa_contact_jids IS
  'JIDs (phone o lid) vinculados a un wa_contact. '
  'FK compuesta garantiza coherencia de sesion. '
  'trust_level y source son propiedades del alias, no del contacto global.';
COMMENT ON CONSTRAINT uq_wa_cjids_id_contact ON wa_contact_jids IS
  'Trivialmente unica (id es PK), pero necesaria como target explícito '
  'de FK compuesta desde wa_contacts(preferred_identity_id, id).';
COMMENT ON CONSTRAINT fk_wa_cjids_contact_sesion ON wa_contact_jids IS
  'FK compuesta (contact_id, numero_sesion) -> (id, numero_sesion). '
  'Impide asignar un JID a un contacto de sesion distinta.';
COMMENT ON COLUMN wa_contact_jids.source IS
  'Sin DEFAULT: el codigo que inserta debe declarar el origen. '
  'contacts_upsert | messages_upsert | fetch_status | manual | backfill | dual_write';

-- ----------------------------------------------------------------
-- 3. FK CIRCULAR — preferred_identity_id compuesta y DEFERRABLE
-- ----------------------------------------------------------------
ALTER TABLE wa_contacts
  ADD CONSTRAINT fk_wa_contacts_preferred_identity
    FOREIGN KEY (preferred_identity_id, id)
    REFERENCES wa_contact_jids (id, contact_id)
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON CONSTRAINT fk_wa_contacts_preferred_identity ON wa_contacts IS
  'FK compuesta (preferred_identity_id, id) -> wa_contact_jids(id, contact_id). '
  'Garantiza que el JID preferido pertenece a este mismo contacto. '
  'DEFERRABLE INITIALLY DEFERRED: check en COMMIT, no en cada statement.';

-- ----------------------------------------------------------------
-- 4. COLUMNAS nuevas en mensajes_wa (nullable)
-- ----------------------------------------------------------------
ALTER TABLE mensajes_wa
  ADD COLUMN IF NOT EXISTS contact_id   bigint REFERENCES wa_contacts(id),
  ADD COLUMN IF NOT EXISTS original_jid text;

COMMENT ON COLUMN mensajes_wa.contact_id IS
  'FK -> wa_contacts(id). NULL hasta backfill Fase 2. '
  'Sin CASCADE: mensajes historicos no se tocan si se borra un wa_contact.';
COMMENT ON COLUMN mensajes_wa.original_jid IS
  'JID exacto tal como llego de WA, antes de resolucion lid->phone. '
  'Inmutable una vez persistido (trigger trg_mensajes_wa_original_jid_immutable).';

-- ----------------------------------------------------------------
-- 5. COLUMNA nueva en asignaciones_wa (nullable)
-- ----------------------------------------------------------------
ALTER TABLE asignaciones_wa
  ADD COLUMN IF NOT EXISTS contact_id bigint REFERENCES wa_contacts(id);

COMMENT ON COLUMN asignaciones_wa.contact_id IS
  'FK -> wa_contacts(id). NULL hasta backfill Fase 2.';

-- ----------------------------------------------------------------
-- 6. ÍNDICES
-- ----------------------------------------------------------------
CREATE INDEX idx_wa_contacts_sesion
  ON wa_contacts (numero_sesion);

CREATE INDEX idx_wa_contacts_preferred
  ON wa_contacts (preferred_identity_id)
  WHERE preferred_identity_id IS NOT NULL;

CREATE INDEX idx_wa_cjids_contact_id
  ON wa_contact_jids (contact_id);

CREATE INDEX idx_wa_cjids_jid
  ON wa_contact_jids (jid);

CREATE INDEX idx_wa_cjids_sesion_type
  ON wa_contact_jids (numero_sesion, jid_type);

CREATE INDEX idx_wa_cjids_trust
  ON wa_contact_jids (trust_level);

CREATE INDEX idx_mensajes_wa_contact_id
  ON mensajes_wa (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_asignaciones_contact_id
  ON asignaciones_wa (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE UNIQUE INDEX idx_asignaciones_unique_active_contact
  ON asignaciones_wa (numero, contact_id)
  WHERE activo = true AND contact_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 7. TRIGGER — updated_at en wa_contacts
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_wa_contacts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wa_contacts_updated_at
  BEFORE UPDATE ON wa_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_wa_contacts_set_updated_at();

-- ----------------------------------------------------------------
-- 8. TRIGGER — original_jid inmutable
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_original_jid_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'original_jid es inmutable una vez persistido '
    '(mensajes_wa.id=%, valor actual=%, valor intentado=%)',
    OLD.id, OLD.original_jid, NEW.original_jid;
END;
$$;

CREATE TRIGGER trg_mensajes_wa_original_jid_immutable
  BEFORE UPDATE ON mensajes_wa
  FOR EACH ROW
  WHEN (OLD.original_jid IS NOT NULL
        AND NEW.original_jid IS DISTINCT FROM OLD.original_jid)
  EXECUTE FUNCTION fn_original_jid_immutable();

COMMIT;
