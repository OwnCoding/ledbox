import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { computeSignatureEventHash } from "./hash";
import type { SignatureEventTypeValue, SignatureStatusValue } from "./rules";

/**
 * Escritura de la cadena de auditoría de firma (issue #79): **append-only**.
 * Este módulo es el único que inserta `SignatureEvent`; nada la actualiza ni la
 * borra. Cada inserción:
 *
 * 1. Bloquea la solicitud (`SELECT … FOR UPDATE`) para serializar las
 *    inserciones concurrentes de la misma solicitud.
 * 2. Toma el hash del último evento.
 * 3. Hashea el evento nuevo encadenado (`computeSignatureEventHash`) y lo
 *    inserta con su `occurredAt` estrictamente posterior al anterior, para que
 *    el orden de la cadena sea estable aunque dos eventos caigan en el mismo
 *    milisegundo.
 *
 * `appendSignatureEvent` acepta un cliente de transacción: cuando la firma o la
 * cancelación ya corren en una transacción, los eventos se confirman con el
 * cambio de estado (o no se confirma nada). Sin cliente abre su propia
 * transacción.
 */

export type SignatureActorTypeValue = "SYSTEM" | "ADMIN" | "CLIENT";

export type SignatureActorInput = {
  type: SignatureActorTypeValue;
  id?: string | null;
  name?: string | null;
};

export type AppendSignatureEventInput = {
  requestId: string;
  organizationId: string;
  eventType: SignatureEventTypeValue;
  status?: SignatureStatusValue | null;
  actor?: SignatureActorInput;
  ipHash?: string | null;
  userAgentHash?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Instante pedido; se corre 1 ms si no supera al evento anterior. */
  occurredAt?: Date;
};

export type AppendedSignatureEvent = {
  id: string;
  occurredAt: Date;
  eventHash: string;
  previousEventHash: string | null;
};

type Tx = Prisma.TransactionClient;

/** Bloquea la solicitud dentro de una transacción (serializa los appends). */
export async function lockSignatureRequest(tx: Tx, requestId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "SignatureRequest" WHERE "id" = ${requestId} FOR UPDATE`;
}

/** `occurredAt` estrictamente posterior al último evento (orden de cadena estable). */
export function nextSignatureEventTime(lastOccurredAt: Date | null, requested: Date): Date {
  if (!lastOccurredAt) return requested;
  return lastOccurredAt.getTime() >= requested.getTime() ? new Date(lastOccurredAt.getTime() + 1) : requested;
}

async function appendWithClient(tx: Tx, input: AppendSignatureEventInput): Promise<AppendedSignatureEvent> {
  const last = await tx.signatureEvent.findFirst({
    where: { requestId: input.requestId },
    orderBy: { occurredAt: "desc" },
    select: { eventHash: true, occurredAt: true },
  });
  const occurredAt = nextSignatureEventTime(last?.occurredAt ?? null, input.occurredAt ?? new Date());
  const id = randomUUID();
  const previousEventHash = last?.eventHash ?? null;
  const actorType = input.actor?.type ?? "SYSTEM";
  const actorId = input.actor?.id ?? null;
  const actorName = input.actor?.name ?? null;
  const metadataJson = (input.metadata ?? null) as Prisma.InputJsonValue;
  const eventHash = computeSignatureEventHash(
    {
      id,
      requestId: input.requestId,
      eventType: input.eventType,
      status: input.status ?? null,
      occurredAt,
      actorType,
      actorId,
      actorName,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      metadataJson: input.metadata ?? null,
    },
    previousEventHash,
  );
  await tx.signatureEvent.create({
    data: {
      id,
      organizationId: input.organizationId,
      requestId: input.requestId,
      eventType: input.eventType,
      status: input.status ?? null,
      occurredAt,
      actorType,
      actorId,
      actorName,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      metadataJson,
      previousEventHash,
      eventHash,
    },
  });
  return { id, occurredAt, eventHash, previousEventHash };
}

/**
 * Inserta un evento en la cadena. Con `tx` el llamador ya bloqueó la solicitud
 * (misma transacción que el cambio de estado); sin `tx` abre su transacción.
 */
export async function appendSignatureEvent(
  input: AppendSignatureEventInput,
  tx?: Tx,
): Promise<AppendedSignatureEvent> {
  if (tx) {
    await lockSignatureRequest(tx, input.requestId);
    return appendWithClient(tx, input);
  }
  return db.$transaction(async (client) => {
    await lockSignatureRequest(client, input.requestId);
    return appendWithClient(client, input);
  });
}
