-- AlterTable
ALTER TABLE "stock" ADD COLUMN "MemoInvNo" VARCHAR;

-- CreateIndex
CREATE INDEX "stock_MemoInvNo_idx" ON "stock"("MemoInvNo");
