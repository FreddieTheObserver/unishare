-- AlterTable
-- Links a university to its uniauth organization, where memberships now live. Null until the
-- phase 5 import maps each university; no backfill here.
ALTER TABLE "university" ADD COLUMN "uniauthOrgId" TEXT;

-- CreateIndex
-- Unique: a membership resolves to exactly one local university.
CREATE UNIQUE INDEX "university_uniauthOrgId_key" ON "university"("uniauthOrgId");
