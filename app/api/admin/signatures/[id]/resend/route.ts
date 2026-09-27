import { requireAdminContext } from "@/lib/server/tenancy";
import { jsonError } from "@/lib/server/http";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { resendSignatureRequest } from "@/lib/server/signature/admin";
import { SIGNATURE_RESEND_LIMIT_PER_REQUEST, SIGNATURE_RESEND_LIMIT_PER_USER } from "@/lib/server/signature/rules";
import { SignatureActionError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/signatures/[id]/resend` (issue #79, rate limit del #81):
 * envía por correo la solicitud activa (mismo link y código). Requiere
 * `budgets.write`; el intento queda en `MailLog`, en la auditoría y como evento
 * de la cadena. Rate limit por solicitud y por usuario (misma ventana de 15
 * minutos del resto del API) para que un doble clic o un loop no llenen el
 * correo del cliente; un envío fallido no cuenta doble.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminContext("budgets.write");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const limited = await rateLimit(`signature-resend:${id}`, SIGNATURE_RESEND_LIMIT_PER_REQUEST);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const userLimited = await rateLimit(`signature-resend-user:${auth.context.user.id}`, SIGNATURE_RESEND_LIMIT_PER_USER);
  if (!userLimited.allowed) return rateLimitResponse(userLimited.retryAfter);

  try {
    const mail = await resendSignatureRequest(auth.context, id);
    return Response.json({ mail });
  } catch (error) {
    if (error instanceof SignatureActionError) return jsonError(error.message, error.status);
    throw error;
  }
}
