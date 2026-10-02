import { jsonError, readJson } from "@/lib/server/http";
import { recordAudit } from "@/lib/server/audit";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireAdminContext } from "@/lib/server/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registro del **lote** aplicado por la Carga con IA (issue #130).
 *
 * Cuando el panel aplica un lote (clientes, eventos, productos y cobros
 * creados), deja acá la constancia agrupada en el `AuditLog`: una fila
 * `IaCarga` con el `lote` y los ids creados, para poder rastrear (y anular)
 * cada carga. Es best-effort: si falla, el panel lo avisa y nada más cambia.
 */

const MAX_TEXTO = 120;
const MAX_FILAS = 120;

type FilaLote = { id: string; etiqueta: string };

/** Normaliza una lista de filas creadas (`{ id, etiqueta }`). */
function filasDe(valor: unknown): FilaLote[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .flatMap((fila) => {
      if (!fila || typeof fila !== "object") return [];
      const registro = fila as Record<string, unknown>;
      const id = typeof registro.id === "string" ? registro.id.trim().slice(0, MAX_TEXTO) : "";
      if (!id) return [];
      return [{ id, etiqueta: typeof registro.etiqueta === "string" ? registro.etiqueta.trim().slice(0, MAX_TEXTO) : "" }];
    })
    .slice(0, MAX_FILAS);
}

export async function POST(request: Request) {
  const auth = await requireAdminContext();
  if (!auth.ok) return auth.response;

  const limited = await rateLimit(`ia-lote:${auth.context.organizationId}`, 30);
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = (await readJson(request)) as Record<string, unknown>;
  const lote = typeof body.lote === "string" ? body.lote.trim().slice(0, MAX_TEXTO) : "";
  if (!lote) return jsonError("Falta el identificador del lote.", 400);

  const creados = body.creados && typeof body.creados === "object" && !Array.isArray(body.creados)
    ? (body.creados as Record<string, unknown>)
    : {};
  const filas = {
    clientes: filasDe(creados.clientes),
    eventos: filasDe(creados.eventos),
    productos: filasDe(creados.productos),
    cobros: filasDe(creados.cobros),
  };
  const total = filas.clientes.length + filas.eventos.length + filas.productos.length + filas.cobros.length;
  if (total === 0) return jsonError("El lote no trae registros creados.", 400);

  await recordAudit({
    context: auth.context,
    action: "create",
    entity: "IaCarga",
    entityId: lote,
    summary: `Aplicó un lote de la Carga con IA (${filas.clientes.length} clientes, ${filas.eventos.length} eventos, ${filas.productos.length} productos, ${filas.cobros.length} cobros)`,
    detail: {
      fields: {
        lote,
        clientes: filas.clientes.map((fila) => fila.id),
        eventos: filas.eventos.map((fila) => fila.id),
        productos: filas.productos.map((fila) => fila.id),
        cobros: filas.cobros.map((fila) => fila.id),
      },
    },
  });

  return Response.json({ ok: true, lote, total });
}
