import { loadPublicComparison } from "@/lib/server/quote-comparison-view";
import { jsonError } from "@/lib/server/http";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`comparison:read:${getClientIp(request)}`, 60);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  const group = await loadPublicComparison((await params).token);
  return group ? Response.json({ comparison: group }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }) : jsonError("Comparación no encontrada o vencida.", 404);
}
