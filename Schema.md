// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model users {
  UserID         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  Username       String    @unique @db.VarChar
  Email          String    @unique @db.VarChar
  PasswordHash   String    @db.VarChar
  FirstName      String    @db.VarChar
  LastName       String    @db.VarChar
  Role           String    @db.VarChar
  IsFirstLogin   Boolean   @default(true)
  IsActive       Boolean   @default(true)
  OtpHash        String?   @db.VarChar
  OtpExpiresAt   DateTime? @db.Timestamp(6)
  CreatedAt      DateTime  @default(now()) @db.Timestamp(6)
  ModifiedAt     DateTime  @default(now()) @db.Timestamp(6)
  ModifiedByID   String?   @db.Uuid
  ModifiedByUser users?    @relation("UserModifiedBy", fields: [ModifiedByID], references: [UserID], onDelete: SetNull)
  ModifiedUsers  users[]   @relation("UserModifiedBy")

  @@index([Role])
  @@map("users")
}

model clients {
  ClientID           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  PartyCode          String?  @unique @db.VarChar
  PartyName          String   @db.VarChar
  CloseToExpiryDays  Int      @default(7)
  IsStockPullAllowed Boolean  @default(true)
  CreatedAt          DateTime @default(now()) @db.Timestamp(6)
  Memos              memo[]

  @@index([PartyName])
  @@map("clients")
}

model stock {
  StockID            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  StockNo            String       @unique @db.VarChar
  StockType          String?      @db.VarChar
  ProductDescription String?      @db.VarChar
  ProductType        String?      @db.VarChar
  ProductStyle       String?      @db.VarChar
  StoneShape         String?      @db.VarChar
  Metal              String?      @db.VarChar
  StonePCs           Decimal?     @db.Decimal(12, 3)
  StoneWT            Decimal?     @db.Decimal(12, 3)
  MetalType          String?      @db.VarChar
  MetalWT            Decimal?     @db.Decimal(12, 3)
  StyleNo            String?      @db.VarChar
  BoxCode            String?      @db.VarChar
  Location           String?      @db.VarChar
  HoldDate           DateTime?    @db.Date
  HoldLocation       String?      @db.VarChar
  HoldNarration      String?      @db.VarChar
  UploadedAt         DateTime     @default(now()) @db.Timestamp(6)
  MemoStockLinks memo_stock[]
  PrimaryMemo     memo?        @relation("MemoPerStock")
  Sales           sales[]

  @@index([StyleNo])
  @@index([StoneShape])
  @@index([Metal])
  @@index([MetalType])
  @@map("stock")
}

model memo {
  MemoID         String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  MemoNo         String       @unique @db.VarChar
  MemoDate       DateTime     @db.Date
  Terms          Int
  MemoEndDate    DateTime     @db.Date
  MemoNarration  String?      @db.VarChar
  ClientID       String?      @db.Uuid
  /** When set, this memo row is keyed 1:1 to a stock line (imports with no MemoNo in Excel). */
  StockNo        String?      @unique @db.VarChar
  IsActive       Boolean      @default(true)
  CreatedAt      DateTime     @default(now()) @db.Timestamp(6)
  Client         clients?     @relation(fields: [ClientID], references: [ClientID], onDelete: SetNull)
  Stock          stock?       @relation("MemoPerStock", fields: [StockNo], references: [StockNo], onDelete: SetNull)
  MemoStockLinks memo_stock[]
  Sales          sales[]

  @@map("memo")
}

model memo_stock {
  MemoStockID String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  MemoID      String?  @db.Uuid
  StockNo     String?  @db.VarChar
  AddedAt     DateTime @default(now()) @db.Timestamp(6)
  Memo        memo?    @relation(fields: [MemoID], references: [MemoID], onDelete: Cascade)
  Stock       stock?   @relation(fields: [StockNo], references: [StockNo], onDelete: Cascade)

  @@index([MemoID])
  @@index([StockNo])
  @@map("memo_stock")
}

model sales {
  SalesID       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  InvoiceNo     String   @db.VarChar
  InvoiceDate   DateTime @db.Date
  PartyCode     String?  @db.VarChar
  PartyName     String?  @db.VarChar
  Department    String?  @db.VarChar
  StockNo       String?  @db.VarChar
  /** Denormalized from `stock` (or sales file mapping) for reporting / SQL without joins. */
  StyleNo       String?  @db.VarChar
  STShapes      String?  @db.VarChar
  ProductType   String?  @db.VarChar
  Metal         String?  @db.VarChar
  StonePCs      Decimal? @db.Decimal(12, 3)
  StoneWT       Decimal? @db.Decimal(12, 3)
  MetalType     String?  @db.VarChar
  MetalWT       Decimal? @db.Decimal(12, 3)
  Size          String?  @db.VarChar
  Remarks       String?  @db.VarChar
  RestockNeeded Boolean  @default(false)
  RestockType   String?  @db.VarChar
  MemoID        String?  @db.Uuid
  UploadedAt    DateTime @default(now()) @db.Timestamp(6)
  Memo          memo?    @relation(fields: [MemoID], references: [MemoID], onDelete: SetNull)
  Stock         stock?   @relation(fields: [StockNo], references: [StockNo], onDelete: SetNull)

  @@unique([InvoiceNo, StockNo])
  @@index([StockNo])
  @@index([PartyCode])
  @@index([StyleNo])
  @@map("sales")
}

model excel_mappings {
  MappingID          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ReportType         String    @db.VarChar
  Mapping            Json
  UpdatedAt          DateTime  @default(now()) @db.Timestamp(6)
  LastImportAt       DateTime? @db.Timestamp(6)
  LastImportInserted Int?
  LastImportUpdated  Int?

  @@unique([ReportType])
  @@map("excel_mappings")
}
