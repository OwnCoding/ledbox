import { canonicalJson, sha256Hex } from "./hash";

/**
 * Documento firmable y sus huellas (issue #79).
 *
 * Sin adjunto PDF, el documento es la **representación canónica** del
 * presupuesto tal como la ve el cliente (título, partes, ítems con precio de
 * venta, totales y plan de pagos): la misma estructura dibuja el visor del
 * portal y la hoja imprimible. `documentHash` sella esa representación al crear
 * la solicitud y `signedDocumentHash` sella la versión con la firma incorporada
 * (documento + bloque de cierre), con la versión del formato incluida para que
 * un cambio futuro no mezcle huellas.
 */

/** Versión del formato de huella; si cambia la forma, sube y no se compara contra la anterior. */
export const SIGNATURE_DOCUMENT_VERSION = 1;

export type SignatureDocumentItem = {
  name: string;
  quantity: number;
  days: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
};

export type SignatureDocumentInstallment = { label: string; amount: number; dueAt: string | null };

/** Datos del presupuesto que forman el documento firmable (sin costos internos). */
export type SignatureBudgetDocument = {
  budgetId: string;
  reference: string;
  title: string;
  organizationName: string;
  client: { name: string; company: string | null };
  event: { name: string; location: string | null; startsAt: string | null } | null;
  createdAt: string;
  validUntil: string | null;
  deliveryAt: string | null;
  ivaType: string | null;
  warranty: string | null;
  notes: string | null;
  paymentTerms: string | null;
  items: SignatureDocumentItem[];
  subtotal: number;
  discount: number;
  total: number;
  plan: {
    advanceAmount: number;
    installments: SignatureDocumentInstallment[];
    dueNow: { label: string; amount: number } | null;
    pending: number;
  };
};

/** Documento canónico del presupuesto (lo que se firma y lo que se imprime). */
export function budgetDocumentPayload(budget: SignatureBudgetDocument): Record<string, unknown> {
  return {
    format: "eventos-budget",
    version: SIGNATURE_DOCUMENT_VERSION,
    budgetId: budget.budgetId,
    reference: budget.reference,
    title: budget.title,
    organizationName: budget.organizationName,
    client: { name: budget.client.name, company: budget.client.company },
    event: budget.event,
    createdAt: budget.createdAt,
    validUntil: budget.validUntil,
    deliveryAt: budget.deliveryAt,
    ivaType: budget.ivaType,
    warranty: budget.warranty,
    notes: budget.notes,
    paymentTerms: budget.paymentTerms,
    items: budget.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      days: item.days,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      notes: item.notes,
    })),
    subtotal: budget.subtotal,
    discount: budget.discount,
    total: budget.total,
    plan: budget.plan,
  };
}

/** Huella del documento canónico (sin adjunto). */
export function budgetDocumentHash(payload: Record<string, unknown>): string {
  return sha256Hex(canonicalJson({ kind: "budget-document", version: SIGNATURE_DOCUMENT_VERSION, payload }));
}

/** Huella de un adjunto (PDF/imagen): SHA-256 de los bytes reales. */
export function attachmentDocumentHash(data: Uint8Array): string {
  return sha256Hex(data);
}

/** Datos del sello que se incorpora al documento firmado. */
export type SignatureSeal = {
  documentHash: string;
  signatureIdentifier: string;
  signedAt: Date | string;
  provider: string;
  method: string;
  signerName: string;
};

/**
 * Huella del documento firmado: la huella original + el bloque de cierre
 * (identificador, sello, método y firmante). La Fase 1 no embebe la firma en el
 * binario del PDF; el documento firmado es el original más este bloque, que es
 * el que muestran la hoja imprimible y la auditoría.
 */
export function signedDocumentHash(seal: SignatureSeal): string {
  return sha256Hex(
    canonicalJson({
      kind: "signed-budget-document",
      version: SIGNATURE_DOCUMENT_VERSION,
      documentHash: seal.documentHash,
      signatureIdentifier: seal.signatureIdentifier,
      signedAt: seal.signedAt instanceof Date ? seal.signedAt.toISOString() : seal.signedAt,
      provider: seal.provider,
      method: seal.method,
      signerName: seal.signerName,
    }),
  );
}

/**
 * Identificador de firma legible y único: `FIRMA-YYYYMMDD-XXXXXXXX`
 * (`random` es el fragmento aleatorio en hex que provee el proveedor).
 */
export function signatureIdentifierFor(now: Date, random: string): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = random.replace(/[^0-9A-F]/gi, "").toUpperCase().padEnd(8, "0").slice(0, 8);
  return `FIRMA-${day}-${suffix}`;
}
