-- AlterTable
ALTER TABLE "memo_stock" ADD COLUMN "Status" VARCHAR NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "memo_stock" ADD COLUMN "InvoiceNo" VARCHAR;

-- AlterTable
ALTER TABLE "memo_stock" ADD COLUMN "StatusNote" VARCHAR;

-- AlterTable
ALTER TABLE "memo_stock" ADD COLUMN "UpdatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "stock" ADD COLUMN "IsMissing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock" ADD COLUMN "MissingNote" VARCHAR;
