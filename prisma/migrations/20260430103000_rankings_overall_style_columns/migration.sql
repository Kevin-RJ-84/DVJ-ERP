-- Replace single ambiguous Rank with OverallRank + StyleRank

ALTER TABLE "customer_rankings" ADD COLUMN "OverallRank" INTEGER;
ALTER TABLE "customer_rankings" ADD COLUMN "StyleRank" INTEGER;

UPDATE "customer_rankings" SET "OverallRank" = "Rank" WHERE "StyleNo" IS NULL;
UPDATE "customer_rankings" SET "StyleRank" = "Rank" WHERE "StyleNo" IS NOT NULL;

UPDATE "customer_rankings" AS cr
SET "OverallRank" = ov."OverallRank"
FROM "customer_rankings" AS ov
WHERE ov."ClientID" = cr."ClientID"
  AND ov."StyleNo" IS NULL
  AND cr."StyleNo" IS NOT NULL;

ALTER TABLE "customer_rankings" DROP COLUMN "Rank";

DROP INDEX IF EXISTS "customer_rankings_Rank_idx";

CREATE INDEX "customer_rankings_OverallRank_idx" ON "customer_rankings" ("OverallRank");
CREATE INDEX "customer_rankings_StyleRank_idx" ON "customer_rankings" ("StyleRank");
