-- Unidades físicas del inventario (issue #112): cada unidad con su código de
-- inventario único por empresa, su estado y su costo, para saber cuál es cuál.
--
-- Aditiva, idempotente y re-ejecutable: el enum y la tabla usan guardas
-- (duplicate_object / IF NOT EXISTS), y el backfill crea una unidad por unidad
-- activa del ítem (`quantity`) con un guardián por ítem y `ON CONFLICT DO
-- NOTHING`, así correrla de nuevo no duplica nada.
--
-- `quantity` del ítem queda como estaba (el backfill crea todas las unidades
-- AVAILABLE); de ahí en más la mantiene el API como «unidades activas».

DO $$ BEGIN
  CREATE TYPE "InventoryUnitStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'RETIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "InventoryUnit" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inventoryId"    TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "status"         "InventoryUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
  "purchaseCost"   INTEGER NOT NULL DEFAULT 0,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryUnit_organizationId_code_key"
  ON "InventoryUnit"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "InventoryUnit_inventoryId_status_idx"
  ON "InventoryUnit"("inventoryId", "status");

DO $$ BEGIN
  ALTER TABLE "InventoryUnit"
    ADD CONSTRAINT "InventoryUnit_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryUnit"
    ADD CONSTRAINT "InventoryUnit_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill idempotente: una unidad por unidad activa del ítem (`quantity`), con
-- código `PREFIJO-NN` (3 letras del nombre sin acentos) y consecutivo global por
-- prefijo dentro de la empresa —así dos ítems con el mismo prefijo no chocan—.
-- Los ítems que ya tienen unidades no se tocan. Mismo criterio de prefijo que
-- `inventoryUnitPrefix` en `lib/field-rules.ts` (si cambia, actualizá los dos).
INSERT INTO "InventoryUnit" ("id", "organizationId", "inventoryId", "code", "status", "purchaseCost", "createdAt", "updatedAt")
WITH prefixed AS (
  SELECT
    i."id" AS inventory_id,
    i."organizationId" AS organization_id,
    UPPER(LEFT(REGEXP_REPLACE(TRANSLATE(i."name", 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g'), 3)) AS prefix,
    GREATEST(i."quantity", 0) AS units
  FROM "InventoryItem" i
  WHERE NOT EXISTS (SELECT 1 FROM "InventoryUnit" u WHERE u."inventoryId" = i."id")
),
expanded AS (
  SELECT
    p.inventory_id,
    p.organization_id,
    COALESCE(NULLIF(p.prefix, ''), 'UNI') AS prefix,
    g.n
  FROM prefixed p
  CROSS JOIN LATERAL generate_series(1, p.units) AS g(n)
  WHERE p.units > 0
),
numbered AS (
  SELECT
    e.*,
    COALESCE(base.max_seq, 0) + ROW_NUMBER() OVER (PARTITION BY e.organization_id, e.prefix ORDER BY e.inventory_id, e.n) AS seq
  FROM expanded e
  LEFT JOIN (
    SELECT
      "organizationId" AS organization_id,
      split_part("code", '-', 1) AS prefix,
      MAX(NULLIF(regexp_replace(split_part("code", '-', 2), '\D', '', 'g'), '')::int) AS max_seq
    FROM "InventoryUnit"
    GROUP BY 1, 2
  ) base ON base.organization_id = e.organization_id AND base.prefix = e.prefix
)
SELECT
  'unit_' || md5(n.organization_id || ':' || n.prefix || ':' || n.seq::text),
  n.organization_id,
  n.inventory_id,
  n.prefix || '-' || lpad(n.seq::text, 2, '0'),
  'AVAILABLE',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM numbered n
ON CONFLICT DO NOTHING;
