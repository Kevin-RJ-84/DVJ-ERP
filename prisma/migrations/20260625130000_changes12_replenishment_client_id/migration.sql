-- AlterTable
ALTER TABLE "replenishment_items" ADD COLUMN "ClientID" UUID;

-- CreateIndex
CREATE INDEX "replenishment_items_ClientID_idx" ON "replenishment_items"("ClientID");

-- AddForeignKey
ALTER TABLE "replenishment_items" ADD CONSTRAINT "replenishment_items_ClientID_fkey" FOREIGN KEY ("ClientID") REFERENCES "clients"("ClientID") ON DELETE SET NULL ON UPDATE CASCADE;
