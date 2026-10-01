-- «Visible en la web» del ítem de inventario (issue #111): el dueño decide qué
-- aparece en el catálogo público.
--
-- Aditiva, idempotente y re-ejecutable: la columna se agrega con IF NOT EXISTS y
-- nace en `false` — nada se publica solo, ni los ítems que ya existían. La
-- landing es estática hoy: el flag queda listo para el catálogo dinámico.

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "visibleOnWeb" BOOLEAN NOT NULL DEFAULT false;
