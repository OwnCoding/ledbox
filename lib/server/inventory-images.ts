/**
 * Foto subida del ítem de inventario (issue #109). El binario vive en la base
 * (`imageData`/`imageMime`) y se sirve público por su id (UUID no enumerable).
 *
 * El **`imageUrl` efectivo** —lo que consumen el panel y el portal de #107— es
 * la URL manual si existe y, si no, la ruta de la subida con su versión para
 * cortar la caché inmutable (misma mecánica que el avatar y el logo del cliente).
 * Vive acá, en un solo lugar, para que ninguna superficie arme la ruta a mano.
 */

import { inventoryImageValid, normalizeInventoryImage } from "@/lib/field-rules";

/** Ruta pública de la foto subida; `version` corta la caché inmutable. */
export function inventoryImagePath(id: string, version?: string | Date | null): string {
  const value = version instanceof Date ? version.toISOString() : version;
  return `/api/inventory-images/${encodeURIComponent(id)}${value ? `?v=${encodeURIComponent(value)}` : ""}`;
}

/** URL efectiva de la foto del ítem: la manual manda; si no, la subida. */
export function inventoryImageUrl(item: {
  id: string;
  imageUrl: string | null;
  imageMime?: string | null;
  updatedAt?: string | Date | null;
}): string | null {
  if (item.imageUrl) return item.imageUrl;
  if (!item.imageMime) return null;
  return inventoryImagePath(item.id, item.updatedAt ?? null);
}

/**
 * URL manual de la foto tal como llega en el body: recortada y validada (ruta
 * interna `/assets/…` o URL http(s)). Sin valor → `null` (la limpia); con un
 * valor inválido → `false`. La comparten el alta y la edición del ítem.
 */
export function readInventoryImageUrl(raw: unknown): string | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return false;
  const image = normalizeInventoryImage(raw);
  if (!image) return null;
  return inventoryImageValid(image) ? image : false;
}
