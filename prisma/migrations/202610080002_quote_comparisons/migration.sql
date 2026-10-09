CREATE TABLE IF NOT EXISTS "QuoteComparison" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "clientId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "publicToken" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), "selectedBudgetId" TEXT, "selectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteComparison_publicToken_key" ON "QuoteComparison"("publicToken");
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteComparison_selectedBudgetId_key" ON "QuoteComparison"("selectedBudgetId");
CREATE INDEX IF NOT EXISTS "QuoteComparison_organizationId_createdAt_idx" ON "QuoteComparison"("organizationId","createdAt");
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "comparisonId" TEXT REFERENCES "QuoteComparison"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "comparisonLabel" TEXT;
CREATE INDEX IF NOT EXISTS "Budget_comparisonId_idx" ON "Budget"("comparisonId");
-- Defense in depth: even an accidental approval write cannot approve two members.
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_comparison_one_approved_idx" ON "Budget"("comparisonId")
 WHERE "comparisonId" IS NOT NULL AND ("approvedAt" IS NOT NULL OR "status" = 'APPROVED');
