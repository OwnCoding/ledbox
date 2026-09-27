import { jsonError } from "@/lib/server/http";
import { runDailyPaymentReminders } from "@/lib/server/reminders";
import { runDailySignatureReminders } from "@/lib/server/signature/reminders";
import { requireAdminContext } from "@/lib/server/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/admin/reminders/run` (issue #19): fuerza la corrida diaria de
 * recordatorios de la empresa activa sin esperar al primer uso del panel.
 *
 * Corre los dos frentes de recordatorios: cobros a plazo y pagos esperados
 * (`result`) y solicitudes de firma por vencer (issue #81, `signatureReminders`).
 * Solo OWNER y ADMIN (el resto responde 403, VIEWER incluido) y las corridas son
 * idempotentes: un cobro recibe como máximo un recordatorio por día y canal, y
 * una solicitud de firma como máximo un correo por día.
 */
export async function POST() {
  const auth = await requireAdminContext();
  if (!auth.ok) return auth.response;
  if (auth.context.role !== "OWNER" && auth.context.role !== "ADMIN") {
    return jsonError("Forbidden", 403);
  }

  const [result, signatureReminders] = await Promise.all([
    runDailyPaymentReminders({
      organizationId: auth.context.organizationId,
      actor: auth.context,
    }),
    runDailySignatureReminders({
      organizationId: auth.context.organizationId,
      actor: auth.context,
    }),
  ]);
  return Response.json({ result, signatureReminders });
}
