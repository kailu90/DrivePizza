-- ============================================================
-- Módulo Financiero — Entregas de efectivo
-- Tabla: caja_entregas_efectivo
-- Registra las entregas físicas de dinero sede → planta
-- ============================================================

CREATE TABLE IF NOT EXISTS caja_entregas_efectivo (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sede            text        NOT NULL,
    fecha           date        NOT NULL,
    monto           integer     NOT NULL CHECK (monto > 0),
    metodo          text        NOT NULL DEFAULT 'efectivo'
                                CHECK (metodo IN ('efectivo', 'transferencia')),
    concepto        text        NOT NULL DEFAULT 'Entrega de efectivo',
    comprobante     text,
    notas           text,
    usuario         text        NOT NULL,

    -- Conciliación
    conciliado      boolean     NOT NULL DEFAULT false,
    movimiento_id   bigint      REFERENCES caja_movimientos(id) ON DELETE SET NULL,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entregas_updated_at ON caja_entregas_efectivo;
CREATE TRIGGER trg_entregas_updated_at
    BEFORE UPDATE ON caja_entregas_efectivo
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_entregas_sede_fecha
    ON caja_entregas_efectivo (sede, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_conciliado
    ON caja_entregas_efectivo (conciliado)
    WHERE conciliado = false;

CREATE INDEX IF NOT EXISTS idx_entregas_movimiento
    ON caja_entregas_efectivo (movimiento_id)
    WHERE movimiento_id IS NOT NULL;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE caja_entregas_efectivo ENABLE ROW LEVEL SECURITY;

-- planta, planta-admin y admin ven todo
CREATE POLICY "planta lee entregas"
    ON caja_entregas_efectivo FOR SELECT
    USING (
        (SELECT rol FROM usuarios WHERE id = auth.uid())
        IN ('planta', 'planta-admin', 'admin')
    );

CREATE POLICY "planta escribe entregas"
    ON caja_entregas_efectivo FOR INSERT
    WITH CHECK (
        (SELECT rol FROM usuarios WHERE id = auth.uid())
        IN ('planta', 'planta-admin', 'admin')
    );

CREATE POLICY "planta actualiza entregas"
    ON caja_entregas_efectivo FOR UPDATE
    USING (
        (SELECT rol FROM usuarios WHERE id = auth.uid())
        IN ('planta', 'planta-admin', 'admin')
    );

CREATE POLICY "planta-admin elimina entregas"
    ON caja_entregas_efectivo FOR DELETE
    USING (
        (SELECT rol FROM usuarios WHERE id = auth.uid())
        IN ('planta-admin', 'admin')
    );
