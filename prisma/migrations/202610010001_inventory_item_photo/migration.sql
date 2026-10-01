-- Foto subida del ítem de inventario (issue #109): el binario vive en la base y
-- se sirve público por `/api/inventory-images/<id>` (UUID no enumerable), así la
-- foto viaja por el `imageUrl` efectivo que ya consumen el panel y el portal.
--
-- Aditiva, idempotente y re-ejecutable: cada columna se agrega con IF NOT EXISTS
-- y nace nula (nadie queda con foto obligatoria). La URL manual (`imageUrl`) tiene
-- prioridad sobre la subida; `imageMime` guarda el tipo real detectado por magic
-- bytes (image/png, image/jpeg o image/webp) y nunca se sirve otra cosa.

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "imageData" BYTEA;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "imageMime" TEXT;
