-- Modelo de precios correcto del inventario (issue #110): cada frente tiene su
-- precio normal y su regla «desde X días».
--
-- Aditiva, idempotente y re-ejecutable: cada columna se agrega con IF NOT EXISTS
-- y nace en 0 (nadie queda con reglas ni precios obligatorios).
--
--  * `listFromDays`  = días desde los que aplica `listFromPrice` (cliente final).
--  * `listFromPrice` = precio final desde esos días.
--  * `wholesaleFromPrice` = precio mayorista desde `wholesaleFromDays`.
--
-- `wholesaleFromDays` ya existía (issue #90) y pasa a ser, sin cambios de
-- columna, el umbral del mayorista; `minimumPrice` sigue como piso de venta.
-- Sin valores de arranque: los carga el dueño desde el panel.

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "listFromDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "listFromPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "wholesaleFromPrice" INTEGER NOT NULL DEFAULT 0;
