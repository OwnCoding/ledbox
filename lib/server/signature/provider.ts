import { randomBytes } from "node:crypto";
import { signedDocumentHash, signatureIdentifierFor } from "./document";
import type { SignatureSubmission } from "./submission";

/**
 * `SignatureProvider`: la frontera desacoplada de la firma (issue #79).
 *
 * La Fase 1 corre con `localSignatureProvider`: la firma dibujada o tipográfica
 * se guarda como evidencia en la base y el sello de tiempo lo pone la app. El
 * día que entre un proveedor externo de confianza (Viafirma u otro), se agrega
 * una implementación de esta interfaz que devuelva su identificador, su sello y
 * su certificado como evidencia externa; el portal, los estados y la cadena de
 * auditoría no cambian.
 *
 * Contrato de una implementación externa (documentado, sin integrar):
 * 1. `sign()` recibe el documento ya sellado (`documentHash`) y el envío del
 *    cliente, y llama a la API del proveedor con credenciales de servidor
 *    (nunca del navegador).
 * 2. Devuelve `identifier`, `signedDocumentHash` del proveedor y las evidencias
 *    (`SIGNATURE`, `TIMESTAMP`, `SEAL`, y `PHOTO`/`OTP` si el proveedor las
 *    aporta) con su `reference`; los binarios externos no se copian si el
 *    proveedor los custodia.
 * 3. Si la API falla, lanza: la transacción de firma no se confirma y la
 *    solicitud queda en `SIGNING`/`PENDING_SIGNATURE` para reintentar.
 */

export type SignatureProviderEvidenceType = "SIGNATURE" | "OTP" | "PHOTO" | "TIMESTAMP" | "SEAL";

export type SignatureProviderEvidence = {
  type: SignatureProviderEvidenceType;
  status: "COMPLETED" | "PENDING";
  storageKey: string;
  mime?: string | null;
  data?: Uint8Array | null;
  size?: number | null;
  reference?: string | null;
  capturedAt: Date;
  metadata?: Record<string, unknown> | null;
};

export type SignatureSignInput = {
  request: {
    id: string;
    title: string;
    method: string;
    documentHash: string;
    recipientName: string;
  };
  signature: SignatureSubmission;
  now: Date;
};

export type SignatureProviderResult = {
  /** Identificador del proveedor que firma (`local` en la Fase 1). */
  provider: string;
  /** Identificador de firma legible y único. */
  identifier: string;
  /** Huella del documento con la firma incorporada. */
  signedDocumentHash: string;
  /** Nombre del firmante tal como firmó. */
  signerName: string;
  signature: SignatureProviderEvidence;
  timestamp: SignatureProviderEvidence;
  seal: SignatureProviderEvidence;
};

export interface SignatureProvider {
  readonly id: string;
  readonly label: string;
  sign(input: SignatureSignInput): Promise<SignatureProviderResult>;
}

/** Proveedor local: firma en pantalla + sello de tiempo propio de EventOS. */
export const localSignatureProvider: SignatureProvider = {
  id: "local",
  label: "Firma local de EventOS",
  async sign(input) {
    const now = input.now;
    const identifier = signatureIdentifierFor(now, randomBytes(4).toString("hex"));
    const signerName = input.signature.kind === "typed" ? input.signature.name : input.request.recipientName;
    const hash = signedDocumentHash({
      documentHash: input.request.documentHash,
      signatureIdentifier: identifier,
      signedAt: now,
      provider: "local",
      method: input.request.method,
      signerName,
    });
    return {
      provider: "local",
      identifier,
      signedDocumentHash: hash,
      signerName,
      signature: {
        type: "SIGNATURE",
        status: "COMPLETED",
        storageKey: input.signature.kind,
        mime: input.signature.kind === "drawn" ? input.signature.mime : null,
        data: input.signature.kind === "drawn" ? input.signature.data : null,
        size: input.signature.kind === "drawn" ? input.signature.data.byteLength : null,
        reference: identifier,
        capturedAt: now,
        metadata: input.signature.kind === "typed" ? { nombre: input.signature.name } : null,
      },
      timestamp: {
        type: "TIMESTAMP",
        status: "COMPLETED",
        storageKey: "local-timestamp",
        reference: identifier,
        capturedAt: now,
        metadata: { sello: "Reloj del servidor EventOS" },
      },
      seal: {
        type: "SEAL",
        status: "COMPLETED",
        storageKey: "local-seal",
        reference: identifier,
        capturedAt: now,
        metadata: { proveedor: "local" },
      },
    };
  },
};

/**
 * Resuelve un proveedor por id. En la Fase 1 solo existe `local`; un id
 * externo (`viafirma`, …) todavía no está registrado y devuelve `null` para que
 * el llamador corte con un error claro en vez de firmar sin proveedor.
 */
export function signatureProviderById(id: string | null | undefined): SignatureProvider | null {
  if (!id || id === localSignatureProvider.id) return localSignatureProvider;
  return null;
}
