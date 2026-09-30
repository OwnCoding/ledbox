-- Precios de venta del ítem de inventario (issue #90): lista, mayorista (con su
-- umbral de días) y mínimo, en guaraníes enteros.
--
-- Aditiva, idempotente y re-ejecutable: cada columna se agrega con IF NOT EXISTS
-- y nace en 0 (sin valores de arranque; los carga el dueño desde el panel). No se
-- copian los precios de alquiler de la landing.
--
-- `wholesaleFromDays` = 0 significa sin regla de mayorista; un valor N>0 la
-- aplica «desde N días» (la usan la ficha y, más adelante, los presupuestos).

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "listPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "wholesalePrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "minimumPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "wholesaleFromDays" INTEGER NOT NULL DEFAULT 0;
