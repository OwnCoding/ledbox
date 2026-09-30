-- Imagen del ítem de inventario (issue #86): los equipos del catálogo de la
-- landing llevan su imagen para reconocerlos de un vistazo en el panel.
--
-- Aditiva, idempotente y re-ejecutable: la columna se agrega con IF NOT EXISTS y
-- la provisión de arranque inserta con ids estables y `ON CONFLICT DO NOTHING`,
-- así correrla dos veces no duplica nada ni pisa lo que el equipo haya editado.
--
-- Solo se cargan los 7 productos del catálogo de la landing (P·01…P·07) para la
-- empresa LedBox (`org_ledbox`), con `sku` = código, tipo reutilizable y cantidad
-- 1. Los costos internos (`replacementCost`/`dailyCost`) quedan en 0: el precio
-- de alquiler de la landing no se copia.
--
-- Misma lista que `LEDBOX_INVENTORY_CATALOG` en `lib/server/inventory-catalog.ts`
-- (y el seed): si el catálogo cambia, actualizá las tres.

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

INSERT INTO "InventoryItem"
  ("id", "organizationId", "name", "category", "sku", "kind", "quantity", "replacementCost", "dailyCost", "notes", "imageUrl", "createdAt", "updatedAt")
SELECT
  seed."id",
  o."id",
  seed."name",
  seed."category",
  seed."code",
  'REUSABLE',
  1,
  0,
  0,
  seed."notes",
  seed."image",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (
  VALUES
    (
      'org_ledbox_inv_pantalla-led',
      'P·01',
      'Pantallas LED',
      'Pantallas LED',
      'Panel modular para escenarios, ferias y activaciones. 0,50 × 1,00 m por módulo · P1.85',
      '/assets/products/pantalla-led.png'
    ),
    (
      'org_ledbox_inv_totem-led',
      'P·02',
      'Tótem LED',
      'Tótems',
      'Impacto vertical para accesos, stands y experiencias de marca. 0,64 × 1,90 m · 320 × 960 px · 2.500 nits',
      '/assets/products/totem-led.png'
    ),
    (
      'org_ledbox_inv_totem-touch',
      'P·03',
      'Tótem Touch',
      'Tótems',
      'Interacción digital para contenidos, registros y activaciones. Pantalla 0,60 × 1,85 m · LCD 43” · 1.080 × 1.920 px',
      '/assets/products/totem-touch.png'
    ),
    (
      'org_ledbox_inv_kiosko-touch',
      'P·04',
      'Kiosko Touch',
      'Kioskos',
      'Punto interactivo móvil para ferias y exhibiciones. Pantalla vertical · base circular · batería 4–6 h',
      '/assets/products/kiosko-touch.png'
    ),
    (
      'org_ledbox_inv_pantalla-multimedia',
      'P·05',
      'Pantalla Multimedia',
      'Pantallas LED',
      'Display inteligente para recepción, contenido y señalización. 21,5” · Full HD · Android 12 · batería 4–6 h',
      '/assets/products/pantalla-multimedia.png'
    ),
    (
      'org_ledbox_inv_cilindro-led',
      'P·06',
      'Cilindro LED',
      'Cilindros',
      'Formato inmersivo suspendido para espacios que buscan diferenciarse. 0,32 m alto × 0,65 m diámetro · P1.85',
      '/assets/products/cilindro-led.png'
    ),
    (
      'org_ledbox_inv_dispensador-inteligente',
      'P·07',
      'Dispensador Inteligente',
      'Activaciones',
      'Experiencia automatizada para bebidas y puntos de atención. Medida a confirmar · consultar disponibilidad',
      '/assets/products/dispensador-inteligente.png'
    )
) AS seed("id", "code", "name", "category", "notes", "image")
WHERE o."id" = 'org_ledbox'
ON CONFLICT DO NOTHING;
