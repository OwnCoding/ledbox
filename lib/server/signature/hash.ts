import { createHash, createHmac } from "node:crypto";

/**
 * Huellas y encadenamiento del portal de firma (issue #79).
 *
 * Todo lo de este archivo es **puro** (no toca la base): la cadena de auditoría,
 * el hash del documento y la protección de IP/user-agent se prueban sin base de
 * datos. Reglas:
 * - El contenido de un evento se serializa de forma **canónica** (claves
 *   ordenadas en todo el árbol) antes de hashear: el mismo contenido da el
 *   mismo hash en cualquier proceso.
 * - Cada evento encadena el hash del anterior (`previousEventHash`); cambiar un
 *   evento viejo invalida todos los que siguen y `verifySignatureChain` lo
 *   detecta.
 * - IP y user-agent solo se guardan como HMAC-SHA256 con pepper
 *   (`SIGNATURE_HASH_PEPPER` o `AUTH_SECRET`; nunca en claro en la base).
 */

/** SHA-256 en hex de un texto o de bytes. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Valor serializable para la cadena (fechas ISO, `undefined` → `null`). */
type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

function canonicalValue(value: unknown): CanonicalValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: { [key: string]: CanonicalValue } = {};
    for (const key of Object.keys(record).sort()) result[key] = canonicalValue(record[key]);
    return result;
  }
  return String(value);
}

/** JSON canónico: claves ordenadas en todo el árbol; el mismo contenido, la misma cadena. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

// ── Cadena de eventos ───────────────────────────────────────────────────────

/**
 * Contenido que se hashea de un evento. Los campos opcionales van como `null`
 * para que un evento sin IP y otro con `undefined` den el mismo hash.
 */
export type SignatureEventHashCore = {
  id: string;
  requestId: string;
  eventType: string;
  status: string | null;
  occurredAt: Date | string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  metadataJson: unknown;
};

/** Material exacto que se hashea: el evento canónico + el hash anterior. */
export function signatureEventHashMaterial(core: SignatureEventHashCore, previousEventHash: string | null): string {
  return canonicalJson({
    id: core.id,
    requestId: core.requestId,
    eventType: core.eventType,
    status: core.status,
    occurredAt: core.occurredAt instanceof Date ? core.occurredAt.toISOString() : core.occurredAt,
    actorType: core.actorType,
    actorId: core.actorId,
    actorName: core.actorName,
    ipHash: core.ipHash,
    userAgentHash: core.userAgentHash,
    metadataJson: core.metadataJson ?? null,
    previousEventHash: previousEventHash ?? null,
  });
}

/** Hash del evento encadenado al anterior. */
export function computeSignatureEventHash(core: SignatureEventHashCore, previousEventHash: string | null): string {
  return sha256Hex(signatureEventHashMaterial(core, previousEventHash));
}

/**
 * Verifica la cadena completa de una solicitud: cada `eventHash` se recalcula
 * con su contenido real y el hash del evento anterior. Devuelve el primer
 * evento roto (o `null` si la cadena es válida). La lista debe venir ordenada
 * por `occurredAt` ascendente, que es el orden de escritura.
 */
export function verifySignatureChain(
  events: Array<{
    id: string;
    requestId: string;
    eventType: string;
    status: string | null;
    occurredAt: Date;
    actorType: string;
    actorId: string | null;
    actorName: string | null;
    ipHash: string | null;
    userAgentHash: string | null;
    metadataJson: unknown;
    previousEventHash: string | null;
    eventHash: string;
  }>,
): { valid: boolean; brokenAt: string | null } {
  let previous: string | null = null;
  for (const event of events) {
    const expected = computeSignatureEventHash(event, previous);
    if (event.eventHash !== expected || (event.previousEventHash ?? null) !== previous) {
      return { valid: false, brokenAt: event.id };
    }
    previous = event.eventHash;
  }
  return { valid: true, brokenAt: null };
}

// ── Protección de datos del cliente ─────────────────────────────────────────
// El enmascarado de pantalla vive en `lib/admin-format.ts` (fuente única que
// comparten panel y portal); acá se reexporta para el contrato del portal y las
// pruebas.

export { maskEmailDisplay as maskEmail, maskPhoneDisplay as maskPhone } from "@/lib/admin-format";

function hashPepper(): string {
  return process.env.SIGNATURE_HASH_PEPPER || process.env.AUTH_SECRET || "ledbox-signature-dev-pepper";
}

/** IP protegida: HMAC con pepper (nunca se guarda en claro). */
export function hashIp(ip: string | null | undefined): string | null {
  const value = (ip ?? "").trim();
  if (!value || value === "unknown") return null;
  return createHmac("sha256", hashPepper()).update(`ip:${value}`).digest("hex");
}

/** User-agent protegido: HMAC con pepper. */
export function hashUserAgent(userAgent: string | null | undefined): string | null {
  const value = (userAgent ?? "").trim().slice(0, 400);
  if (!value) return null;
  return createHmac("sha256", hashPepper()).update(`ua:${value}`).digest("hex");
}

/** Etiqueta corta de una huella (primeros 12 hex) para las pantallas de auditoría. */
export function shortHash(hash: string | null | undefined): string {
  const value = (hash ?? "").trim();
  return value ? `${value.slice(0, 12)}…` : "";
}
