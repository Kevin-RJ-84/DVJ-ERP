-- Prerequisite: CHANGES-6 tables (create if not yet migrated)
CREATE TABLE IF NOT EXISTS "replenishment_items" (
    "ItemID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReplenishmentID" UUID NOT NULL,
    "InvoiceNo" VARCHAR NOT NULL,
    "StyleNo" VARCHAR NOT NULL,
    "GroupField" VARCHAR NOT NULL,
    "GroupValue" VARCHAR NOT NULL,
    "StockNo" VARCHAR NOT NULL,
    "Status" VARCHAR NOT NULL,
    "PullbackMemoID" UUID,
    "PullbackClientID" UUID,
    "PullbackStatus" VARCHAR,
    "FactoryOrderNote" VARCHAR,
    "CreatedBy" UUID NOT NULL,
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replenishment_items_pkey" PRIMARY KEY ("ItemID")
);

CREATE INDEX IF NOT EXISTS "replenishment_items_InvoiceNo_idx" ON "replenishment_items"("InvoiceNo");
CREATE INDEX IF NOT EXISTS "replenishment_items_StyleNo_idx" ON "replenishment_items"("StyleNo");
CREATE INDEX IF NOT EXISTS "replenishment_items_StockNo_idx" ON "replenishment_items"("StockNo");

DO $$ BEGIN
  ALTER TABLE "replenishment_items"
    ADD CONSTRAINT "replenishment_items_ReplenishmentID_fkey"
    FOREIGN KEY ("ReplenishmentID") REFERENCES "replenishments"("ReplenishmentID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pullback_history" (
    "HistoryID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReplenishmentItemID" UUID NOT NULL,
    "ContactedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Channel" VARCHAR NOT NULL,
    "ContactedBy" UUID NOT NULL,
    "ClientResponse" VARCHAR NOT NULL,
    "Notes" TEXT,

    CONSTRAINT "pullback_history_pkey" PRIMARY KEY ("HistoryID")
);

CREATE INDEX IF NOT EXISTS "pullback_history_ReplenishmentItemID_idx" ON "pullback_history"("ReplenishmentItemID");

DO $$ BEGIN
  ALTER TABLE "pullback_history"
    ADD CONSTRAINT "pullback_history_ReplenishmentItemID_fkey"
    FOREIGN KEY ("ReplenishmentItemID") REFERENCES "replenishment_items"("ItemID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pullback_history"
    ADD CONSTRAINT "pullback_history_ContactedBy_fkey"
    FOREIGN KEY ("ContactedBy") REFERENCES "users"("UserID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pullback_selection_history" (
    "SelectionHistoryID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReplenishmentItemID" UUID NOT NULL,
    "PreviousStockNo" VARCHAR,
    "NewStockNo" VARCHAR,
    "PreviousMemoID" UUID,
    "NewMemoID" UUID,
    "Reason" TEXT NOT NULL,
    "ChangedBy" UUID NOT NULL,
    "ChangedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pullback_selection_history_pkey" PRIMARY KEY ("SelectionHistoryID")
);

CREATE INDEX IF NOT EXISTS "pullback_selection_history_ReplenishmentItemID_idx" ON "pullback_selection_history"("ReplenishmentItemID");

DO $$ BEGIN
  ALTER TABLE "pullback_selection_history"
    ADD CONSTRAINT "pullback_selection_history_ReplenishmentItemID_fkey"
    FOREIGN KEY ("ReplenishmentItemID") REFERENCES "replenishment_items"("ItemID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pullback_selection_history"
    ADD CONSTRAINT "pullback_selection_history_ChangedBy_fkey"
    FOREIGN KEY ("ChangedBy") REFERENCES "users"("UserID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CHANGES-10 Part 1: new columns on replenishment_items
ALTER TABLE "replenishment_items" ADD COLUMN IF NOT EXISTS "PullbackCandidateCount" INTEGER;
ALTER TABLE "replenishment_items" ADD COLUMN IF NOT EXISTS "IsActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "replenishment_items" ADD COLUMN IF NOT EXISTS "FactoryOrderPlacedAt" TIMESTAMP(6);
ALTER TABLE "replenishment_items" ADD COLUMN IF NOT EXISTS "FactoryOrderPlacedBy" UUID;

-- CHANGES-10 Part 1: replenishment_status_log
CREATE TABLE IF NOT EXISTS "replenishment_status_log" (
    "LogID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ItemID" UUID NOT NULL,
    "InvoiceNo" VARCHAR NOT NULL,
    "StyleNo" VARCHAR NOT NULL,
    "FromStatus" VARCHAR,
    "ToStatus" VARCHAR NOT NULL,
    "ChangedBy" UUID NOT NULL,
    "ChangedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Notes" TEXT,

    CONSTRAINT "replenishment_status_log_pkey" PRIMARY KEY ("LogID")
);

CREATE INDEX IF NOT EXISTS "replenishment_status_log_ItemID_idx" ON "replenishment_status_log"("ItemID");
CREATE INDEX IF NOT EXISTS "replenishment_status_log_InvoiceNo_idx" ON "replenishment_status_log"("InvoiceNo");
CREATE INDEX IF NOT EXISTS "replenishment_status_log_StyleNo_idx" ON "replenishment_status_log"("StyleNo");
CREATE INDEX IF NOT EXISTS "replenishment_status_log_ChangedAt_idx" ON "replenishment_status_log"("ChangedAt");

DO $$ BEGIN
  ALTER TABLE "replenishment_status_log"
    ADD CONSTRAINT "replenishment_status_log_ItemID_fkey"
    FOREIGN KEY ("ItemID") REFERENCES "replenishment_items"("ItemID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "replenishment_status_log"
    ADD CONSTRAINT "replenishment_status_log_ChangedBy_fkey"
    FOREIGN KEY ("ChangedBy") REFERENCES "users"("UserID")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
