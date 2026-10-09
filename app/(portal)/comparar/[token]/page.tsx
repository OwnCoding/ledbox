import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicComparison } from "@/lib/server/quote-comparison-view";
import { PortalComparisonView } from "../../_components/PortalComparisonView";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comparación de presupuestos", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ComparisonPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const group = await loadPublicComparison(token);
  if (!group) notFound();
  return <PortalComparisonView initial={group} token={token} />;
}
