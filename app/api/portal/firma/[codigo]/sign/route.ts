import { readJson } from "@/lib/server/http";
import { signSignatureRequest, signatureClientEvidence, signatureJsonError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/portal/firma/[codigo]/sign` (issue #79): firma del cliente.
 * Body: `{ consent: true, signature: { dataUrl } | { name } }`.
 *
 * Valida código, vencimiento, estado y método; verifica el OTP si la solicitud
 * lo pide; llama al `SignatureProvider`; y guarda en una transacción el estado,
 * las evidencias y la cadena de auditoría. Rate limit por código y por IP.
 */
export async function POST(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const body = await readJson(request);
  try {
    const signature = await signSignatureRequest({
      code: codigo,
      evidence: signatureClientEvidence(request.headers),
      body,
    });
    return Response.json({ signature });
  } catch (error) {
    return signatureJsonError(error);
  }
}
