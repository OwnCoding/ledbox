import { requireAdminContext } from "@/lib/server/tenancy";
import { jsonError } from "@/lib/server/http";
import { resendSignatureRequest } from "@/lib/server/signature/admin";
import { SignatureActionError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/signatures/[id]/resend` (issue #79): reenvía el correo de la
 * solicitud activa (mismo link y código). Requiere `budgets.write`; el intento
 * queda en `MailLog`, en la auditoría y como evento de la cadena.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminContext("budgets.write");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const mail = await resendSignatureRequest(auth.context, id);
    return Response.json({ mail });
  } catch (error) {
    if (error instanceof SignatureActionError) return jsonError(error.message, error.status);
    throw error;
  }
}
