import { db } from "@/lib/server/db";
import { isInventoryImageMime } from "@/lib/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/inventory-images/[id]` (issue #109): sirve la foto subida de un ítem
 * de inventario. Es **público por UUID no enumerable** (lo consumen el panel y el
 * portal del cliente) e **inmutable**: la URL efectiva lleva `?v=<updatedAt>`, así
 * reemplazar la foto estrena URL y la caché no muestra la vieja.
 *
 * Solo imágenes: el MIME real se detectó por magic bytes al subir y acá se vuelve
 * a exigir que sea uno de los servibles (JPG, PNG o WebP). Sin foto, 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await db.inventoryItem.findUnique({
    where: { id },
    select: { imageData: true, imageMime: true },
  });
  if (!item?.imageData || !isInventoryImageMime(item.imageMime)) {
    return new Response("No encontramos esa imagen.", { status: 404 });
  }
  return new Response(item.imageData, {
    headers: {
      "Content-Type": item.imageMime,
      "Content-Length": String(item.imageData.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
