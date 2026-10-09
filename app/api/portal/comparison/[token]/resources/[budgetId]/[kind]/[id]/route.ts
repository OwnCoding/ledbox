import { db } from "@/lib/server/db";
import { normalizeBudgetCode } from "@/lib/public-config";
import { findPublicComparison } from "@/lib/server/quote-comparison";
import { quotePdfValid } from "@/lib/server/pdf-validation";
import { budgetAttachmentFileName } from "@/lib/admin-types";
import { detectInventoryImageMime } from "@/lib/admin-types";
import { jsonError } from "@/lib/server/http";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ token: string; budgetId: string; kind: string; id: string }> }) {
  const limit = await rateLimit(`comparison:resource:${getClientIp(request)}`, 90);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const { token, budgetId, kind, id } = await params;
  const code = normalizeBudgetCode(token);
  const group = code ? await findPublicComparison(code) : null;
  if (!group || !group.budgets.some((q) => q.id === budgetId)) return jsonError("Recurso no encontrado.", 404);
  const headers: Record<string, string> = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  if (kind === "pdf") {
    const file = await db.budgetAttachment.findFirst({ where: { id, budgetId, organizationId: group.organizationId, clientVisible: true, mime: "application/pdf" }, select: { name: true, data: true, mime: true } });
    if (!file || !await quotePdfValid(file.data)) return jsonError("Recurso no encontrado.", 404);
    headers["Content-Type"] = file.mime;
    headers["Content-Disposition"] = `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${budgetAttachmentFileName(file.name, file.mime, "presupuesto")}"`;
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'; frame-ancestors 'self'";
    return new Response(new Uint8Array(file.data), { headers });
  }
  if (kind === "image") {
    const item = await db.budgetItem.findFirst({ where: { id, budgetId }, select: { inventory: { select: { organizationId: true, imageData: true, imageMime: true } } } });
    const photo = item?.inventory;
    if (!photo || photo.organizationId !== group.organizationId || !photo.imageData || !photo.imageMime || detectInventoryImageMime(photo.imageData) !== photo.imageMime) return jsonError("Recurso no encontrado.", 404);
    headers["Content-Type"] = photo.imageMime;
    return new Response(new Uint8Array(photo.imageData), { headers });
  }
  return jsonError("Recurso no encontrado.", 404);
}
