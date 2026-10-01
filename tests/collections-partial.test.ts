import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { expectedPaymentStatusLabel, expectedPaymentStatusTone } from "../lib/admin-format";
import { expectedPaymentNeedsAction } from "../lib/admin-types";
import { portalBudgetView } from "../lib/server/budget-portal";

/**
 * Cobros parciales/seña y métodos con cuentas de la empresa (issue #129):
 * el pago esperado suma `paidAmount` y el estado `PARTIAL`; el saldo se
 * completa con otro cobro o se divide en partes; la seña de un cobro libre deja
 * el saldo como cobro a plazo; y el contrato de métodos/cuentas expone las
 * cuentas reales (banco, número, alias) para el panel y la carga con IA.
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("el estado parcial se lee y reclama acción como un vencido por cobrar", () => {
  assert.equal(expectedPaymentStatusLabel("PARTIAL"), "Parcial (seña)");
  assert.equal(expectedPaymentStatusTone("PARTIAL"), "accent");
  assert.equal(expectedPaymentNeedsAction({ status: "PARTIAL", dueAt: "2020-01-01" }), true);
  assert.equal(expectedPaymentNeedsAction({ status: "PARTIAL", dueAt: "2999-01-01" }), false);
});

test("el portal muestra la seña con su saldo pendiente (issue #129)", () => {
  const view = portalBudgetView(
    {
      id: "bud_partial",
      organizationId: "org_1",
      title: "Seña para evento",
      status: "APPROVED",
      subtotal: 12_000_000,
      discount: 0,
      total: 12_000_000,
      advanceAmount: 4_000_000,
      paymentTerms: null,
      installmentsJson: [],
      validUntil: null,
      deliveryAt: null,
      ivaType: null,
      warranty: null,
      notes: null,
      createdAt: new Date("2026-10-01T12:00:00.000Z"),
      viewedAt: null,
      approvedAt: new Date("2026-10-01T12:00:00.000Z"),
      approvedByName: "Ana",
      approvalMethod: "digital",
      approvalNote: null,
      revisionRequestedAt: null,
      revisionNote: null,
      organization: { name: "LedBox", slug: "ledbox", paymentDetails: null },
      client: { name: "Ana", company: null, contactName: null, contactRole: null },
      event: null,
      items: [],
      payments: [],
      expectedPayments: [
        {
          id: "exp_advance",
          concept: "advance",
          installmentNumber: null,
          label: "Anticipo",
          amount: 4_000_000,
          paidAmount: 1_000_000,
          dueAt: new Date("2026-10-01T12:00:00.000Z"),
          status: "PARTIAL",
          reviewNote: null,
          reviewedAt: null,
          confirmedAt: null,
          confirmedByName: null,
          proofId: null,
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
          expectedAccount: { name: "Ueno Bank" },
        },
      ],
      paymentProofs: [],
      changeRequests: [],
    } as never,
    [],
  );

  const expected = view.expectedPayments[0];
  assert.equal(expected.status, "PARTIAL");
  assert.equal(expected.paidAmount, 1_000_000);
  assert.equal(expected.remaining, 3_000_000);
});

test("la confirmación parcial y la división del saldo quedan fijadas en el servidor", () => {
  const source = repoFile("lib/server/expected-payments.ts");
  // Monto parcial validado contra el saldo, con candado por `paidAmount`.
  assert.match(source, /const remaining = Math\.max\(0, expected\.amount - expected\.paidAmount\)/);
  assert.match(source, /El monto no puede superar el saldo pendiente/);
  assert.match(source, /paidAmount: expected\.paidAmount,/);
  assert.match(source, /status: "PARTIAL",\n\s+paidAmount: expected\.paidAmount \+ appliedAmount/);
  // Snapshot y vínculo del cobro parcial.
  assert.match(source, /collectedSnapshot: snapshot as unknown as Prisma\.InputJsonValue/);
  assert.match(source, /expectedPaymentId: expected\.id/);
  // División en partes que suman el saldo, con tope y auditoría.
  assert.match(source, /export async function splitExpectedPayment\(/);
  assert.match(source, /export const MAX_SPLIT_PARTS = 12;/);
  assert.match(source, /Las partes tienen que sumar el saldo pendiente/);
  assert.match(source, /slot: `split:\$\{randomUUID\(\)\}`/);
  // El plan automático no pisa lo parcial ni las partes manuales.
  assert.match(source, /current\.status === "CONFIRMED" \|\| current\.status === "PARTIAL"/);
  assert.match(source, /row\.slot\.startsWith\("split:"\)/);
});

test("los endpoints exponen el parcial, la división y el contrato de métodos/cuentas", () => {
  const expected = repoFile("app/api/admin/finance/expected/route.ts");
  assert.match(expected, /kind === "split"/);
  assert.match(expected, /amount: Number\(payload\.amount\) \|\| undefined|amount,$/m);
  assert.match(expected, /partial: \{ count: 0, total: 0 \}/);
  assert.match(expected, /splitExpectedPayment/);

  const options = repoFile("app/api/admin/finance/options/route.ts");
  assert.match(options, /methods: PAYMENT_METHODS/);
  assert.match(options, /termMethods: TERM_PAYMENT_METHODS/);
  assert.match(options, /select: \{ id: true, name: true, type: true, bank: true, number: true, alias: true, currency: true \}/);

  const finance = repoFile("app/api/admin/finance/route.ts");
  assert.match(finance, /totalAmount/, "la seña de un cobro libre acepta el total acordado");
  assert.match(finance, /notes: "Saldo pendiente de la seña"/);

  const treasury = repoFile("app/api/admin/treasury/route.ts");
  assert.match(treasury, /const number = optionalText\(body\.number, MAX_ACCOUNT_NUMBER\)/);
  assert.match(treasury, /const alias = optionalText\(body\.alias, MAX_ACCOUNT_ALIAS\)/);
});

test("la migración es aditiva y trae el estado, el acumulado y los datos de cuenta", () => {
  const migration = repoFile("prisma/migrations/202610010005_partial_payments_accounts/migration.sql");
  assert.match(migration, /ALTER TYPE "ExpectedPaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';/);
  assert.match(migration, /ALTER TABLE "ExpectedPayment" ADD COLUMN IF NOT EXISTS "paidAmount" INTEGER NOT NULL DEFAULT 0;/);
  assert.match(migration, /ALTER TABLE "ClientPayment" ADD COLUMN IF NOT EXISTS "expectedPaymentId" TEXT;/);
  assert.match(migration, /ALTER TABLE "TreasuryAccount" ADD COLUMN IF NOT EXISTS "number" TEXT;/);
  assert.match(migration, /ALTER TABLE "TreasuryAccount" ADD COLUMN IF NOT EXISTS "alias" TEXT;/);
});

test("el panel usa las cuentas reales y ofrece el monto de la seña y la división", () => {
  const module = repoFile("components/admin/modules/FinanzasModule.tsx");
  // El selector de cuenta muestra banco y número/alias (issue #129).
  assert.match(module, /function treasuryAccountLabel\(/);
  assert.match(module, /account\.number \?\? account\.alias/);
  // El diálogo de confirmación deja elegir el monto (seña) y el método.
  assert.match(module, /label="Monto a confirmar"/);
  assert.match(module, /menos que eso registra una seña/);
  assert.match(module, /label="Método"/);
  // La división del saldo tiene su diálogo y su acción por fila.
  assert.match(module, /function ExpectedSplitDialog\(/);
  assert.match(module, /kind: "split"/);
  assert.match(module, /Dividir el saldo de/);
  // La seña de un cobro libre declara el total acordado y el vencimiento del saldo.
  assert.match(module, /label="Total acordado \(seña\)"/);
  assert.match(module, /label="Vence el saldo"/);
});
