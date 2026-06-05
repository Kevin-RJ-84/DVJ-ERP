-- AlterTable: stock — ERP API sync columns (Metal already exists, omitted)
ALTER TABLE "stock" ADD COLUMN "Size" VARCHAR;
ALTER TABLE "stock" ADD COLUMN "StoneType" VARCHAR;
ALTER TABLE "stock" ADD COLUMN "StockValue" DECIMAL(12,2);
ALTER TABLE "stock" ADD COLUMN "MetalPurity" VARCHAR;
ALTER TABLE "stock" ADD COLUMN "HoldSoldRemark" VARCHAR;
ALTER TABLE "stock" ADD COLUMN "HoldSoldDate" DATE;
ALTER TABLE "stock" ADD COLUMN "LastSyncedAt" TIMESTAMP(6);
ALTER TABLE "stock" ADD COLUMN "SyncSource" VARCHAR;

-- CreateTable: stock_forecast_accuracy (Phase 2 feedback loop — built now, activated later)
CREATE TABLE "stock_forecast_accuracy" (
    "AccuracyID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "StyleNo" VARCHAR NOT NULL,
    "ForecastMonth" DATE NOT NULL,
    "PredictedThreshold" INTEGER NOT NULL,
    "ActualSold" INTEGER,
    "Error" INTEGER,
    "ErrorPct" DECIMAL(8,4),
    "Method1Result" INTEGER,
    "Method2Result" INTEGER,
    "StockClass" VARCHAR NOT NULL,
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_forecast_accuracy_pkey" PRIMARY KEY ("AccuracyID")
);

-- CreateIndex
CREATE INDEX "stock_forecast_accuracy_StyleNo_idx" ON "stock_forecast_accuracy"("StyleNo");

-- CreateIndex
CREATE INDEX "stock_forecast_accuracy_ForecastMonth_idx" ON "stock_forecast_accuracy"("ForecastMonth");
