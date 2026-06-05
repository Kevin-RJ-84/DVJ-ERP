CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  "UserID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Username" VARCHAR UNIQUE NOT NULL,
  "Email" VARCHAR UNIQUE NOT NULL,
  "PasswordHash" VARCHAR NOT NULL,
  "FirstName" VARCHAR NOT NULL,
  "LastName" VARCHAR NOT NULL,
  "Role" VARCHAR NOT NULL CHECK ("Role" IN ('admin', 'member')),
  "IsFirstLogin" BOOLEAN DEFAULT TRUE,
  "IsActive" BOOLEAN DEFAULT TRUE,
  "OtpHash" VARCHAR,
  "OtpExpiresAt" TIMESTAMP,
  "CreatedAt" TIMESTAMP DEFAULT NOW(),
  "ModifiedAt" TIMESTAMP DEFAULT NOW(),
  "ModifiedByID" UUID REFERENCES users("UserID")
);

CREATE TABLE IF NOT EXISTS clients (
  "ClientID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "PartyCode" VARCHAR UNIQUE,
  "PartyName" VARCHAR NOT NULL,
  "CloseToExpiryDays" INTEGER DEFAULT 7,
  "IsStockPullAllowed" BOOLEAN DEFAULT TRUE,
  "CreatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock (
  "StockID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "StockNo" VARCHAR UNIQUE NOT NULL,
  "StockType" VARCHAR,
  "ProductDescription" VARCHAR,
  "ProductType" VARCHAR,
  "ProductStyle" VARCHAR,
  "StoneShape" VARCHAR,
  "Metal" VARCHAR,
  "StonePCs" DECIMAL,
  "StoneWT" DECIMAL,
  "MetalType" VARCHAR,
  "MetalWT" DECIMAL,
  "StyleNo" VARCHAR,
  "BoxCode" VARCHAR,
  "Location" VARCHAR,
  "HoldDate" DATE,
  "HoldLocation" VARCHAR,
  "HoldNarration" VARCHAR,
  "UploadedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memo (
  "MemoID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "MemoNo" VARCHAR UNIQUE NOT NULL,
  "MemoDate" DATE NOT NULL,
  "Terms" INTEGER NOT NULL,
  "MemoEndDate" DATE NOT NULL,
  "MemoNarration" VARCHAR,
  "ClientID" UUID REFERENCES clients("ClientID"),
  "StockNo" VARCHAR REFERENCES stock("StockNo") ON DELETE SET NULL,
  "IsActive" BOOLEAN DEFAULT TRUE,
  "CreatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS memo_StockNo_key ON memo("StockNo");

CREATE TABLE IF NOT EXISTS memo_stock (
  "MemoStockID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "MemoID" UUID REFERENCES memo("MemoID"),
  "StockNo" VARCHAR REFERENCES stock("StockNo"),
  "AddedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  "SalesID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "InvoiceNo" VARCHAR NOT NULL,
  "InvoiceDate" DATE NOT NULL,
  "PartyCode" VARCHAR REFERENCES clients("PartyCode"),
  "PartyName" VARCHAR,
  "Department" VARCHAR,
  "StockNo" VARCHAR REFERENCES stock("StockNo"),
  "STShapes" VARCHAR,
  "ProductType" VARCHAR,
  "Metal" VARCHAR,
  "StonePCs" DECIMAL,
  "StoneWT" DECIMAL,
  "MetalType" VARCHAR,
  "MetalWT" DECIMAL,
  "Size" VARCHAR,
  "Remarks" VARCHAR,
  "RestockNeeded" BOOLEAN DEFAULT FALSE,
  "RestockType" VARCHAR CHECK ("RestockType" IN ('same', 'different') OR "RestockType" IS NULL),
  "MemoID" UUID REFERENCES memo("MemoID"),
  "UploadedAt" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT sales_invoice_stock_unique UNIQUE ("InvoiceNo", "StockNo")
);

CREATE TABLE IF NOT EXISTS excel_mappings (
  "MappingID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ReportType" VARCHAR NOT NULL CHECK ("ReportType" IN ('stock', 'sales')),
  "Mapping" JSONB NOT NULL,
  "UpdatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_excel_mappings_report_type ON excel_mappings("ReportType");
CREATE INDEX IF NOT EXISTS idx_stock_styleno ON stock("StyleNo");
CREATE INDEX IF NOT EXISTS idx_stock_stoneshape ON stock("StoneShape");
CREATE INDEX IF NOT EXISTS idx_stock_metal ON stock("Metal");
CREATE INDEX IF NOT EXISTS idx_stock_metaltype ON stock("MetalType");
CREATE INDEX IF NOT EXISTS idx_memo_stock_memoid ON memo_stock("MemoID");
CREATE INDEX IF NOT EXISTS idx_memo_stock_stockno ON memo_stock("StockNo");
CREATE INDEX IF NOT EXISTS idx_sales_stockno ON sales("StockNo");
CREATE INDEX IF NOT EXISTS idx_sales_partycode ON sales("PartyCode");
