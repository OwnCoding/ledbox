"use client";

import { formatDateTime } from "@/lib/admin-format";
import type { AdminSignatureEventRow } from "@/lib/admin-types";
import { signatureEventLabel, signatureEventTone } from "@/lib/server/signature/rules";
import { AdminNote } from "./AdminUI";

/**
 * Cronología de auditoría de una solicitud de firma (issue #79, extraída para
 * el listado del #81): una fila por evento con su fecha, actor, detalle, tipo y
 * el hash encadenado. Fuente única para el diálogo de la ficha del presupuesto
 * y la sección «Firmas»; el tono real lo resuelve `signatureEventTone`.
 */
export function SignatureTimeline({
  events,
  chainValid,
  documentHash,
  signedDocumentHash,
  identifier,
  signedAt,
}: {
  events: AdminSignatureEventRow[];
  chainValid: boolean;
  documentHash: string;
  signedDocumentHash: string | null;
  /** Identificador de firma (solo cuando la solicitud se firmó). */
  identifier?: string | null;
  signedAt?: string | null;
}) {
  return (
    <div className="admin-signature-timeline">
      {!chainValid ? (
        <AdminNote tone="error">La cadena de auditoría no verifica: hay un evento alterado o fuera de orden.</AdminNote>
      ) : null}
      {identifier ? (
        <p className="admin-signature-detail">
          Identificador de firma: <strong>{identifier}</strong>
          {signedAt ? ` · ${formatDateTime(signedAt)}` : ""}
        </p>
      ) : null}
      <ol className="admin-timeline">
        {events.map((event) => (
          <li className="admin-timeline-step" key={event.id} data-tone={signatureEventTone(event.type)}>
            <span className="admin-timeline-when">{formatDateTime(event.at)}</span>
            <span className="admin-timeline-body">
              <strong>
                {event.label}
                {event.actor ? <span className="admin-timeline-actor"> · {event.actor}</span> : null}
              </strong>
              {event.detail ? <small>{event.detail}</small> : null}
              <small className="admin-timeline-meta" title={event.hash}>
                {signatureEventLabel(event.type)} · hash {event.hash.slice(0, 12)}…
              </small>
            </span>
          </li>
        ))}
      </ol>
      <p className="admin-signature-hash" title={documentHash}>
        Huella del documento: {documentHash.slice(0, 16)}…
        {signedDocumentHash ? ` · firmada: ${signedDocumentHash.slice(0, 16)}…` : ""}
      </p>
    </div>
  );
}
