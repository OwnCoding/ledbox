-- Portal de firma de clientes (issue #79): solicitud, cadena de auditoría
-- append-only y evidencias.
--
-- Aditiva e idempotente: enums con guard `duplicate_object`, tablas con
-- `CREATE TABLE IF NOT EXISTS`, índices con `IF NOT EXISTS` y FKs con guard.
-- Re-ejecutarla no cambia datos ni rompe nada. `MailCategory` suma la categoría
-- `signature` para el correo de la solicitud (ALTER TYPE … ADD VALUE, PG 12+).

DO $$ BEGIN
  CREATE TYPE "SignatureRequestStatus" AS ENUM (
    'DRAFT', 'SENT', 'DELIVERED', 'VIEWED', 'PENDING_SIGNATURE', 'SIGNING',
    'SIGNED', 'VALIDATED', 'REJECTED', 'EXPIRED', 'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureMethod" AS ENUM ('DRAWN', 'TYPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureEventType" AS ENUM (
    'REQUEST_CREATED', 'DOCUMENT_UPDATED', 'EMAIL_SENT', 'EMAIL_FAILED',
    'SMS_SENT', 'VIEWED', 'CONSENT_ACCEPTED', 'SIGNING_STARTED',
    'SIGNATURE_RECEIVED', 'OTP_SENT', 'OTP_VALIDATED', 'OTP_FAILED',
    'EVIDENCE_RECEIVED', 'TIMESTAMP_APPLIED', 'DOCUMENT_VALIDATED',
    'AUDIT_GENERATED', 'COMPLETION_EMAIL_SENT', 'REJECTED', 'CANCELLED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureActorType" AS ENUM ('SYSTEM', 'ADMIN', 'CLIENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureEvidenceType" AS ENUM ('SIGNATURE', 'OTP', 'PHOTO', 'TIMESTAMP', 'SEAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureEvidenceStatus" AS ENUM ('PENDING', 'OPTIONAL', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "MailCategory" ADD VALUE IF NOT EXISTS 'signature';

CREATE TABLE IF NOT EXISTS "SignatureRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "attachmentId" TEXT,
    "publicCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'SENT',
    "method" "SignatureMethod" NOT NULL DEFAULT 'DRAWN',
    "otpRequired" BOOLEAN NOT NULL DEFAULT false,
    "otpCodeHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSentAt" TIMESTAMP(3),
    "otpVerifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "consentedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "cancelReason" TEXT,
    "documentHash" TEXT NOT NULL,
    "documentHashCapturedAt" TIMESTAMP(3) NOT NULL,
    "signedDocumentHash" TEXT,
    "signatureProvider" TEXT NOT NULL DEFAULT 'local',
    "signatureIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SignatureRequest_publicCode_key" ON "SignatureRequest"("publicCode");
CREATE INDEX IF NOT EXISTS "SignatureRequest_organizationId_status_createdAt_idx" ON "SignatureRequest"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SignatureRequest_budgetId_createdAt_idx" ON "SignatureRequest"("budgetId", "createdAt");
CREATE INDEX IF NOT EXISTS "SignatureRequest_expiresAt_idx" ON "SignatureRequest"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "BudgetAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SignatureEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventType" "SignatureEventType" NOT NULL,
    "status" "SignatureRequestStatus",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "SignatureActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "actorName" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadataJson" JSONB,
    "previousEventHash" TEXT,
    "eventHash" TEXT NOT NULL,

    CONSTRAINT "SignatureEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignatureEvent_requestId_occurredAt_idx" ON "SignatureEvent"("requestId", "occurredAt");
CREATE INDEX IF NOT EXISTS "SignatureEvent_organizationId_occurredAt_idx" ON "SignatureEvent"("organizationId", "occurredAt");

DO $$ BEGIN
  ALTER TABLE "SignatureEvent" ADD CONSTRAINT "SignatureEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SignatureEvent" ADD CONSTRAINT "SignatureEvent_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SignatureEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "SignatureEvidenceType" NOT NULL,
    "status" "SignatureEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "data" BYTEA,
    "capturedAt" TIMESTAMP(3),
    "providerReference" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignatureEvidence_requestId_type_idx" ON "SignatureEvidence"("requestId", "type");

DO $$ BEGIN
  ALTER TABLE "SignatureEvidence" ADD CONSTRAINT "SignatureEvidence_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SignatureEvidence" ADD CONSTRAINT "SignatureEvidence_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
