-- AlterTable
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "ProductStyle" VARCHAR;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "StoneType" VARCHAR;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "MetalPurity" VARCHAR;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "ClientID" UUID;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "SyncSource" VARCHAR;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_ClientID_fkey'
  ) THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_ClientID_fkey"
      FOREIGN KEY ("ClientID") REFERENCES "clients"("ClientID")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sales_ClientID_idx" ON "sales"("ClientID");
