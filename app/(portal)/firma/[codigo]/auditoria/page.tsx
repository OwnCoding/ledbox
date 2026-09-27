import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/admin-format";
import { loadSignatureImage, loadSignaturePortal } from "@/lib/server/signature/portal";
import { PortalPrintBar } from "../../../_components/PortalPrintBar";
import { SignatureSealBlock } from "../../../_components/SignatureSealBlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Auditoría de firma", robots: { index: false, follow: false } };

const EVIDENCE_STATUS: Record<string, string> = {
  PENDING: "Pendiente",
  OPTIONAL: "Opcional",
  COMPLETED: "Completa",
  FAILED: "Falló",
};

/**
 * Auditoría imprimible del portal de firma (issue #79): emisor, destinatario
 * (enmascarado), código, identificador, huellas, evidencias y el histórico
 * ordenado con el hash encadenado de cada evento. Es la hoja de «Descargar
 * auditoría» (el navegador la guarda como PDF).
 */
export default async function FirmaAuditoriaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const request = await loadSignaturePortal(codigo);
  if (!request) notFound();
  const image = await loadSignatureImage(codigo);

  return (
    <div className="portal-signature-print">
      <PortalPrintBar backHref={`/firma/${encodeURIComponent(request.code)}`} label="Imprimir o guardar la auditoría" />

      <header className="portal-signature-print-head">
        <p className="portal-kicker">{request.organizationName} · Auditoría de firma</p>
        <h1 className="portal-budget-title">Auditoría · {request.title}</h1>
        <p className="portal-budget-meta">
          Código {request.code} · {request.timeline.length} evento{request.timeline.length === 1 ? "" : "s"} ·{" "}
          {request.chain.valid ? "cadena verificada" : "cadena con problemas"}
        </p>
      </header>

      <SignatureSealBlock request={request} image={image} />

      <section className="portal-card" aria-label="Evidencias de firma">
        <h2 className="portal-card-title">Evidencias de firma</h2>
        <div className="portal-table-wrap">
          <table className="portal-table portal-table--audit">
            <thead>
              <tr>
                <th scope="col">Evidencia</th>
                <th scope="col">Estado</th>
                <th scope="col">Referencia</th>
                <th scope="col">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {request.evidence.map((item) => (
                <tr key={item.type}>
                  <td data-label="Evidencia">{item.label}</td>
                  <td data-label="Estado">{EVIDENCE_STATUS[item.status] ?? item.status}</td>
                  <td data-label="Referencia">{item.reference ?? "—"}</td>
                  <td data-label="Fecha">{item.capturedAt ? formatDateTime(item.capturedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="portal-card" aria-label="Historial del proceso">
        <h2 className="portal-card-title">Historial del proceso</h2>
        <ol className="portal-timeline portal-signature-audit-timeline">
          {request.timeline.map((entry) => (
            <li className="portal-timeline-step" key={entry.id} data-tone={entry.tone}>
              <span className="portal-timeline-when">{formatDateTime(entry.at)}</span>
              <span className="portal-timeline-body">
                <strong>
                  {entry.label}
                  {entry.actor ? <span className="portal-timeline-actor"> · {entry.actor}</span> : null}
                </strong>
                {entry.detail ? <small>{entry.detail}</small> : null}
                <small className="portal-timeline-kind portal-signature-hash">hash {entry.hash}</small>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="portal-help">
        Documento generado por el portal de firma de {request.organizationName}. La cadena de auditoría es append-only:
        cada evento incluye el hash del anterior y verificar el conjunto detecta cualquier alteración.
      </p>
    </div>
  );
}
