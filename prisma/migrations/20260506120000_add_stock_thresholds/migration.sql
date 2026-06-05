-- CreateTable
CREATE TABLE "stock_thresholds" (
    "ThresholdID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "StyleNo" VARCHAR NOT NULL,
    "MinQuantity" INTEGER NOT NULL,
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedByID" UUID,

    CONSTRAINT "stock_thresholds_pkey" PRIMARY KEY ("ThresholdID")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_thresholds_StyleNo_key" ON "stock_thresholds"("StyleNo");
