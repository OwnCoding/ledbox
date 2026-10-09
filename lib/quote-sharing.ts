import { todayDayKey } from "./admin-format";

/** References are links only. Never fetch or embed their remote content. */
export function quoteReferenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 2000 || /[\s\u0000-\u001f\u007f\\]/.test(text)) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Token reads stop on closed quotes. Expired, unapproved offers must be renewed. */
export function quotePortalAvailable(budget: { status: string; validUntil: Date | null; approvedAt: Date | null }, now = new Date()): boolean {
  if (budget.status === "LOST" || budget.status === "CANCELLED") return false;
  if (budget.approvedAt || !budget.validUntil) return true;
  return todayDayKey(budget.validUntil) >= todayDayKey(now);
}

/** Default final-customer daily price, copied only on explicit selection. */
export function quoteProductPrice(product: { listPrice?: number; listFromDays?: number; listFromPrice?: number }, days: number): number {
  return product.listFromDays && days >= product.listFromDays && product.listFromPrice ? product.listFromPrice : product.listPrice ?? 0;
}

/** Same day boundary as the server portal, including after UTC midnight. */
export function quoteComparisonEligible(quote: { comparisonId?: string | null; approvedAt?: string | null; validUntil: string | null; status: string }, now = new Date()): boolean {
  return !quote.comparisonId && !quote.approvedAt && quote.status !== "APPROVED" && quotePortalAvailable({ status: quote.status, approvedAt: null, validUntil: quote.validUntil ? new Date(quote.validUntil) : null }, now);
}
