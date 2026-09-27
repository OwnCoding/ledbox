import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { budgetReference } from "@/lib/admin-format";
import { normalizeSignatureCode } from "@/lib/public-config";
import { isDemoOrganizationSlug } from "../demo-data";
import { paymentPlanOf } from "../budget-portal";
import { recordAudit, portalAuditContext } from "../audit";
import { rateLimit } from "../rate-limit";
import { appendSignatureEvent, type SignatureActorInput } from "./events";
import { hashIp, hashUserAgent, maskEmail, maskPhone, verifySignatureChain } from "./hash";
import { budgetDocumentPayload, type SignatureBudgetDocument } from "./document";
import { signatureProviderById } from "./provider";
import { parseSignatureSubmission } from "./submission";
import type { AdminTone } from "@/lib/admin-format";
import {
  signatureBlockedReason,
  signatureCanReject,
  signatureCanSign,
  signatureEventLabel,
  signatureEvidenceLabel,
  signatureIsExpired,
  signatureMethodLabel,
  signaturePortalStatusLabel,
  signatureStatusTone,
  type SignatureEventTypeValue,
  type SignatureMethodValue,
  type SignatureStatusValue,
} from "./rules";

/**
 * Portal público de firma (issue #79): única puerta de entrada de las páginas
 * `app/(portal)/firma/[codigo]/*` y de `app/api/portal/firma/*`.
 *
 * - El código público es la única credencial; sin él no existe nada (404).
 * - Los datos del destinatario viajan **enmascarados** (correo y teléfono) y el
 *   documento nunca se sirve sin código válido.
 * - La vista sella la primera apertura (`VIEWED`) y aplica el vencimiento de
 *   forma perezosa (una sola transición con su evento); la empresa demo no
 *   escribe nada.
 * - Firmar y rechazar corren en una transacción con bloqueo de la solicitud:
 *   estado, evidencias y eventos se confirman juntos (o nada).
 */

const MAX_TIMELINE_EVENTS = 200;

export type PortalSignatureTimelineEntry = {
  id: string;
  at: string;
  type: string;
  label: string;
  detail: string | null;
  actor: string | null;
  tone: AdminTone;
  hash: string;
};

export type PortalSignatureEvidenceView = {
  type: string;
  label: string;
  status: string;
  reference: string | null;
  capturedAt: string | null;
};

export type PortalSignatureUrlSet = {
  /** Página imprimible del documento (firmado si corresponde). */
  document: string;
  /** Página imprimible de la auditoría. */
  audit: string;
  /** Binario del adjunto con código válido; `null` si el documento es el presupuesto. */
  attachment: string | null;
  /** Validador del portal (para volver). */
  portal: string;
};

export type PortalSignatureRequest = {
  code: string;
  title: string;
  organizationName: string;
  senderName: string;
  recipient: { name: string; email: string | null; phone: string | null };
  status: SignatureStatusValue;
  statusLabel: string;
  statusTone: AdminTone;
  canSign: boolean;
  canReject: boolean;
  blockedReason: string | null;
  method: SignatureMethodValue;
  methodLabel: string;
  otpRequired: boolean;
  otpVerified: boolean;
  demo: boolean;
  createdAt: string;
  expiresAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  validatedAt: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  signatureIdentifier: string | null;
  documentHash: string;
  signedDocumentHash: string | null;
  chain: { valid: boolean; brokenAt: string | null };
  document: {
    kind: "attachment" | "budget";
    name: string;
    mime: string | null;
    size: number | null;
  };
  /** Representación canónica del presupuesto para el visor (sin costos internos). */
  budget: SignatureBudgetDocument | null;
  timeline: PortalSignatureTimelineEntry[];
  evidence: PortalSignatureEvidenceView[];
  urls: PortalSignatureUrlSet;
};

/** Evidencia de navegación ya protegida (hashes listos para guardar). */
export type SignatureClientEvidence = { ipHash: string | null; userAgentHash: string | null };

/** Hashes de IP/user-agent a partir de los headers del pedido del cliente. */
export function signatureClientEvidence(headers: Headers): SignatureClientEvidence {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "";
  return { ipHash: hashIp(ip), userAgentHash: hashUserAgent(headers.get("user-agent")) };
}

/** Error de negocio del portal: viaja como JSON con su status real. */
export class SignatureActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "SignatureActionError";
  }
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

const ACTIVE_STATUSES: SignatureStatusValue[] = ["SENT", "DELIVERED", "VIEWED", "PENDING_SIGNATURE"];

/** Motivo corto de un evento para la timeline (nunca datos sensibles completos). */
function eventDetail(row: {
  eventType: string;
  metadataJson: unknown;
}): string | null {
  const metadata = (row.metadataJson ?? null) as Record<string, unknown> | null;
  if (!metadata || typeof metadata !== "object") return null;
  const text = (key: string, max = 300) => {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  };
  if (row.eventType === "EMAIL_SENT" || row.eventType === "EMAIL_FAILED" || row.eventType === "COMPLETION_EMAIL_SENT") {
    const to = text("to");
    const reason = text("motivo");
    return [to ? `A: ${maskEmail(to)}` : null, reason].filter((part): part is string => Boolean(part)).join(" · ") || null;
  }
  if (row.eventType === "REJECTED" || row.eventType === "CANCELLED") return text("motivo");
  if (row.eventType === "SIGNATURE_RECEIVED") {
    return [text("firmante"), text("metodo", 40)].filter((part): part is string => Boolean(part)).join(" · ") || null;
  }
  if (row.eventType === "OTP_SENT") return text("destino") ? `A: ${maskEmail(text("destino"))}` : null;
  return null;
}

function eventActorLabel(actorType: string): string | null {
  if (actorType === "CLIENT") return "Vos";
  if (actorType === "ADMIN") return "LedBox";
  return null;
}

/** Timeline del portal a partir de los eventos reales (con su hash encadenado). */
export function portalTimeline(rows: Array<{
  id: string;
  eventType: string;
  occurredAt: Date;
  actorType: string;
  metadataJson: unknown;
  eventHash: string;
}>): PortalSignatureTimelineEntry[] {
  return rows.map((row) => ({
    id: row.id,
    at: row.occurredAt.toISOString(),
    type: row.eventType,
    label: signatureEventLabel(row.eventType),
    detail: eventDetail(row),
    actor: eventActorLabel(row.actorType),
    tone: eventTone(row.eventType),
    hash: row.eventHash,
  }));
}

function eventTone(type: string): AdminTone {
  if (type === "REJECTED" || type === "EXPIRED" || type === "CANCELLED" || type === "EMAIL_FAILED") return "danger";
  if (type === "SIGNATURE_RECEIVED" || type === "DOCUMENT_VALIDATED" || type === "TIMESTAMP_APPLIED" || type === "SEAL") return "ok";
  if (type === "VIEWED" || type === "CONSENT_ACCEPTED" || type === "SIGNING_STARTED") return "accent";
  if (type === "EMAIL_SENT" || type === "OTP_SENT" || type === "COMPLETION_EMAIL_SENT") return "info";
  return "neutral";
}

const requestInclude = {
  organization: { select: { name: true, slug: true } },
  attachment: { select: { id: true, name: true, mime: true, size: true } },
  budget: {
    select: {
      id: true,
      title: true,
      createdAt: true,
      validUntil: true,
      deliveryAt: true,
      ivaType: true,
      warranty: true,
      notes: true,
      paymentTerms: true,
      advanceAmount: true,
      installmentsJson: true,
      subtotal: true,
      discount: true,
      total: true,
      client: { select: { name: true, company: true } },
      event: { select: { name: true, location: true, startsAt: true, endsAt: true } },
      items: {
        orderBy: { name: "asc" },
        select: { name: true, quantity: true, days: true, unitPrice: true, subtotal: true, notes: true },
      },
    },
  },
  events: {
    orderBy: { occurredAt: "asc" },
    take: MAX_TIMELINE_EVENTS,
    select: {
      id: true,
      requestId: true,
      eventType: true,
      status: true,
      occurredAt: true,
      actorType: true,
      actorId: true,
      actorName: true,
      ipHash: true,
      userAgentHash: true,
      metadataJson: true,
      previousEventHash: true,
      eventHash: true,
    },
  },
  evidence: {
    orderBy: { createdAt: "asc" },
    select: {
      type: true,
      status: true,
      providerReference: true,
      capturedAt: true,
      storageKey: true,
    },
  },
} as const;

type SignatureRequestRow = Prisma.SignatureRequestGetPayload<{ include: typeof requestInclude }>;

/** Documento canónico (sin costos internos) que se firma cuando no hay adjunto. */
export function signatureBudgetDocument(row: SignatureRequestRow): SignatureBudgetDocument {
  const budget = row.budget;
  return {
    budgetId: budget.id,
    reference: budgetReference(budget.id),
    title: row.title,
    organizationName: row.organization.name,
    client: { name: budget.client.name, company: budget.client.company },
    event: budget.event
      ? { name: budget.event.name, location: budget.event.location, startsAt: iso(budget.event.startsAt) }
      : null,
    createdAt: budget.createdAt.toISOString(),
    validUntil: iso(budget.validUntil),
    deliveryAt: iso(budget.deliveryAt),
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
    plan: (() => {
      const plan = paymentPlanOf(budget);
      return {
        advanceAmount: plan.advanceAmount,
        installments: plan.installments,
        dueNow: plan.dueNow,
        pending: plan.pending,
      };
    })(),
  };
}

function portalView(row: SignatureRequestRow): PortalSignatureRequest {
  const status = row.status as SignatureStatusValue;
  const demo = isDemoOrganizationSlug(row.organization.slug);
  const canSign = !demo && signatureCanSign(status) && !signatureIsExpired(status, row.expiresAt, new Date());
  const canReject = !demo && canSign && signatureCanReject(status);
  const events = row.events;
  return {
    code: row.publicCode,
    title: row.title,
    organizationName: row.organization.name,
    senderName: row.senderName,
    recipient: {
      name: row.recipientName,
      email: maskEmail(row.recipientEmail),
      phone: maskPhone(row.recipientPhone),
    },
    status,
    statusLabel: signaturePortalStatusLabel(status),
    statusTone: signatureStatusTone(status),
    canSign,
    canReject,
    blockedReason: canSign ? null : demo ? "El portal de ejemplo es de solo lectura." : signatureBlockedReason(status),
    method: row.method as SignatureMethodValue,
    methodLabel: signatureMethodLabel(row.method),
    otpRequired: row.otpRequired,
    otpVerified: Boolean(row.otpVerifiedAt),
    demo,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    sentAt: iso(row.sentAt),
    viewedAt: iso(row.viewedAt),
    signedAt: iso(row.signedAt),
    validatedAt: iso(row.validatedAt),
    rejectionReason: row.rejectionReason,
    cancelReason: row.cancelReason,
    signatureIdentifier: row.signatureIdentifier,
    documentHash: row.documentHash,
    signedDocumentHash: row.signedDocumentHash,
    chain: verifySignatureChain(events),
    document: row.attachment
      ? { kind: "attachment", name: row.attachment.name, mime: row.attachment.mime, size: row.attachment.size }
      : { kind: "budget", name: row.title, mime: null, size: null },
    budget: row.attachment ? null : signatureBudgetDocument(row),
    timeline: portalTimeline(events),
    evidence: row.evidence.map((item) => ({
      type: item.type,
      label: signatureEvidenceLabel(item.type),
      status: item.status,
      reference: item.providerReference,
      capturedAt: iso(item.capturedAt),
    })),
    urls: {
      document: `/firma/${encodeURIComponent(row.publicCode)}/documento`,
      audit: `/firma/${encodeURIComponent(row.publicCode)}/auditoria`,
      attachment: row.attachment ? `/api/portal/firma/${encodeURIComponent(row.publicCode)}/documento` : null,
      portal: "/portal",
    },
  };
}

function evidenceLabel(type: string): string {
  return signatureEvidenceLabel(type);
}

async function loadRow(code: string): Promise<SignatureRequestRow | null> {
  return db.signatureRequest.findUnique({ where: { publicCode: code }, include: requestInclude });
}

/**
 * Vence una solicitud activa cuya fecha ya pasó (una sola vez): cambia el
 * estado y deja su evento. Devuelve `true` si la venció en esta llamada.
 */
export async function expireSignatureRequest(requestId: string): Promise<boolean> {
  const now = new Date();
  const changed = await db.signatureRequest.updateMany({
    where: { id: requestId, status: { in: ACTIVE_STATUSES }, expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  if (changed.count === 0) return false;
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    select: { organizationId: true },
  });
  if (request) {
    await appendSignatureEvent({
      requestId,
      organizationId: request.organizationId,
      eventType: "EXPIRED",
      status: "EXPIRED",
      occurredAt: now,
      metadata: { motivo: "Venció el plazo de la solicitud" },
    });
  }
  return true;
}

/**
 * Sella la primera apertura del link: `viewedAt` una sola vez y el evento
 * `VIEWED` con la evidencia protegida del navegador. Idempotente por el
 * `updateMany` condicional, así dos pestañas abiertas no duplican el hito.
 */
async function sealSignatureView(requestId: string, evidence: SignatureClientEvidence): Promise<void> {
  const now = new Date();
  const changed = await db.signatureRequest.updateMany({
    where: { id: requestId, viewedAt: null, status: { in: ACTIVE_STATUSES } },
    data: { viewedAt: now, status: "VIEWED" },
  });
  if (changed.count === 0) return;
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    select: { organizationId: true },
  });
  if (!request) return;
  await appendSignatureEvent({
    requestId,
    organizationId: request.organizationId,
    eventType: "VIEWED",
    status: "VIEWED",
    actor: { type: "CLIENT" },
    ipHash: evidence.ipHash,
    userAgentHash: evidence.userAgentHash,
    occurredAt: now,
  });
}

/**
 * Solicitud pública por código: `null` si el código no existe o no tiene la
 * forma esperada. Con `sealView` sella la primera apertura (nunca en la demo).
 * Antes de armar la vista aplica el vencimiento perezoso.
 */
export async function loadSignaturePortal(
  code: string | null | undefined,
  options: { sealView?: boolean; evidence?: SignatureClientEvidence } = {},
): Promise<PortalSignatureRequest | null> {
  const normalized = normalizeSignatureCode(code);
  if (!normalized) return null;
  let row = await loadRow(normalized);
  if (!row) return null;
  const demo = isDemoOrganizationSlug(row.organization.slug);
  if (!demo && signatureIsExpired(row.status as SignatureStatusValue, row.expiresAt, new Date())) {
    await expireSignatureRequest(row.id);
    row = await loadRow(normalized);
    if (!row) return null;
  }
  if (options.sealView && !demo && row.viewedAt === null && signatureCanSign(row.status as SignatureStatusValue)) {
    await sealSignatureView(row.id, options.evidence ?? { ipHash: null, userAgentHash: null });
    row = await loadRow(normalized);
    if (!row) return null;
  }
  return portalView(row);
}

// ── Firma y rechazo ─────────────────────────────────────────────────────────

export type SignatureActionInput = {
  code: string;
  evidence: SignatureClientEvidence;
  body: unknown;
  /** Destino del correo de finalización (se resuelve en la página/API). */
  request?: Request;
};

async function limitedOrThrow(key: string, limit: number): Promise<void> {
  const limited = await rateLimit(key, limit);
  if (!limited.allowed) {
    throw new SignatureActionError(429, "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.", limited.retryAfter);
  }
}

/** Mensaje de bloqueo del estado actual para el cliente. */
function blockedMessage(status: SignatureStatusValue): string {
  return signatureBlockedReason(status);
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/**
 * Firma electrónica del cliente: valida consentimiento, código, vencimiento,
 * estado y método; verifica el OTP si la solicitud lo exige; llama al
 * `SignatureProvider`; y en una transacción guarda estado, evidencias y la
 * cadena de eventos (consentimiento → firma → sello → validación → auditoría).
 */
export async function signSignatureRequest(input: SignatureActionInput): Promise<PortalSignatureRequest> {
  const normalized = normalizeSignatureCode(input.code);
  if (!normalized) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  await limitedOrThrow(`signature-sign-code:${normalized}`, 10);
  await limitedOrThrow(`signature-sign:${input.evidence.ipHash ?? "sin-ip"}`, 30);

  const row = await loadRow(normalized);
  if (!row) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  if (isDemoOrganizationSlug(row.organization.slug)) {
    throw new SignatureActionError(403, "El portal de ejemplo es de solo lectura.");
  }

  const status = row.status as SignatureStatusValue;
  if (signatureIsExpired(status, row.expiresAt, new Date())) {
    await expireSignatureRequest(row.id);
    throw new SignatureActionError(409, signatureBlockedReason("EXPIRED"));
  }
  if (!signatureCanSign(status)) throw new SignatureActionError(409, blockedMessage(status));

  const body = bodyRecord(input.body);
  if (body.consent !== true) {
    throw new SignatureActionError(400, "Confirmá que revisaste el documento y querés firmarlo electrónicamente.");
  }
  if (row.otpRequired && !row.otpVerifiedAt) {
    throw new SignatureActionError(403, "Ingresá el código de verificación que te enviamos por correo antes de firmar.");
  }

  const submission = parseSignatureSubmission(row.method, body.signature, row.recipientName);
  if (!submission.ok) throw new SignatureActionError(400, submission.error);

  const provider = signatureProviderById(row.signatureProvider);
  if (!provider) throw new SignatureActionError(500, "La solicitud usa un proveedor de firma que no está disponible.");
  const now = new Date();
  const providerResult = await provider.sign({
    request: {
      id: row.id,
      title: row.title,
      method: row.method,
      documentHash: row.documentHash,
      recipientName: row.recipientName,
    },
    signature: submission.value,
    now,
  });

  const clientActor: SignatureActorInput = { type: "CLIENT", name: providerResult.signerName };
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SignatureRequest" WHERE "id" = ${row.id} FOR UPDATE`;
      const fresh = await tx.signatureRequest.findUnique({
        where: { id: row.id },
        select: { status: true, expiresAt: true, otpRequired: true, otpVerifiedAt: true, documentHash: true },
      });
      if (!fresh) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
      if (signatureIsExpired(fresh.status as SignatureStatusValue, fresh.expiresAt, new Date())) {
        throw new SignatureActionError(409, signatureBlockedReason("EXPIRED"));
      }
      if (!signatureCanSign(fresh.status as SignatureStatusValue)) {
        throw new SignatureActionError(409, blockedMessage(fresh.status as SignatureStatusValue));
      }
      if (fresh.otpRequired && !fresh.otpVerifiedAt) {
        throw new SignatureActionError(403, "Ingresá el código de verificación que te enviamos por correo antes de firmar.");
      }
      if (fresh.documentHash !== row.documentHash) {
        throw new SignatureActionError(409, "El documento cambió desde que se envió la solicitud. Pedinos un enlace nuevo.");
      }

      await tx.signatureRequest.update({
        where: { id: row.id },
        data: {
          status: "VALIDATED",
          viewedAt: row.viewedAt ?? now,
          consentedAt: now,
          signedAt: now,
          validatedAt: now,
          completedAt: now,
          signedDocumentHash: providerResult.signedDocumentHash,
          signatureIdentifier: providerResult.identifier,
          signatureProvider: providerResult.provider,
        },
      });

      // Evidencias: la firma capturada (con su binario), el sello y la foto
      // opcional ya existen como filas; se completan las que corresponden.
      for (const evidence of [providerResult.signature, providerResult.timestamp, providerResult.seal]) {
        await tx.signatureEvidence.updateMany({
          where: { requestId: row.id, type: evidence.type },
          data: {
            status: evidence.status,
            storageKey: evidence.storageKey,
            mime: evidence.mime ?? null,
            size: evidence.size ?? null,
            data: evidence.data ? new Uint8Array(evidence.data) : null,
            capturedAt: evidence.capturedAt,
            providerReference: evidence.reference ?? null,
            metadataJson: (evidence.metadata ?? null) as Prisma.InputJsonValue,
          },
        });
      }

      const events: Array<{ eventType: SignatureEventTypeValue; status: SignatureStatusValue; metadata?: Record<string, unknown> }> = [
        { eventType: "CONSENT_ACCEPTED", status: "PENDING_SIGNATURE", metadata: { texto: "Confirmo que revisé el documento y deseo firmarlo electrónicamente." } },
        { eventType: "SIGNING_STARTED", status: "SIGNING", metadata: { metodo: row.method } },
        {
          eventType: "SIGNATURE_RECEIVED",
          status: "SIGNED",
          metadata: {
            firmante: providerResult.signerName,
            metodo: row.method,
            proveedor: providerResult.provider,
            identificador: providerResult.identifier,
            documentoHash: row.documentHash,
            firmadoHash: providerResult.signedDocumentHash,
          },
        },
        { eventType: "TIMESTAMP_APPLIED", status: "SIGNED", metadata: { sello: providerResult.identifier } },
        { eventType: "DOCUMENT_UPDATED", status: "SIGNED", metadata: { firmadoHash: providerResult.signedDocumentHash } },
        { eventType: "DOCUMENT_VALIDATED", status: "VALIDATED", metadata: { proveedor: providerResult.provider } },
        { eventType: "AUDIT_GENERATED", status: "VALIDATED", metadata: { eventos: 7 } },
      ];
      for (const event of events) {
        await appendSignatureEvent(
          {
            requestId: row.id,
            organizationId: row.organizationId,
            eventType: event.eventType,
            status: event.status,
            actor: clientActor,
            ipHash: input.evidence.ipHash,
            userAgentHash: input.evidence.userAgentHash,
            metadata: event.metadata ?? null,
          },
          tx,
        );
      }
    });
  } catch (error) {
    if (error instanceof SignatureActionError) throw error;
    throw error;
  }

  await recordAudit({
    context: portalAuditContext(row.organizationId, providerResult.signerName, row.recipientEmail),
    action: "status",
    entity: "SignatureRequest",
    entityId: row.id,
    summary: `El cliente firmó «${row.title}» (código ${row.publicCode})`,
    detail: {
      changes: { status: { from: status, to: "VALIDATED" } },
      fields: { identificador: providerResult.identifier, metodo: row.method, proveedor: providerResult.provider },
    },
  });

  await notifySignatureCompleted(row, providerResult.identifier);

  const view = await loadSignaturePortal(normalized);
  if (!view) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  return view;
}

/** Correo de finalización al cliente (evento real: enviado o fallido). */
async function notifySignatureCompleted(
  row: SignatureRequestRow,
  identifier: string,
): Promise<void> {
  if (!row.recipientEmail) return;
  const { buildSignatureCompletedMail, sendMail } = await import("../mail");
  const content = buildSignatureCompletedMail({
    organizationName: row.organization.name,
    title: row.title,
    recipientName: row.recipientName,
    code: row.publicCode,
    identifier,
    signedAt: new Date(),
  });
  const result = await sendMail({
    to: row.recipientEmail,
    subject: content.subject,
    category: "signature",
    html: content.html,
    text: content.text,
    organizationId: row.organizationId,
    entity: "SignatureRequest",
    entityId: row.id,
    actor: { name: row.senderName, email: row.senderEmail },
  });
  await appendSignatureEvent({
    requestId: row.id,
    organizationId: row.organizationId,
    eventType: result.status === "sent" ? "COMPLETION_EMAIL_SENT" : "EMAIL_FAILED",
    status: "VALIDATED",
    actor: { type: "SYSTEM" },
    metadata: {
      to: row.recipientEmail,
      motivo: result.status === "sent" ? null : result.error ?? "Sin proveedor de correo configurado",
    },
  });
}

/** Rechazo del cliente: bloquea la firma y guarda el motivo en la auditoría. */
export async function rejectSignatureRequest(input: SignatureActionInput): Promise<PortalSignatureRequest> {
  const normalized = normalizeSignatureCode(input.code);
  if (!normalized) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  await limitedOrThrow(`signature-reject-code:${normalized}`, 5);
  await limitedOrThrow(`signature-reject:${input.evidence.ipHash ?? "sin-ip"}`, 20);

  const row = await loadRow(normalized);
  if (!row) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  if (isDemoOrganizationSlug(row.organization.slug)) {
    throw new SignatureActionError(403, "El portal de ejemplo es de solo lectura.");
  }
  const status = row.status as SignatureStatusValue;
  if (signatureIsExpired(status, row.expiresAt, new Date())) {
    await expireSignatureRequest(row.id);
    throw new SignatureActionError(409, signatureBlockedReason("EXPIRED"));
  }
  if (!signatureCanReject(status)) throw new SignatureActionError(409, blockedMessage(status));

  const body = bodyRecord(input.body);
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 10) throw new SignatureActionError(400, "Contanos brevemente por qué no podés firmar (mínimo 10 caracteres).");
  if (reason.length > 600) throw new SignatureActionError(400, "El motivo no puede superar los 600 caracteres.");

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SignatureRequest" WHERE "id" = ${row.id} FOR UPDATE`;
    const fresh = await tx.signatureRequest.findUnique({ where: { id: row.id }, select: { status: true, expiresAt: true } });
    if (!fresh) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
    if (!signatureCanReject(fresh.status as SignatureStatusValue)) {
      throw new SignatureActionError(409, blockedMessage(fresh.status as SignatureStatusValue));
    }
    await tx.signatureRequest.update({
      where: { id: row.id },
      data: { status: "REJECTED", rejectedAt: now, rejectionReason: reason, viewedAt: row.viewedAt ?? now },
    });
    await appendSignatureEvent(
      {
        requestId: row.id,
        organizationId: row.organizationId,
        eventType: "REJECTED",
        status: "REJECTED",
        actor: { type: "CLIENT", name: row.recipientName },
        ipHash: input.evidence.ipHash,
        userAgentHash: input.evidence.userAgentHash,
        metadata: { motivo: reason },
        occurredAt: now,
      },
      tx,
    );
  });

  await recordAudit({
    context: portalAuditContext(row.organizationId, row.recipientName, row.recipientEmail),
    action: "status",
    entity: "SignatureRequest",
    entityId: row.id,
    summary: `El cliente rechazó la firma de «${row.title}» (código ${row.publicCode})`,
    detail: { changes: { status: { from: status, to: "REJECTED" } }, fields: { motivo: reason } },
  });

  const view = await loadSignaturePortal(normalized);
  if (!view) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  return view;
}

// ── OTP por correo ──────────────────────────────────────────────────────────

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

/**
 * Envía (o reenvía) el código OTP por correo. La solicitud tiene que estar
 * activa, con OTP configurado y correo del destinatario cargado.
 */
export async function sendSignatureOtp(input: {
  code: string;
  evidence: SignatureClientEvidence;
}): Promise<PortalSignatureRequest> {
  const normalized = normalizeSignatureCode(input.code);
  if (!normalized) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  await limitedOrThrow(`signature-otp-send:${normalized}`, 6);

  const row = await loadRow(normalized);
  if (!row) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  if (isDemoOrganizationSlug(row.organization.slug)) throw new SignatureActionError(403, "El portal de ejemplo es de solo lectura.");
  if (!row.otpRequired) throw new SignatureActionError(409, "Esta solicitud no pide verificación por código.");
  if (!row.recipientEmail) throw new SignatureActionError(409, "La solicitud no tiene un correo cargado para enviar el código.");
  const status = row.status as SignatureStatusValue;
  if (signatureIsExpired(status, row.expiresAt, new Date())) {
    await expireSignatureRequest(row.id);
    throw new SignatureActionError(409, signatureBlockedReason("EXPIRED"));
  }
  if (!signatureCanSign(status)) throw new SignatureActionError(409, blockedMessage(status));

  const { buildSignatureOtpMail, sendMail } = await import("../mail");
  const { randomInt } = await import("node:crypto");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const content = buildSignatureOtpMail({ organizationName: row.organization.name, title: row.title, code, expiresInMinutes: OTP_TTL_MS / 60_000 });
  const result = await sendMail({
    to: row.recipientEmail,
    subject: content.subject,
    category: "signature",
    html: content.html,
    text: content.text,
    organizationId: row.organizationId,
    entity: "SignatureRequest",
    entityId: row.id,
    actor: { name: row.senderName, email: row.senderEmail },
  });
  if (result.status !== "sent") {
    await appendSignatureEvent({
      requestId: row.id,
      organizationId: row.organizationId,
      eventType: "EMAIL_FAILED",
      status: row.status,
      actor: { type: "SYSTEM" },
      metadata: { to: row.recipientEmail, motivo: result.error ?? "Sin proveedor de correo configurado" },
    });
    throw new SignatureActionError(
      502,
      result.error ? `No pudimos enviar el código: ${result.error}` : "El correo no está configurado; pedinos el código a otro canal.",
    );
  }
  await db.signatureRequest.update({
    where: { id: row.id },
    data: { otpCodeHash: otpCodeHash(code), otpExpiresAt: expiresAt, otpAttempts: 0, otpSentAt: new Date() },
  });
  await appendSignatureEvent({
    requestId: row.id,
    organizationId: row.organizationId,
    eventType: "OTP_SENT",
    status: row.status,
    actor: { type: "SYSTEM" },
    metadata: { destino: row.recipientEmail, expiraEnMinutos: OTP_TTL_MS / 60_000 },
  });
  const view = await loadSignaturePortal(normalized);
  if (!view) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  return view;
}

function otpCodeHash(code: string): string {
  // El código OTP es corto: se hashea con el pepper del portal (no queda en claro).
  return createHmac("sha256", process.env.SIGNATURE_HASH_PEPPER || process.env.AUTH_SECRET || "ledbox-signature-dev-pepper")
    .update(`otp:${code}`)
    .digest("hex");
}

/** Verifica el código OTP y habilita la firma (`otpVerifiedAt`). */
export async function verifySignatureOtp(input: { code: string; evidence: SignatureClientEvidence; otp: string }): Promise<void> {
  const normalized = normalizeSignatureCode(input.code);
  if (!normalized) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  await limitedOrThrow(`signature-otp-verify:${normalized}`, 12);
  await limitedOrThrow(`signature-otp-verify-ip:${input.evidence.ipHash ?? "sin-ip"}`, 30);

  const row = await loadRow(normalized);
  if (!row) throw new SignatureActionError(404, "El enlace no es válido o la solicitud no existe.");
  if (!row.otpRequired) throw new SignatureActionError(409, "Esta solicitud no pide verificación por código.");
  const status = row.status as SignatureStatusValue;
  if (signatureIsExpired(status, row.expiresAt, new Date())) {
    await expireSignatureRequest(row.id);
    throw new SignatureActionError(409, signatureBlockedReason("EXPIRED"));
  }
  if (!signatureCanSign(status)) throw new SignatureActionError(409, blockedMessage(status));
  if (!row.otpCodeHash || !row.otpExpiresAt || row.otpExpiresAt.getTime() <= Date.now()) {
    throw new SignatureActionError(409, "El código venció o todavía no te enviamos uno. Pedí un código nuevo.");
  }
  if (row.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw new SignatureActionError(429, "Demasiados intentos con el código. Pedí uno nuevo.");
  }
  const otp = String(input.otp ?? "").replace(/\D/g, "");
  if (otp.length !== 6 || otpCodeHash(otp) !== row.otpCodeHash) {
    await db.signatureRequest.update({ where: { id: row.id }, data: { otpAttempts: { increment: 1 } } });
    await appendSignatureEvent({
      requestId: row.id,
      organizationId: row.organizationId,
      eventType: "OTP_FAILED",
      status: row.status,
      actor: { type: "CLIENT", name: row.recipientName },
      ipHash: input.evidence.ipHash,
      userAgentHash: input.evidence.userAgentHash,
      metadata: { intento: row.otpAttempts + 1 },
    });
    throw new SignatureActionError(400, "El código no es correcto. Revisalo y probá de nuevo.");
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.signatureRequest.update({
      where: { id: row.id },
      data: { otpVerifiedAt: now, otpCodeHash: null, otpAttempts: 0 },
    });
    await tx.signatureEvidence.updateMany({
      where: { requestId: row.id, type: "OTP" },
      data: { status: "COMPLETED", capturedAt: now, providerReference: "email" },
    });
    await appendSignatureEvent(
      {
        requestId: row.id,
        organizationId: row.organizationId,
        eventType: "OTP_VALIDATED",
        status: row.status,
        actor: { type: "CLIENT", name: row.recipientName },
        ipHash: input.evidence.ipHash,
        userAgentHash: input.evidence.userAgentHash,
        occurredAt: now,
      },
      tx,
    );
  });
}
