-- AlterTable
ALTER TABLE "replenishment_items" ADD COLUMN     "LastRescannedAt" TIMESTAMP(6),
ADD COLUMN     "LastRescannedBy" UUID,
ADD COLUMN     "ReplenishmentType" VARCHAR NOT NULL DEFAULT 'invoice',
ADD COLUMN     "RescanCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "StyleUploadRef" VARCHAR;

-- CreateTable
CREATE TABLE "replenishment_rescan_log" (
    "RescanLogID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ItemID" UUID NOT NULL,
    "StyleUploadRef" VARCHAR,
    "InvoiceNo" VARCHAR,
    "StyleNo" VARCHAR NOT NULL,
    "OldStatus" VARCHAR NOT NULL,
    "NewStatus" VARCHAR NOT NULL,
    "OldStockNo" VARCHAR,
    "NewStockNo" VARCHAR,
    "ChangedBy" UUID NOT NULL,
    "ChangedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Notes" TEXT,

    CONSTRAINT "replenishment_rescan_log_pkey" PRIMARY KEY ("RescanLogID")
);

-- CreateIndex
CREATE INDEX "replenishment_rescan_log_ItemID_idx" ON "replenishment_rescan_log"("ItemID");

-- CreateIndex
CREATE INDEX "replenishment_rescan_log_StyleUploadRef_idx" ON "replenishment_rescan_log"("StyleUploadRef");

-- CreateIndex
CREATE INDEX "replenishment_rescan_log_InvoiceNo_idx" ON "replenishment_rescan_log"("InvoiceNo");

-- CreateIndex
CREATE INDEX "replenishment_rescan_log_ChangedAt_idx" ON "replenishment_rescan_log"("ChangedAt");

-- CreateIndex
CREATE INDEX "replenishment_items_StyleUploadRef_idx" ON "replenishment_items"("StyleUploadRef");

-- AddForeignKey
ALTER TABLE "replenishment_items" ADD CONSTRAINT "replenishment_items_LastRescannedBy_fkey" FOREIGN KEY ("LastRescannedBy") REFERENCES "users"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replenishment_rescan_log" ADD CONSTRAINT "replenishment_rescan_log_ItemID_fkey" FOREIGN KEY ("ItemID") REFERENCES "replenishment_items"("ItemID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replenishment_rescan_log" ADD CONSTRAINT "replenishment_rescan_log_ChangedBy_fkey" FOREIGN KEY ("ChangedBy") REFERENCES "users"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;
