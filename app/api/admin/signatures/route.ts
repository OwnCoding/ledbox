import { requireAdminContext } from "@/lib/server/tenancy";
import { jsonError, readJson } from "@/lib/server/http";
import { createSignatureRequest, listOrganizationSignatureRequests, listSignatureRequests } from "@/lib/server/signature/admin";
import { SignatureActionError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/signatures` (issues #79 y #81): con `?budgetId=…` devuelve las
 * solicitudes de ese presupuesto (ficha); sin `budgetId` devuelve el listado
 * global de la empresa (sección «Firmas»), con estado real, presupuesto de
 * origen y último correo. Cualquier rol con membresía lee (VIEWER incluido).
 *
 * `POST /api/admin/signatures`: crea la solicitud desde la ficha del
 * presupuesto (documento = imprimible y/o adjunto, destinatario, vencimiento,
 * método y OTP opcional). Requiere `budgets.write`; la creación queda auditada
 * y el correo sale si hay un destinatario con dirección válida.
 */
export async function GET(request: Request) {
  const auth = await requireAdminContext();
  if (!auth.ok) return auth.response;
  const budgetId = new URL(request.url).searchParams.get("budgetId")?.trim() ?? "";
  if (!budgetId) {
    return Response.json({ requests: await listOrganizationSignatureRequests(auth.context) });
  }
  return Response.json({ requests: await listSignatureRequests(auth.context, budgetId) });
}

export async function POST(request: Request) {
  const auth = await requireAdminContext("budgets.write");
  if (!auth.ok) return auth.response;
  const body = (await readJson(request)) as Record<string, unknown>;
  try {
    const result = await createSignatureRequest(auth.context, {
      budgetId: String(body.budgetId ?? ""),
      attachmentId: typeof body.attachmentId === "string" ? body.attachmentId : null,
      title: typeof body.title === "string" ? body.title : null,
      recipientName: String(body.recipientName ?? ""),
      recipientEmail: typeof body.recipientEmail === "string" ? body.recipientEmail : null,
      recipientPhone: typeof body.recipientPhone === "string" ? body.recipientPhone : null,
      method: String(body.method ?? "DRAWN"),
      expiresInDays: Number(body.expiresInDays ?? 15),
      otpRequired: body.otpRequired === true,
      message: typeof body.message === "string" ? body.message : null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SignatureActionError) return jsonError(error.message, error.status);
    throw error;
  }
}
