import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadSignaturePortal, signatureClientEvidence } from "@/lib/server/signature/portal";
import { SignaturePortalView } from "../../_components/SignaturePortalView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Firma de documentos", robots: { index: false, follow: false } };

/**
 * Portal público de firma (issue #79): `/firma/[codigo]`.
 *
 * Un código inválido no revela nada (404). La primera apertura se sella una
 * sola vez (`VIEWED`) y el vencimiento se aplica acá mismo si corresponde. La
 * empresa demo de solo lectura se marca y no escribe. El documento nunca se
 * publica sin este código; los adjuntos se sirven por
 * `/api/portal/firma/[codigo]/documento` con la misma validación.
 */
export default async function FirmaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const request = await loadSignaturePortal(codigo, {
    sealView: true,
    evidence: signatureClientEvidence(await headers()),
  });
  if (!request) notFound();
  return <SignaturePortalView request={request} />;
}
