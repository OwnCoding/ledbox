import { formatDateTime } from "@/lib/admin-format";
import type { PortalSignatureRequest } from "@/lib/server/signature/portal";

/**
 * Constancia de firma imprimible (issue #79): el bloque de cierre que acompaña
 * al documento en la hoja imprimible —partes, estado, método, identificador,
 * huellas del documento (antes y después), sello de tiempo y la firma capturada
 * cuando es dibujada—. Es la misma evidencia que la auditoría, en formato
 * resumido.
 */
export function SignatureSealBlock({ request, image }: { request: PortalSignatureRequest; image: string | null }) {
  return (
    <section className="portal-signature-seal" aria-label="Constancia de firma electrónica">
      <h2 className="portal-signature-seal-title">Constancia de firma electrónica</h2>
      <dl className="portal-facts">
        <div>
          <dt>Documento</dt>
          <dd>{request.title}</dd>
        </div>
        <div>
          <dt>Emisor</dt>
          <dd>
            {request.senderName} · {request.organizationName}
          </dd>
        </div>
        <div>
          <dt>Firmante</dt>
          <dd>
            {request.recipient.name}
            {request.recipient.email ? ` · ${request.recipient.email}` : ""}
          </dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{request.statusLabel}</dd>
        </div>
        <div>
          <dt>Método</dt>
          <dd>{request.methodLabel}</dd>
        </div>
        <div>
          <dt>Creada</dt>
          <dd>{formatDateTime(request.createdAt)}</dd>
        </div>
        <div>
          <dt>Firmada</dt>
          <dd>{request.signedAt ? formatDateTime(request.signedAt) : "Sin firma registrada"}</dd>
        </div>
        <div>
          <dt>Identificador</dt>
          <dd className="portal-signature-code">{request.signatureIdentifier ?? "—"}</dd>
        </div>
        <div>
          <dt>Huella del documento</dt>
          <dd className="portal-signature-hash">{request.documentHash}</dd>
        </div>
        <div>
          <dt>Huella firmada</dt>
          <dd className="portal-signature-hash">{request.signedDocumentHash ?? "—"}</dd>
        </div>
        <div>
          <dt>Cadena de auditoría</dt>
          <dd>{request.chain.valid ? "Verificada" : "Con eventos alterados o fuera de orden"}</dd>
        </div>
      </dl>
      {image ? (
        <div className="portal-signature-seal-image">
          <span className="portal-field-label">Firma</span>
          <img src={image} alt={`Firma de ${request.recipient.name}`} />
        </div>
      ) : null}
      {request.signedAt ? (
        <p className="portal-help">
          Sello de tiempo del servidor de {request.organizationName}: {formatDateTime(request.signedAt)}. La huella firmada
          combina el documento original con este cierre (identificador, método y firmante).
        </p>
      ) : null}
    </section>
  );
}
