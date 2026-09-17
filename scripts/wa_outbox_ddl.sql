-- ============================================================
-- wa_outbox — cola persistente de mensajes salientes
-- Idempotente: seguro de ejecutar más de una vez.
-- Ejecutar en Supabase: docker exec supabase-db psql -U postgres -d postgres -f <ruta>
-- ============================================================

-- ── 1. Tabla principal ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_outbox (
  id               bigserial     PRIMARY KEY,
  numero           text          NOT NULL,
  contacto         text          NOT NULL,
  tipo             text          NOT NULL DEFAULT 'texto',
                   -- 'texto' | 'imagen' | 'audio' | 'voz' | 'video' | 'documento'
  texto            text,
  asesor           text,
  quoted_msg_id    text,
  quoted_texto     text,
  quoted_from_me   boolean,
  -- refs de Storage (solo para media; NULL para tipo='texto')
  storage_path     text,
  storage_url      text,
  mime             text,
  filename         text,
  filesize         int,
  -- idempotencia: evita duplicar si el HTTP response se pierde y el frontend reintenta
  -- NULL es permitido; múltiples NULLs no colisionan (SQL UNIQUE no trata NULL = NULL)
  idempotency_key  text          UNIQUE,
  -- estado del ciclo de vida
  outbox_status    text          NOT NULL DEFAULT 'pending'
                   CHECK (outbox_status IN ('pending','sending','sent','failed')),
  wa_msg_id        text,         -- msgId de Baileys una vez que sendMessage() retorna
  intentos         smallint      NOT NULL DEFAULT 0,
  ultimo_intento   timestamptz,
  error            text,
  mensaje_id       bigint,       -- FK a mensajes_wa(id), enlazado tras insertar mensajes_wa
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

-- ── 2. Columna outbox_id en mensajes_wa ────────────────────
-- Permite al frontend correlacionar la burbuja ⏳ con wa:outbox_sent
-- incluso tras un page refresh (cargado por GET /wa/mensajes).
-- NULL en todas las filas legacy: inserts anteriores no se ven afectados.
ALTER TABLE mensajes_wa ADD COLUMN IF NOT EXISTS outbox_id bigint;

-- ── 3. Índices ──────────────────────────────────────────────
-- Drain rápido: solo filas pendientes/sending del número
CREATE INDEX IF NOT EXISTS idx_wa_outbox_pending
  ON wa_outbox(numero, created_at)
  WHERE outbox_status IN ('pending', 'sending');

-- Correlación outbox_id → mensaje en GET /wa/mensajes
CREATE INDEX IF NOT EXISTS idx_mensajes_wa_outbox_id
  ON mensajes_wa(outbox_id)
  WHERE outbox_id IS NOT NULL;

-- ── 4. Foreign Keys ─────────────────────────────────────────
-- PostgreSQL no admite ADD CONSTRAINT IF NOT EXISTS.
-- Usamos bloques DO para idempotencia.
--
-- Vínculo bidireccional seguro:
--   wa_outbox.mensaje_id  → mensajes_wa(id)  ON DELETE SET NULL
--   mensajes_wa.outbox_id → wa_outbox(id)    ON DELETE SET NULL
--
-- La dependencia circular se resuelve por la secuencia de inserción:
--   1. INSERT wa_outbox (mensaje_id=NULL)
--   2. INSERT mensajes_wa (outbox_id=X) — X ya existe → FK OK
--   3. UPDATE wa_outbox SET mensaje_id=Y — Y ya existe → FK OK

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_wa_outbox_mensaje_id'
  ) THEN
    ALTER TABLE wa_outbox
      ADD CONSTRAINT fk_wa_outbox_mensaje_id
      FOREIGN KEY (mensaje_id) REFERENCES mensajes_wa(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mensajes_wa_outbox_id'
  ) THEN
    ALTER TABLE mensajes_wa
      ADD CONSTRAINT fk_mensajes_wa_outbox_id
      FOREIGN KEY (outbox_id) REFERENCES wa_outbox(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 5. Hybrid A+B — idempotencia de reintento post-crash ─────────────────
-- pre_send_msg_id: generado y persistido ANTES de llamar sendMessage().
--   En recovery, se reutiliza el mismo ID → WA deduplica si llegó dos veces.
-- delivery_uncertain: true cuando no se pudo determinar si sendMessage()
--   llegó a ejecutarse. Detiene reintentos automáticos.
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS pre_send_msg_id   text;
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS delivery_uncertain boolean NOT NULL DEFAULT false;

-- ── 6. Trigger updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_wa_outbox_updated_at ON wa_outbox;
CREATE TRIGGER trg_wa_outbox_updated_at
  BEFORE UPDATE ON wa_outbox
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
