import { readJson } from "@/lib/server/http";
import { rejectSignatureRequest, signatureClientEvidence, signatureJsonError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/portal/firma/[codigo]/reject` (issue #79): el cliente rechaza la
 * firma con un motivo (mínimo 10 caracteres). Bloquea la firma, deja su evento
 * en la cadena y avisa al equipo en la auditoría y la cronología.
 */
export async function POST(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const body = await readJson(request);
  try {
    const signature = await rejectSignatureRequest({
      code: codigo,
      evidence: signatureClientEvidence(request.headers),
      body,
    });
    return Response.json({ signature });
  } catch (error) {
    return signatureJsonError(error);
  }
}
