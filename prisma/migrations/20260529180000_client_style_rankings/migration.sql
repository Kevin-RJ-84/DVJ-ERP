-- CreateTable
CREATE TABLE "client_style_rankings" (
    "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ClientID" UUID NOT NULL,
    "StyleNo" VARCHAR NOT NULL,
    "TotalPiecesSold" INTEGER NOT NULL DEFAULT 0,
    "TotalValueSold" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "TotalProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "CombinedScore" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ClientStyleRank" INTEGER,
    "LastCalculatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_style_rankings_pkey" PRIMARY KEY ("ID")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_style_rankings_ClientID_StyleNo_key" ON "client_style_rankings"("ClientID", "StyleNo");

-- CreateIndex
CREATE INDEX "client_style_rankings_ClientID_idx" ON "client_style_rankings"("ClientID");

-- CreateIndex
CREATE INDEX "client_style_rankings_StyleNo_idx" ON "client_style_rankings"("StyleNo");

-- CreateIndex
CREATE INDEX "client_style_rankings_ClientStyleRank_idx" ON "client_style_rankings"("ClientStyleRank");

-- AddForeignKey
ALTER TABLE "client_style_rankings" ADD CONSTRAINT "client_style_rankings_ClientID_fkey" FOREIGN KEY ("ClientID") REFERENCES "clients"("ClientID") ON DELETE CASCADE ON UPDATE CASCADE;
