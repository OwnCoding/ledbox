import { requireAdminContext } from "@/lib/server/tenancy";
import { db } from "@/lib/server/db";
import { PAYMENT_METHODS, TERM_PAYMENT_METHODS } from "@/lib/admin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contrato de métodos y cuentas para registrar cobros (issue #129).
 *
 * Una sola respuesta —métodos canónicos y cuentas activas de tesorería con
 * banco, número y alias— para que el panel y la carga con IA (#128) elijan
 * exactamente las mismas opciones, sin listas paralelas. La sesión del panel o
 * una API key de servicio entran por el mismo guard (`requireAdminContext`).
 */
export async function GET() {
  const auth = await requireAdminContext();
  if (!auth.ok) return auth.response;
  const accounts = await db.treasuryAccount.findMany({
    where: { organizationId: auth.context.organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, bank: true, number: true, alias: true, currency: true },
  });
  return Response.json({
    methods: PAYMENT_METHODS,
    termMethods: TERM_PAYMENT_METHODS,
    accounts,
  });
}
