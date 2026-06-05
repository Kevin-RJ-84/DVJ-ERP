-- CreateTable: replenishments
CREATE TABLE "replenishments" (
    "ReplenishmentID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "InvoiceNo" VARCHAR NOT NULL,
    "GroupField" VARCHAR NOT NULL,
    "GroupValue" VARCHAR NOT NULL,
    "StockNo" VARCHAR NOT NULL,
    "Type" VARCHAR NOT NULL,
    "ReplenishedBy" UUID NOT NULL,
    "ReplenishedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "IsUndone" BOOLEAN NOT NULL DEFAULT false,
    "UndoneBy" UUID,
    "UndoneAt" TIMESTAMP(6),

    CONSTRAINT "replenishments_pkey" PRIMARY KEY ("ReplenishmentID")
);

-- CreateIndex
CREATE INDEX "replenishments_InvoiceNo_idx" ON "replenishments"("InvoiceNo");
CREATE INDEX "replenishments_GroupValue_idx" ON "replenishments"("GroupValue");
CREATE INDEX "replenishments_StockNo_idx" ON "replenishments"("StockNo");

-- AddForeignKey
ALTER TABLE "replenishments" ADD CONSTRAINT "replenishments_ReplenishedBy_fkey" FOREIGN KEY ("ReplenishedBy") REFERENCES "users"("UserID") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replenishments" ADD CONSTRAINT "replenishments_UndoneBy_fkey" FOREIGN KEY ("UndoneBy") REFERENCES "users"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: customer_rankings
CREATE TABLE "customer_rankings" (
    "RankingID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ClientID" UUID NOT NULL,
    "StyleNo" VARCHAR,
    "TotalPiecesSold" INTEGER NOT NULL DEFAULT 0,
    "TotalValueSold" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "TotalProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "CombinedScore" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "Rank" INTEGER NOT NULL DEFAULT 0,
    "LastCalculatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_rankings_pkey" PRIMARY KEY ("RankingID")
);

-- Unique constraint on (ClientID, StyleNo):
-- Two partial indexes handle NULL correctly — standard UNIQUE skips NULL equality in PG.
-- Non-null StyleNo rows: one per (client, style).
-- NULL StyleNo rows (overall ranking): one per client.
CREATE UNIQUE INDEX "customer_rankings_ClientID_StyleNo_key" ON "customer_rankings"("ClientID", "StyleNo") WHERE "StyleNo" IS NOT NULL;
CREATE UNIQUE INDEX "customer_rankings_ClientID_overall_key" ON "customer_rankings"("ClientID") WHERE "StyleNo" IS NULL;

-- CreateIndex
CREATE INDEX "customer_rankings_ClientID_idx" ON "customer_rankings"("ClientID");
CREATE INDEX "customer_rankings_StyleNo_idx" ON "customer_rankings"("StyleNo");
CREATE INDEX "customer_rankings_Rank_idx" ON "customer_rankings"("Rank");

-- AddForeignKey
ALTER TABLE "customer_rankings" ADD CONSTRAINT "customer_rankings_ClientID_fkey" FOREIGN KEY ("ClientID") REFERENCES "clients"("ClientID") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: system_config
CREATE TABLE "system_config" (
    "ConfigID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ConfigKey" VARCHAR NOT NULL,
    "ConfigValue" TEXT NOT NULL,
    "ConfigType" VARCHAR NOT NULL,
    "Description" VARCHAR,
    "Module" VARCHAR NOT NULL,
    "UpdatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedByID" UUID,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("ConfigID")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_config_ConfigKey_key" ON "system_config"("ConfigKey");
