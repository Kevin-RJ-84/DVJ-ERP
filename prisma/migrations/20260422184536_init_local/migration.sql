-- CreateTable
CREATE TABLE "users" (
    "UserID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Username" VARCHAR NOT NULL,
    "Email" VARCHAR NOT NULL,
    "PasswordHash" VARCHAR NOT NULL,
    "FirstName" VARCHAR NOT NULL,
    "LastName" VARCHAR NOT NULL,
    "Role" VARCHAR NOT NULL,
    "IsFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "OtpHash" VARCHAR,
    "OtpExpiresAt" TIMESTAMP(6),
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ModifiedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ModifiedByID" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("UserID")
);

-- CreateTable
CREATE TABLE "clients" (
    "ClientID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PartyCode" VARCHAR,
    "PartyName" VARCHAR NOT NULL,
    "CloseToExpiryDays" INTEGER NOT NULL DEFAULT 7,
    "IsStockPullAllowed" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("ClientID")
);

-- CreateTable
CREATE TABLE "stock" (
    "StockID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "StockNo" VARCHAR NOT NULL,
    "StockType" VARCHAR,
    "ProductDescription" VARCHAR,
    "ProductType" VARCHAR,
    "ProductStyle" VARCHAR,
    "StoneShape" VARCHAR,
    "Metal" VARCHAR,
    "StonePCs" DECIMAL(12,3),
    "StoneWT" DECIMAL(12,3),
    "MetalType" VARCHAR,
    "MetalWT" DECIMAL(12,3),
    "StyleNo" VARCHAR,
    "BoxCode" VARCHAR,
    "Location" VARCHAR,
    "HoldDate" DATE,
    "HoldLocation" VARCHAR,
    "HoldNarration" VARCHAR,
    "UploadedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("StockID")
);

-- CreateTable
CREATE TABLE "memo" (
    "MemoID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "MemoNo" VARCHAR NOT NULL,
    "MemoDate" DATE NOT NULL,
    "Terms" INTEGER NOT NULL,
    "MemoEndDate" DATE NOT NULL,
    "MemoNarration" VARCHAR,
    "ClientID" UUID,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memo_pkey" PRIMARY KEY ("MemoID")
);

-- CreateTable
CREATE TABLE "memo_stock" (
    "MemoStockID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "MemoID" UUID,
    "StockNo" VARCHAR,
    "AddedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memo_stock_pkey" PRIMARY KEY ("MemoStockID")
);

-- CreateTable
CREATE TABLE "sales" (
    "SalesID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "InvoiceNo" VARCHAR NOT NULL,
    "InvoiceDate" DATE NOT NULL,
    "PartyCode" VARCHAR,
    "PartyName" VARCHAR,
    "Department" VARCHAR,
    "StockNo" VARCHAR,
    "STShapes" VARCHAR,
    "ProductType" VARCHAR,
    "Metal" VARCHAR,
    "StonePCs" DECIMAL(12,3),
    "StoneWT" DECIMAL(12,3),
    "MetalType" VARCHAR,
    "MetalWT" DECIMAL(12,3),
    "Size" VARCHAR,
    "Remarks" VARCHAR,
    "RestockNeeded" BOOLEAN NOT NULL DEFAULT false,
    "RestockType" VARCHAR,
    "MemoID" UUID,
    "UploadedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("SalesID")
);

-- CreateTable
CREATE TABLE "excel_mappings" (
    "MappingID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReportType" VARCHAR NOT NULL,
    "Mapping" JSONB NOT NULL,
    "UpdatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excel_mappings_pkey" PRIMARY KEY ("MappingID")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_Username_key" ON "users"("Username");

-- CreateIndex
CREATE UNIQUE INDEX "users_Email_key" ON "users"("Email");

-- CreateIndex
CREATE INDEX "users_Role_idx" ON "users"("Role");

-- CreateIndex
CREATE UNIQUE INDEX "clients_PartyCode_key" ON "clients"("PartyCode");

-- CreateIndex
CREATE INDEX "clients_PartyName_idx" ON "clients"("PartyName");

-- CreateIndex
CREATE UNIQUE INDEX "stock_StockNo_key" ON "stock"("StockNo");

-- CreateIndex
CREATE INDEX "stock_StyleNo_idx" ON "stock"("StyleNo");

-- CreateIndex
CREATE INDEX "stock_StoneShape_idx" ON "stock"("StoneShape");

-- CreateIndex
CREATE INDEX "stock_Metal_idx" ON "stock"("Metal");

-- CreateIndex
CREATE INDEX "stock_MetalType_idx" ON "stock"("MetalType");

-- CreateIndex
CREATE UNIQUE INDEX "memo_MemoNo_key" ON "memo"("MemoNo");

-- CreateIndex
CREATE INDEX "memo_stock_MemoID_idx" ON "memo_stock"("MemoID");

-- CreateIndex
CREATE INDEX "memo_stock_StockNo_idx" ON "memo_stock"("StockNo");

-- CreateIndex
CREATE INDEX "sales_StockNo_idx" ON "sales"("StockNo");

-- CreateIndex
CREATE INDEX "sales_PartyCode_idx" ON "sales"("PartyCode");

-- CreateIndex
CREATE UNIQUE INDEX "sales_InvoiceNo_StockNo_key" ON "sales"("InvoiceNo", "StockNo");

-- CreateIndex
CREATE UNIQUE INDEX "excel_mappings_ReportType_key" ON "excel_mappings"("ReportType");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_ModifiedByID_fkey" FOREIGN KEY ("ModifiedByID") REFERENCES "users"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo" ADD CONSTRAINT "memo_ClientID_fkey" FOREIGN KEY ("ClientID") REFERENCES "clients"("ClientID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_stock" ADD CONSTRAINT "memo_stock_MemoID_fkey" FOREIGN KEY ("MemoID") REFERENCES "memo"("MemoID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_stock" ADD CONSTRAINT "memo_stock_StockNo_fkey" FOREIGN KEY ("StockNo") REFERENCES "stock"("StockNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_MemoID_fkey" FOREIGN KEY ("MemoID") REFERENCES "memo"("MemoID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_StockNo_fkey" FOREIGN KEY ("StockNo") REFERENCES "stock"("StockNo") ON DELETE SET NULL ON UPDATE CASCADE;
