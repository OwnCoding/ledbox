import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import { requireAdminContext } from "@/lib/server/tenancy";
import { recordAudit } from "@/lib/server/audit";
import { jsonError, readJson } from "@/lib/server/http";
import { quoteReferenceUrl } from "@/lib/quote-sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  const auth = await requireAdminContext("budgets.write");
  if (!auth.ok) return auth.response;
  const { organizationId } = auth.context;
  let parsed: unknown;
  try { parsed = await readJson(request); } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError("La referencia no es válida.", 400);
  const body = parsed as Record<string, unknown>;
  const budgetId = typeof body.budgetId === "string" ? body.budgetId : "";
  const budget = await db.budget.findFirst({ where: { id: budgetId, organizationId }, select: { id: true } });
  if (!budget) return jsonError("Presupuesto no encontrado.", 404);
  if (body.clientVisible !== undefined && typeof body.clientVisible !== "boolean") return jsonError("La visibilidad no es válida.", 400);
  const where = { id: typeof body.id === "string" ? body.id : "", budgetId, organizationId };
  if (method === "DELETE") {
    const removed = await db.budgetReferenceLink.deleteMany({ where });
    if (!removed.count) return jsonError("Referencia no encontrada.", 404);
  } else if (method === "PATCH") {
    if (typeof body.clientVisible !== "boolean") return jsonError("Indicá la visibilidad.", 400);
    const updated = await db.budgetReferenceLink.updateMany({ where, data: { clientVisible: body.clientVisible } });
    if (!updated.count) return jsonError("Referencia no encontrada.", 404);
  } else {
    const url = quoteReferenceUrl(body.url);
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!url || !label || label.length > 120) return jsonError("Ingresá un título (hasta 120 caracteres) y un enlace http o https válido, sin credenciales.", 400);
    const reference = await db.budgetReferenceLink.create({ data: { id: randomUUID(), organizationId, budgetId, label, url, clientVisible: body.clientVisible === true } });
    await recordAudit({ context: auth.context, action: "update", entity: "Budget", entityId: budgetId, summary: "Agregó una referencia al presupuesto", detail: { fields: { referenceId: reference.id, clientVisible: reference.clientVisible } } });
    return Response.json({ reference }, { status: 201 });
  }
  await recordAudit({ context: auth.context, action: "update", entity: "Budget", entityId: budgetId, summary: method === "DELETE" ? "Quitó una referencia del presupuesto" : "Cambió la visibilidad de una referencia", detail: { fields: { referenceId: where.id, clientVisible: body.clientVisible } } });
  return Response.json({ ok: true });
}

export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
