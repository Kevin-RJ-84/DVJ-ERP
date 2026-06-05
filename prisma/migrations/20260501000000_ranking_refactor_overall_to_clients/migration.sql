-- Migration: ranking_refactor_overall_to_clients
-- Move OverallRank from customer_rankings to clients table.
-- Overall rank is now a first-class attribute of a client, not a rankings row.

-- Add overall ranking columns to clients
ALTER TABLE "clients" ADD COLUMN "OverallRank"  INTEGER;
ALTER TABLE "clients" ADD COLUMN "OverallScore" DECIMAL(14,4);
ALTER TABLE "clients" ADD COLUMN "LastRankedAt" TIMESTAMP(6);

-- Index for rank-ordered client lookups
CREATE INDEX "idx_clients_overall_rank" ON "clients"("OverallRank");

-- Drop OverallRank from customer_rankings (now on clients)
ALTER TABLE "customer_rankings" DROP COLUMN IF EXISTS "OverallRank";

-- Drop index that no longer has a backing column
DROP INDEX IF EXISTS "customer_rankings_OverallRank_idx";

-- Remove stale overall rows (StyleNo IS NULL) — overall rank now lives on clients
DELETE FROM "customer_rankings" WHERE "StyleNo" IS NULL;
