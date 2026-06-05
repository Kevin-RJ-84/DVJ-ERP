-- Denormalized style on sales for reporting; populated from stock by StockNo and kept in sync on import.
ALTER TABLE "sales" ADD COLUMN "StyleNo" VARCHAR;

UPDATE "sales" AS s
SET "StyleNo" = st."StyleNo"
FROM "stock" AS st
WHERE s."StockNo" IS NOT NULL
  AND s."StockNo" = st."StockNo";

CREATE INDEX "sales_StyleNo_idx" ON "sales" ("StyleNo");
