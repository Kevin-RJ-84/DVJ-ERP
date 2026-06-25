-- AlterTable: stock — CHANGES-11 Part 1 (HoldCompany, MemoPrice)
ALTER TABLE "stock" ADD COLUMN "HoldCompany" VARCHAR;
ALTER TABLE "stock" ADD COLUMN "MemoPrice" DECIMAL(12,2);
