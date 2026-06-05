-- AlterTable
ALTER TABLE "excel_mappings" ADD COLUMN "LastImportAt" TIMESTAMP(6),
ADD COLUMN "LastImportInserted" INTEGER,
ADD COLUMN "LastImportUpdated" INTEGER;
