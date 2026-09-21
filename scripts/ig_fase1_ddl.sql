-- ================================================================
-- IG FASE 1 DDL — channel_accounts
-- Tabla genérica de cuentas de canal omnicanal.
-- Sin CHECK en channel: canales futuros sin migración de esquema.
-- Sin webhook_verify_token: token global en META_WEBHOOK_VERIFY_TOKEN.
-- Idempotente: seguro de ejecutar más de una vez.
-- Ejecutar:
--   docker exec supabase-db psql -U postgres -d postgres < ig_fase1_ddl.sql
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. TABLA channel_accounts
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_accounts (
  id                   BIGSERIAL    PRIMARY KEY,
  channel              TEXT         NOT NULL,
  display_name         TEXT         NOT NULL,
  username             TEXT,                       -- @handle display, NO contrasena
  external_account_id  TEXT,                       -- IGID (NULL hasta OAuth)
  ciudad               TEXT,
  sede_id              TEXT         REFERENCES sedes(id) ON DELETE SET NULL,
  status               TEXT         NOT NULL DEFAULT 'pending'
                         CHECK (status IN
                           ('pending','active','disconnected','error','token_expired')),
  access_token_enc     TEXT,                       -- AES-256-GCM, NULL hasta OAuth
  token_expires_at     TIMESTAMPTZ,               -- NULL hasta OAuth
  metadata             JSONB        NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  channel_accounts IS
  'Cuentas de canal omnicanal (instagram, futuro: otros). '
  'Una fila por cuenta de red social. Canal validado a nivel aplicacion.';
COMMENT ON COLUMN channel_accounts.channel IS
  'Canal: instagram, whatsapp, telegram, etc. '
  'Sin CHECK en BD — extensible sin migracion de esquema.';
COMMENT ON COLUMN channel_accounts.username IS
  'Handle de display (ej: @drivepizzabga). Solo visual. '
  'SIN contrasena. OAuth actualiza/confirma este campo.';
COMMENT ON COLUMN channel_accounts.external_account_id IS
  'ID externo de la plataforma: IGID para Instagram. NULL hasta OAuth.';
COMMENT ON COLUMN channel_accounts.access_token_enc IS
  'Token cifrado AES-256-GCM (nonce||tag||ciphertext en base64). '
  'NULL hasta OAuth. Clave IG_TOKEN_ENCRYPTION_KEY en .env.';

-- ----------------------------------------------------------------
-- 2. UNIQUE INDEX — solo cuando external_account_id NO es NULL
--    Permite multiples cuentas pending (external_account_id=NULL)
-- ----------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_accounts_channel_external
  ON channel_accounts (channel, external_account_id)
  WHERE external_account_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 3. Indices de uso frecuente
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_channel_accounts_channel
  ON channel_accounts (channel);

CREATE INDEX IF NOT EXISTS idx_channel_accounts_status
  ON channel_accounts (status);

-- ----------------------------------------------------------------
-- 4. TRIGGER — updated_at automatico
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_channel_accounts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_accounts_updated_at ON channel_accounts;
CREATE TRIGGER trg_channel_accounts_updated_at
  BEFORE UPDATE ON channel_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_channel_accounts_set_updated_at();

-- ----------------------------------------------------------------
-- 5. PRIMER REGISTRO — Drive Pizza Bucaramanga
--    WHERE NOT EXISTS garantiza idempotencia aunque el indice
--    UNIQUE sea parcial y external_account_id sea NULL.
-- ----------------------------------------------------------------
INSERT INTO channel_accounts (channel, display_name, ciudad, status)
SELECT 'instagram', 'Drive Pizza Bucaramanga', 'bucaramanga', 'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM channel_accounts
  WHERE channel = 'instagram'
    AND display_name = 'Drive Pizza Bucaramanga'
);

COMMIT;
