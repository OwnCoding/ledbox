-- Cobros parciales/seña y métodos con cuentas de la empresa (issue #129).
--
-- Aditiva, idempotente y re-ejecutable:
-- 1. El pago esperado suma `paidAmount` (lo ya cobrado contra el concepto) y el
--    estado `PARTIAL` para la seña con saldo pendiente.
-- 2. El cobro (`ClientPayment`) puede imputarse a un pago esperado
--    (`expectedPaymentId`, N:1): la seña y cada parte quedan enlazadas; el
--    vínculo 1:1 que confirma el concepto (`ExpectedPayment.paymentId`) sigue
--    igual para la confirmación total.
-- 3. La cuenta de tesorería suma `number` y `alias` para compartir los datos de
--    transferencia en el contrato de métodos/cuentas.

ALTER TYPE "ExpectedPaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TABLE "ExpectedPayment" ADD COLUMN IF NOT EXISTS "paidAmount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "expectedPaymentId" TEXT;
CREATE INDEX IF NOT EXISTS "ClientPayment_expectedPaymentId_idx" ON "ClientPayment"("expectedPaymentId");
DO $$ BEGIN
  ALTER TABLE "ClientPayment"
    ADD CONSTRAINT "ClientPayment_expectedPaymentId_fkey"
    FOREIGN KEY ("expectedPaymentId") REFERENCES "ExpectedPayment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TreasuryAccount" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "TreasuryAccount" ADD COLUMN IF NOT EXISTS "alias" TEXT;
