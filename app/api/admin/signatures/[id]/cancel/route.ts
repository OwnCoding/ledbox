import { requireAdminContext } from "@/lib/server/tenancy";
import { jsonError, readJson } from "@/lib/server/http";
import { cancelSignatureRequest } from "@/lib/server/signature/admin";
import { SignatureActionError } from "@/lib/server/signature/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/signatures/[id]/cancel` (issue #79): cancela (revoca) una
 * solicitud activa. Desde ese momento el link bloquea la firma y todo intento
 * muestra el copy de cancelada. Requiere `budgets.write` y queda auditado; la
 * cancelación agrega su evento a la cadena append-only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminContext("budgets.write");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = (await readJson(request)) as Record<string, unknown>;
  try {
    const signature = await cancelSignatureRequest(auth.context, id, typeof body.reason === "string" ? body.reason : null);
    return Response.json({ request: signature });
  } catch (error) {
    if (error instanceof SignatureActionError) return jsonError(error.message, error.status);
    throw error;
  }
}
