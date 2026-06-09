-- Add the stock-keyed memo column used by stock uploads when memo numbers are absent.
ALTER TABLE "memo" ADD COLUMN IF NOT EXISTS "StockNo" VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS "memo_StockNo_key" ON "memo"("StockNo");

DO $$ BEGIN
  ALTER TABLE "memo"
    ADD CONSTRAINT "memo_StockNo_fkey"
    FOREIGN KEY ("StockNo") REFERENCES "stock"("StockNo")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
