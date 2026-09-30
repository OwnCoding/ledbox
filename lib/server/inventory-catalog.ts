import { products } from "@/lib/catalog";

/**
 * Inventario de arranque de LedBox (issue #86): los 7 productos del catálogo de
 * la landing (P·01…P·07) cargados como ítems reutilizables de `org_ledbox`, con
 * su imagen pública (`/assets/products/…`) y sin costos internos.
 *
 * Es la fuente del seed y de la provisión de la migración
 * `202609300001_inventory_item_image` (misma lista: si el catálogo cambia,
 * actualizá las tres). El precio de alquiler de la landing **no** se copia:
 * `dailyCost` y `replacementCost` quedan en 0 hasta que el dueño los defina.
 */

/** Id estable de un ítem provisionado para una empresa (`<org>_inv_<slug>`). */
export function ledboxInventoryItemId(organizationId: string, slug: string): string {
  return `${organizationId}_inv_${slug}`;
}

export type LedboxInventorySeed = {
  /** Slug del producto en la landing (también su ficha `/productos/<slug>`). */
  slug: string;
  /** Código del producto en la landing (P·01…P·07), guardado como SKU. */
  sku: string;
  name: string;
  category: string;
  kind: "REUSABLE";
  quantity: 1;
  replacementCost: 0;
  dailyCost: 0;
  /** Descripción + especificaciones de la ficha: lo que el operador necesita. */
  notes: string;
  /** Ruta interna del asset del producto (`/assets/products/<archivo>.png`). */
  imageUrl: string;
};

/**
 * Categoría operativa de cada producto: la misma familia que usa el inventario
 * del panel, así los sustitutos se sugieren dentro del mismo grupo de equipos.
 */
const CATEGORY_BY_SLUG: Record<string, string> = {
  "pantalla-led": "Pantallas LED",
  "totem-led": "Tótems",
  "totem-touch": "Tótems",
  "kiosko-touch": "Kioskos",
  "pantalla-multimedia": "Pantallas LED",
  "cilindro-led": "Cilindros",
  "dispensador-inteligente": "Activaciones",
};

/** Los productos del catálogo de la landing como ítems de inventario. */
export const LEDBOX_INVENTORY_CATALOG: readonly LedboxInventorySeed[] = products.map((product) => ({
  slug: product.id,
  sku: product.code,
  name: product.name,
  category: CATEGORY_BY_SLUG[product.id] ?? "General",
  kind: "REUSABLE",
  quantity: 1,
  replacementCost: 0,
  dailyCost: 0,
  notes: `${product.description} ${product.specs}`,
  imageUrl: product.image,
}));
