ALTER TABLE "BudgetAttachment" ADD COLUMN IF NOT EXISTS "clientVisible" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "BudgetReferenceLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "clientVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BudgetReferenceLink_organizationId_budgetId_createdAt_idx" ON "BudgetReferenceLink"("organizationId", "budgetId", "createdAt");
