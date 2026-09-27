import type { AdminTone } from "@/lib/admin-format";

/**
 * Reglas del portal de firma (issue #79), puras y sin base de datos: estados,
 * transiciones válidas, etiquetas y ventanas de acción. Es la única fuente que
 * deciden el endpoint del portal, el panel y las pruebas.
 *
 * Reglas madre del doc `docs/client-signature-portal.md`:
 * - `SIGNED` no vuelve a ningún estado anterior.
 * - `VALIDATED` solo puede ocurrir después de `SIGNED`.
 * - `REJECTED`, `EXPIRED` y `CANCELLED` bloquean la firma para siempre.
 * - `DRAFT` y `DELIVERED` están en el contrato del doc; la Fase 1 nace en `SENT`
 *   y no usa `DELIVERED` (el correo no confirma entrega).
 */

export const SIGNATURE_STATUSES = [
  "DRAFT",
  "SENT",
  "DELIVERED",
  "VIEWED",
  "PENDING_SIGNATURE",
  "SIGNING",
  "SIGNED",
  "VALIDATED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type SignatureStatusValue = (typeof SIGNATURE_STATUSES)[number];

export const SIGNATURE_METHODS = ["DRAWN", "TYPED"] as const;
export type SignatureMethodValue = (typeof SIGNATURE_METHODS)[number];

export const SIGNATURE_EVENT_TYPES = [
  "REQUEST_CREATED",
  "DOCUMENT_UPDATED",
  "EMAIL_SENT",
  "EMAIL_FAILED",
  "SMS_SENT",
  "VIEWED",
  "CONSENT_ACCEPTED",
  "SIGNING_STARTED",
  "SIGNATURE_RECEIVED",
  "OTP_SENT",
  "OTP_VALIDATED",
  "OTP_FAILED",
  "EVIDENCE_RECEIVED",
  "TIMESTAMP_APPLIED",
  "DOCUMENT_VALIDATED",
  "AUDIT_GENERATED",
  "COMPLETION_EMAIL_SENT",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type SignatureEventTypeValue = (typeof SIGNATURE_EVENT_TYPES)[number];

export const SIGNATURE_EVIDENCE_TYPES = ["SIGNATURE", "OTP", "PHOTO", "TIMESTAMP", "SEAL"] as const;
export type SignatureEvidenceTypeValue = (typeof SIGNATURE_EVIDENCE_TYPES)[number];

/** Estados que bloquean la firma: rechazada, vencida o cancelada. */
const BLOCKED_STATUSES: readonly SignatureStatusValue[] = ["REJECTED", "EXPIRED", "CANCELLED"];

/** Estados en los que el cliente todavía puede firmar o rechazar. */
const ACTIVE_STATUSES: readonly SignatureStatusValue[] = ["SENT", "DELIVERED", "VIEWED", "PENDING_SIGNATURE"];

/** Estados con firma ya recibida (no vuelven atrás). */
const SIGNED_STATUSES: readonly SignatureStatusValue[] = ["SIGNED", "VALIDATED"];

export const SIGNATURE_SIGNED_STATUSES = SIGNED_STATUSES;

/** Transiciones permitidas. Todo lo que no esté acá es un error de lógica. */
const TRANSITIONS: Record<SignatureStatusValue, readonly SignatureStatusValue[]> = {
  DRAFT: ["SENT", "CANCELLED", "EXPIRED"],
  SENT: ["DELIVERED", "VIEWED", "PENDING_SIGNATURE", "REJECTED", "EXPIRED", "CANCELLED"],
  DELIVERED: ["VIEWED", "PENDING_SIGNATURE", "REJECTED", "EXPIRED", "CANCELLED"],
  VIEWED: ["PENDING_SIGNATURE", "REJECTED", "EXPIRED", "CANCELLED"],
  PENDING_SIGNATURE: ["SIGNING", "REJECTED", "EXPIRED", "CANCELLED"],
  SIGNING: ["SIGNED", "EXPIRED", "CANCELLED"],
  SIGNED: ["VALIDATED"],
  VALIDATED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/**
 * Rate limit del envío manual por correo (issue #81): por solicitud y por
 * usuario, en la ventana de 15 minutos de `lib/server/rate-limit.ts`. Evita que
 * un doble clic o un reenvío en loop llenen el correo del cliente.
 */
export const SIGNATURE_RESEND_LIMIT_PER_REQUEST = 5;
export const SIGNATURE_RESEND_LIMIT_PER_USER = 20;

/** ¿La transición `from → to` es válida? (misma regla que aplica el servidor). */export function signatureCanTransition(from: SignatureStatusValue, to: SignatureStatusValue): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** El cliente todavía puede firmar. */
export function signatureCanSign(status: SignatureStatusValue): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** El cliente todavía puede rechazar (misma ventana que firmar). */
export function signatureCanReject(status: SignatureStatusValue): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** El estado bloquea toda acción de firma (firmada, validada, rechazada, vencida o cancelada). */
export function signatureBlocksSigning(status: SignatureStatusValue): boolean {
  return BLOCKED_STATUSES.includes(status) || SIGNED_STATUSES.includes(status);
}

/**
 * El estado sigue "en juego" para el panel: la solicitud puede vencer o
 * cancelarse y el link sigue activo.
 */
export function signatureIsActive(status: SignatureStatusValue): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** ¿Corresponde vencerla? Solo una solicitud activa con vencimiento cumplido. */
export function signatureIsExpired(status: SignatureStatusValue, expiresAt: Date, now: Date): boolean {
  return signatureIsActive(status) && expiresAt.getTime() <= now.getTime();
}

/** Estado al abrir el link por primera vez (si la solicitud sigue activa). */
export function signatureNextOnView(status: SignatureStatusValue): SignatureStatusValue | null {
  return signatureCanSign(status) ? "VIEWED" : null;
}

/** Estado al aceptar el consentimiento (antes de capturar la firma). */
export function signatureNextOnConsent(status: SignatureStatusValue): SignatureStatusValue | null {
  return signatureCanSign(status) ? "PENDING_SIGNATURE" : null;
}

// ── Etiquetas del panel y del portal ────────────────────────────────────────

const STATUS_LABELS: Record<SignatureStatusValue, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada al cliente",
  DELIVERED: "Entregada",
  VIEWED: "Vista por el cliente",
  PENDING_SIGNATURE: "Pendiente de firma",
  SIGNING: "Firma en curso",
  SIGNED: "Firmada",
  VALIDATED: "Firmada y validada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
};

export function signatureStatusLabel(status: string | null | undefined): string {
  return STATUS_LABELS[status as SignatureStatusValue] ?? "Solicitud";
}

const STATUS_TONES: Record<SignatureStatusValue, AdminTone> = {
  DRAFT: "neutral",
  SENT: "info",
  DELIVERED: "info",
  VIEWED: "accent",
  PENDING_SIGNATURE: "warn",
  SIGNING: "warn",
  SIGNED: "ok",
  VALIDATED: "ok",
  REJECTED: "danger",
  EXPIRED: "danger",
  CANCELLED: "neutral",
};

export function signatureStatusTone(status: string | null | undefined): AdminTone {
  return STATUS_TONES[status as SignatureStatusValue] ?? "neutral";
}

/** Copy público del estado (el que ve el cliente en el portal). */
const PORTAL_STATUS_LABELS: Record<SignatureStatusValue, string> = {
  DRAFT: "Solicitud en preparación",
  SENT: "Pendiente de firma",
  DELIVERED: "Pendiente de firma",
  VIEWED: "Pendiente de firma",
  PENDING_SIGNATURE: "Pendiente de firma",
  SIGNING: "Firma en curso",
  SIGNED: "Firmado",
  VALIDATED: "Validado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
};

export function signaturePortalStatusLabel(status: string | null | undefined): string {
  return PORTAL_STATUS_LABELS[status as SignatureStatusValue] ?? "Solicitud";
}

const METHOD_LABELS: Record<SignatureMethodValue, string> = {
  DRAWN: "Firma dibujada",
  TYPED: "Firma tipográfica",
};

export function signatureMethodLabel(method: string | null | undefined): string {
  return METHOD_LABELS[method as SignatureMethodValue] ?? "Firma electrónica";
}

const EVENT_LABELS: Record<SignatureEventTypeValue, string> = {
  REQUEST_CREATED: "Solicitud creada",
  DOCUMENT_UPDATED: "Documento actualizado",
  EMAIL_SENT: "Email enviado",
  EMAIL_FAILED: "El email no se pudo enviar",
  SMS_SENT: "SMS enviado",
  VIEWED: "Documento leído",
  CONSENT_ACCEPTED: "Consentimiento aceptado",
  SIGNING_STARTED: "Firma iniciada",
  SIGNATURE_RECEIVED: "Firma recibida",
  OTP_SENT: "Código de verificación enviado",
  OTP_VALIDATED: "Código de verificación validado",
  OTP_FAILED: "Código de verificación incorrecto",
  EVIDENCE_RECEIVED: "Evidencia recibida",
  TIMESTAMP_APPLIED: "Sello de tiempo aplicado",
  DOCUMENT_VALIDATED: "Documento validado",
  AUDIT_GENERATED: "Auditoría generada",
  COMPLETION_EMAIL_SENT: "Email de finalización enviado",
  REJECTED: "Firma rechazada por el cliente",
  CANCELLED: "Solicitud cancelada por el equipo",
  EXPIRED: "Solicitud vencida",
};

export function signatureEventLabel(type: string | null | undefined): string {
  return EVENT_LABELS[type as SignatureEventTypeValue] ?? "Evento";
}

const EVIDENCE_LABELS: Record<SignatureEvidenceTypeValue, string> = {
  SIGNATURE: "Firma",
  OTP: "Verificación por código",
  PHOTO: "Fotografía",
  TIMESTAMP: "Sello de tiempo",
  SEAL: "Sello electrónico",
};

export function signatureEvidenceLabel(type: string | null | undefined): string {
  return EVIDENCE_LABELS[type as SignatureEvidenceTypeValue] ?? "Evidencia";
}

/**
 * Tono visual de un evento de firma: el mismo criterio en el panel y en el
 * portal (una sola fuente). Ámbar para lo pendiente, verde para lo firmado
 * y validado, rojo para lo fallido o bloqueado.
 */
export function signatureEventTone(type: string | null | undefined): AdminTone {
  if (type === "REJECTED" || type === "EXPIRED" || type === "CANCELLED" || type === "EMAIL_FAILED" || type === "OTP_FAILED") {
    return "danger";
  }
  if (type === "SIGNATURE_RECEIVED" || type === "TIMESTAMP_APPLIED" || type === "DOCUMENT_VALIDATED" || type === "SEAL") {
    return "ok";
  }
  if (type === "VIEWED" || type === "CONSENT_ACCEPTED" || type === "SIGNING_STARTED") return "accent";
  if (type === "EMAIL_SENT" || type === "OTP_SENT" || type === "OTP_VALIDATED" || type === "COMPLETION_EMAIL_SENT") return "info";
  return "neutral";
}

/** Motivo público por el que la firma está bloqueada (copy del doc). */export function signatureBlockedReason(status: SignatureStatusValue): string {
  if (status === "REJECTED") return "Esta solicitud de firma fue rechazada. Escribinos si necesitás firmar una versión nueva.";
  if (status === "EXPIRED") return "El enlace venció o ya no está disponible. Pedinos uno nuevo para firmar.";
  if (status === "CANCELLED") return "Esta solicitud fue cancelada por el equipo. Escribinos si necesitás firmar una versión nueva.";
  if (status === "SIGNED" || status === "VALIDATED") return "Este documento ya fue firmado. Podés verlo y descargar la auditoría.";
  return "No pudimos habilitar la firma de esta solicitud.";
}
