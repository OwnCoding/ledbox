import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { quotePortalAvailable } from "../quote-sharing";

export class QuoteComparisonError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Lock order is quote, then group. Creation locks all candidate quotes in id order.
 * Every approval entry point shares this lock and persistent, irreversible selection.
 */
export async function guardQuoteApproval(tx: Prisma.TransactionClient, budgetId: string, organizationId: string, token?: string, comparisonToken?: string) {
  await tx.$queryRaw`SELECT "id" FROM "Budget" WHERE "id" = ${budgetId} FOR UPDATE`;
  const budget = await tx.budget.findUnique({ where: { id: budgetId } });
  if (!budget || budget.organizationId !== organizationId || (token !== undefined && budget.publicToken !== token)) throw new QuoteComparisonError(404, "Presupuesto no encontrado.");
  if (!budget.comparisonId) return budget;
  await tx.$queryRaw`SELECT "id" FROM "QuoteComparison" WHERE "id" = ${budget.comparisonId} FOR UPDATE`;
  const group = await tx.quoteComparison.findUnique({ where: { id: budget.comparisonId } });
  if (!group || group.organizationId !== organizationId || group.clientId !== budget.clientId) throw new QuoteComparisonError(409, "La comparación no es válida.");
  if (comparisonToken !== undefined && group.publicToken !== comparisonToken) throw new QuoteComparisonError(404, "Comparación no encontrada.");
  if (group.selectedBudgetId && group.selectedBudgetId !== budget.id) throw new QuoteComparisonError(409, "Ya se eligió otra alternativa de esta comparación.");
  if (group.revokedAt || group.expiresAt <= new Date() || !quotePortalAvailable(budget)) throw new QuoteComparisonError(409, "La comparación o el presupuesto ya no están vigentes.");
  if (!group.selectedBudgetId) await tx.quoteComparison.update({ where: { id: group.id }, data: { selectedBudgetId: budget.id, selectedAt: new Date() } });
  return budget;
}

export async function withQuoteApproval<T>(budgetId: string, organizationId: string, write: (tx: Prisma.TransactionClient) => Promise<T>, token?: string): Promise<T> {
  return db.$transaction(async (tx) => {
    await guardQuoteApproval(tx, budgetId, organizationId, token);
    return write(tx);
  });
}

export async function findPublicComparison(token: string) {
  const group = await db.quoteComparison.findUnique({ where: { publicToken: token }, include: { budgets: { orderBy: { comparisonLabel: "asc" } } } });
  if (!group || group.revokedAt || group.expiresAt <= new Date() || group.budgets.length < 2 || group.budgets.length > 4) return null;
  if (group.budgets.some((q) => q.organizationId !== group.organizationId || q.clientId !== group.clientId || !quotePortalAvailable(q))) return null;
  return group;
}

/** Commercial edits and grouped signing serialize on the same quote row.
 * Recheck approval after waiting: an edit that loses the race must not alter
 * the terms that have just been signed. Internal cost-only edits stay allowed.
 */
export async function withQuoteCommercialEdit<T>(budgetId: string, organizationId: string, commercial: boolean, write: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Budget" WHERE "id" = ${budgetId} FOR UPDATE`;
    const budget = await tx.budget.findUnique({ where: { id: budgetId } });
    if (!budget || budget.organizationId !== organizationId) throw new QuoteComparisonError(404, "Presupuesto no encontrado.");
    if (commercial && budget.comparisonId && (budget.approvedAt || budget.status === "APPROVED")) throw new QuoteComparisonError(409, "La alternativa ya está aprobada: sus condiciones no se pueden cambiar.");
    return write(tx);
  });
}
