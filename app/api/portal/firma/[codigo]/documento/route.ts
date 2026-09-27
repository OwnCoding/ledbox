import { jsonError } from "@/lib/server/http";
import { loadSignatureAttachment, signatureClientEvidence, signatureJsonError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/portal/firma/[codigo]/documento` (issue #79): sirve el adjunto PDF
 * (o imagen) de la solicitud **solo con un código válido** y con rate limit por
 * IP. Sin adjunto (documento = presupuesto imprimible) responde 404: ese
 * documento lo dibuja el portal en HTML.
 */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  try {
    const attachment = await loadSignatureAttachment(codigo, signatureClientEvidence(request.headers));
    if (!attachment) return jsonError("No encontramos ese documento.", 404);
    return new Response(new Uint8Array(attachment.data), {
      status: 200,
      headers: {
        "Content-Type": attachment.mime,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `inline; filename="${attachment.name.replace(/["\\\r\n]/g, "").slice(0, 120)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return signatureJsonError(error);
  }
}
