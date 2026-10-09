import { db } from "./db";
import { findPublicComparison } from "./quote-comparison";
import { portalBudgetView, portalInclude } from "./budget-portal";
import { normalizeBudgetCode } from "../public-config";

export async function loadPublicComparison(token: string) {
  const code = normalizeBudgetCode(token);
  if (!code) return null;
  const group = await findPublicComparison(code);
  if (!group) return null;
  const alternatives = await Promise.all(group.budgets.map(async (member) => {
    const row = await db.budget.findUniqueOrThrow({ where: { id: member.id }, include: portalInclude });
    const view = portalBudgetView(row);
    const resourcePath = `/api/portal/comparison/${encodeURIComponent(code)}/resources/${encodeURIComponent(row.id)}`;
    return {
      id: row.id, label: row.comparisonLabel!, title: view.title, reference: view.reference,
      subtotal: view.subtotal, discount: view.discount, total: view.total,
      validUntil: view.validUntil, deliveryAt: view.deliveryAt, ivaType: view.ivaType,
      warranty: view.warranty, notes: view.notes, paymentTerms: view.paymentPlan.terms,
      advanceAmount: view.paymentPlan.advanceAmount, installments: view.paymentPlan.installments,
      items: view.items.map((item) => {
        const source = row.items.find((i) => i.id === item.id)?.inventory;
        return { ...item, imageUrl: !source || source.organizationId !== group.organizationId ? null : item.imageUrl || (source.imageMime ? `${resourcePath}/image/${encodeURIComponent(item.id)}` : null) };
      }),
      attachments: view.attachments ?? [], referenceLinks: view.referenceLinks ?? [], resourcePath,
    };
  }));
  // Allowlist only: no payment account, technical evidence, costs or internal actors.
  return { title: group.title, expiresAt: group.expiresAt.toISOString(), selectedBudgetId: group.selectedBudgetId, alternatives };
}
export type PublicQuoteComparison = NonNullable<Awaited<ReturnType<typeof loadPublicComparison>>>;
