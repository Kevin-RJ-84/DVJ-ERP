import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractRowsFromWorkbook } from "@/lib/excel";
import { REPORT_TYPES, parseStoredExcelMappingJson, type ReportType, type ExcelDateFormat } from "@/lib/excel-config";
import type { UploadImportStatusPayload } from "@/lib/import-upload";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { recalculateRankings } from "@/lib/rankings";
import {
  applyStockUploadMemoLifecyclePasses,
  isReturnedCandidateFromUpload,
} from "@/lib/stock-lifecycle";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** When a row has memo number + date but no usable terms days, use this for `memo.Terms` / end date. */
const DEFAULT_MEMO_TERMS_DAYS = 30;

function computeMemoEndDate(memoDate: Date, termsDays: number) {
  const utc = new Date(
    Date.UTC(
      memoDate.getUTCFullYear(),
      memoDate.getUTCMonth(),
      memoDate.getUTCDate(),
    ),
  );
  utc.setUTCDate(utc.getUTCDate() + termsDays);
  return utc;
}
const STOCK_DB_FIELDS = new Set([
  "StockNo",
  "StockType",
  "ProductDescription",
  "ProductType",
  "ProductStyle",
  "StoneShape",
  "Metal",
  "StonePCs",
  "StoneWT",
  "MetalType",
  "MetalWT",
  "StyleNo",
  "BoxCode",
  "Location",
  "HoldDate",
  "HoldLocation",
  "HoldNarration",
]);

/** Excel → row shape: warehouse fields plus memo columns (not persisted on `stock` row). */
const STOCK_UPLOAD_FIELDS = new Set([
  ...STOCK_DB_FIELDS,
  "Company",
  "MemoNo",
  "MemoDate",
  "Terms",
  "MEMO_FOR_DAYS",
  "MemoNarration",
]);
const SALES_DBFIELDS = new Set([
  "InvoiceNo",
  "InvoiceDate",
  "PartyCode",
  "PartyName",
  "Department",
  "StockNo",
  "StyleNo",
  "STShapes",
  "ProductType",
  "Metal",
  "StonePCs",
  "StoneWT",
  "MetalType",
  "MetalWT",
  "Size",
  "Remarks",
  "RestockNeeded",
  "RestockType",
  "SaleValue",
  "CRAmount",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown) {
  const text = asText(value);
  if (!text) {
    return null;
  }
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Money columns: numeric cells, or text like `$1,234.56`, `(100.00)` for negatives. */
function asDecimalMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = asText(value);
  if (!text) {
    return null;
  }
  let t = text.replace(/[$€£¥₹]/g, "").replace(/\s+/g, "").replaceAll(",", "");
  if (/^\(.*\)$/.test(t)) {
    t = `-${t.slice(1, -1)}`;
  }
  const parsed = Number(t);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidUtcYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) {
    return false;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Parses common non-ISO date strings with a month name (e.g. 04-Jun-2026).
 */
function parseNamedMonthDateString(text: string): Date | null {
  const trimmed = text.trim();
  const named = trimmed.match(/^(\d{1,2})[-/]([A-Za-z]{3,9})[-/](\d{4})$/);
  if (named) {
    const d = Number(named[1]);
    const monKey = named[2].slice(0, 3).toLowerCase();
    const m = MONTH_MAP[monKey];
    const y = Number(named[3]);
    if (m && isValidUtcYmd(y, m, d)) {
      return new Date(Date.UTC(y, m - 1, d));
    }
  }
  return null;
}

/** Slash or dashed numeric dates, including year-first (2026/07/01) and year-last (07/01/2026). */
function parseDelimitedNumericDate(trimmed: string, dateFormat: ExcelDateFormat): Date | null {
  const yFirst = trimmed.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T\s].*)?$/);
  if (yFirst) {
    const y = Number(yFirst[1]);
    const mo = Number(yFirst[2]);
    const d = Number(yFirst[3]);
    if (isValidUtcYmd(y, mo, d)) {
      return new Date(Date.UTC(y, mo - 1, d));
    }
  }

  const yLast = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s.*)?$/);
  if (yLast) {
    let y = Number(yLast[3]);
    if (y < 100) {
      y += 2000;
    }
    const p1 = Number(yLast[1]);
    const p2 = Number(yLast[2]);

    if (dateFormat === "MM/DD/YYYY") {
      const mo = p1;
      const d = p2;
      if (isValidUtcYmd(y, mo, d)) {
        return new Date(Date.UTC(y, mo - 1, d));
      }
    } else {
      const d = p1;
      const mo = p2;
      if (isValidUtcYmd(y, mo, d)) {
        return new Date(Date.UTC(y, mo - 1, d));
      }
    }
  }

  return null;
}

function normalizeDateText(text: string): string {
  // Excel often stores text dates with a leading apostrophe, e.g. `'16/04/2026`.
  let normalized = text.trim();
  normalized = normalized.replace(/^[`'"]+/, "").trim();
  normalized = normalized.replace(/\s+/g, " ");
  return normalized;
}

/**
 * Parse cell value as UTC calendar Date where possible. Slash dates use `dateFormat` so DD/MM is not read as MM/DD.
 */
function asDate(value: unknown, dateFormat: ExcelDateFormat = "DD/MM/YYYY") {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.floor(value);
    if (whole > 0 && whole < 1_000_000) {
      const MS_PER_DAY = 86400000;
      const fromSerial = new Date(Math.round((whole - 25569) * MS_PER_DAY));
      return Number.isNaN(fromSerial.getTime()) ? null : fromSerial;
    }
    return null;
  }
  const text = asText(value);
  if (!text) {
    return null;
  }
  const normalizedText = normalizeDateText(text);

  const ymd = normalizedText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (isValidUtcYmd(y, m, d)) {
      return new Date(Date.UTC(y, m - 1, d));
    }
  }

  const delimited = parseDelimitedNumericDate(normalizedText, dateFormat);
  if (delimited) {
    return delimited;
  }

  const named = parseNamedMonthDateString(normalizedText);
  if (named) {
    return named;
  }

  const serial = Number(normalizedText.replaceAll(",", ""));
  if (Number.isFinite(serial) && serial >= 1 && serial < 1_000_000) {
    const whole = Math.floor(serial);
    const MS_PER_DAY = 86400000;
    const fromSerial = new Date(Math.round((whole - 25569) * MS_PER_DAY));
    if (!Number.isNaN(fromSerial.getTime())) {
      return fromSerial;
    }
  }

  const parsed = new Date(normalizedText);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Legacy `Terms` column: positive days only; empty / unparseable → null (caller uses default).
 */
function parseLegacyTermsColumn(value: unknown): number | null {
  const n = asNumber(value);
  if (n !== null && n > 0) {
    return Math.trunc(n);
  }
  const text = asText(value);
  if (!text) {
    return null;
  }
  const match = text.match(/\d+/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

/**
 * Part 7 — `MEMO_FOR_DAYS`: 0 or unparseable means in warehouse (skip memo). No "missing" sentinel — use legacy path when column not mapped.
 */
function asMemoForDaysStrict(cellValue: unknown): number {
  if (cellValue === null || cellValue === undefined) {
    return 0;
  }
  if (typeof cellValue === "number" && Number.isFinite(cellValue)) {
    if (cellValue <= 0) {
      return 0;
    }
    return Math.floor(cellValue);
  }
  const str = String(cellValue).trim();
  if (!str) {
    return 0;
  }
  const direct = Number(str.replaceAll(",", ""));
  if (!Number.isNaN(direct) && direct > 0) {
    return Math.floor(direct);
  }
  const match = str.match(/\d+/);
  if (match) {
    const parsed = parseInt(match[0], 10);
    if (parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

function asBoolean(value: unknown) {
  const text = asText(value)?.toLowerCase();
  if (!text) {
    return false;
  }
  return ["1", "true", "yes", "y", "needed"].includes(text);
}

function rowValueForExcelHeader(row: Record<string, unknown>, excelHeader: string): unknown {
  const trimmed = excelHeader.trim();
  if (Object.prototype.hasOwnProperty.call(row, trimmed)) {
    return row[trimmed];
  }
  if (Object.prototype.hasOwnProperty.call(row, excelHeader)) {
    return row[excelHeader];
  }
  const lower = trimmed.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === lower) {
      return row[key];
    }
  }
  return undefined;
}

function mapRowToDbFields(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  allowedFields: Set<string>,
) {
  const mapped: Record<string, unknown> = {};
  for (const [excelHeader, dbField] of Object.entries(mapping)) {
    if (!allowedFields.has(dbField)) {
      continue;
    }
    mapped[dbField] = rowValueForExcelHeader(row, excelHeader);
  }
  return mapped;
}

async function ensureClient(input: { partyCode?: string | null; partyName?: string | null }) {
  const partyCode = asText(input.partyCode);
  const partyName = asText(input.partyName);

  if (!partyCode && !partyName) {
    return null;
  }

  if (partyCode) {
    const existingByCode = await db.clients.findUnique({
      where: { PartyCode: partyCode },
    });
    if (existingByCode) {
      return existingByCode;
    }
  }

  if (partyName) {
    const existingByName = await db.clients.findFirst({
      where: { PartyName: partyName },
    });
    if (existingByName) {
      if (partyCode && !existingByName.PartyCode) {
        return db.clients.update({
          where: { ClientID: existingByName.ClientID },
          data: { PartyCode: partyCode },
        });
      }
      return existingByName;
    }
  }

  return db.clients.create({
    data: {
      PartyCode: partyCode,
      PartyName: partyName ?? partyCode ?? "Unknown Client",
    },
  });
}

type ParsedStockRow = {
  StockNo: string | null;
  StockType: string | null;
  ProductDescription: string | null;
  ProductType: string | null;
  ProductStyle: string | null;
  StoneShape: string | null;
  Metal: string | null;
  StonePCs: number | null;
  StoneWT: number | null;
  MetalType: string | null;
  MetalWT: number | null;
  StyleNo: string | null;
  BoxCode: string | null;
  Location: string | null;
  HoldDate: Date | null;
  HoldLocation: string | null;
  HoldNarration: string | null;
  Company: string | null;
  MemoNo: string | null;
  MemoDate: Date | null;
  Terms: number | null;
  /** Raw Excel cell when `MEMO_FOR_DAYS` is mapped; undefined if not mapped. */
  memoForDaysRaw?: unknown;
  MemoNarration: string | null;
};

/** Stable synthetic `MemoNo` when the file has no memo number but we key the memo by `StockNo`. */
function syntheticMemoNoForStock(stockNo: string) {
  return `STOCK:${stockNo}`;
}

async function syncMemoLinksForStockRow(
  row: ParsedStockRow,
  stockNo: string,
  memoForDaysMapped: boolean,
): Promise<boolean> {
  // Keep lifecycle-updated memo_stock lines (sold / returned / missing) from being wiped by sync;
  // only remove active links so this row can attach a fresh active line when the sheet has memo fields.
  await db.memo_stock.deleteMany({ where: { StockNo: stockNo, Status: "active" } });

  const hasLifecycleRows = await db.memo_stock.count({
    where: {
      StockNo: stockNo,
      Status: { not: "active" },
    },
  });

  if (hasLifecycleRows === 0) {
    await db.memo.deleteMany({ where: { StockNo: stockNo } });
  } else {
    await db.memo.updateMany({
      where: { StockNo: stockNo },
      data: { StockNo: null },
    });
  }

  const hasMemoFromMemoNo = Boolean(row.MemoNo && row.MemoDate);
  const hasMemoFromStockOnly = Boolean(!row.MemoNo && row.MemoDate);

  if (!hasMemoFromMemoNo && !hasMemoFromStockOnly) {
    return false;
  }

  let termsDays: number;
  if (memoForDaysMapped) {
    const parsed = asMemoForDaysStrict(row.memoForDaysRaw);
    if (parsed === 0) {
      return false;
    }
    termsDays = parsed;
  } else {
    termsDays =
      row.Terms !== null && row.Terms > 0 ? Math.trunc(row.Terms) : DEFAULT_MEMO_TERMS_DAYS;
  }

  const client = row.Company ? await ensureClient({ partyName: row.Company }) : null;

  if (hasMemoFromMemoNo) {
    const memoEndDate = computeMemoEndDate(row.MemoDate as Date, termsDays);
    const memo = await db.memo.upsert({
      where: { MemoNo: row.MemoNo as string },
      update: {
        MemoDate: row.MemoDate as Date,
        Terms: termsDays,
        MemoEndDate: memoEndDate,
        ClientID: client?.ClientID ?? null,
        MemoNarration: row.MemoNarration,
      },
      create: {
        MemoNo: row.MemoNo as string,
        MemoDate: row.MemoDate as Date,
        Terms: termsDays,
        MemoEndDate: memoEndDate,
        ClientID: client?.ClientID ?? null,
        MemoNarration: row.MemoNarration,
      },
    });

    await db.memo_stock.create({
      data: {
        MemoID: memo.MemoID,
        StockNo: stockNo,
      },
    });
    return true;
  }

  const memoEndDate = computeMemoEndDate(row.MemoDate as Date, termsDays);
  const syntheticNo = syntheticMemoNoForStock(stockNo);
  const memo = await db.memo.upsert({
    where: { StockNo: stockNo },
    create: {
      MemoNo: syntheticNo,
      StockNo: stockNo,
      MemoDate: row.MemoDate as Date,
      Terms: termsDays,
      MemoEndDate: memoEndDate,
      ClientID: client?.ClientID ?? null,
      MemoNarration: row.MemoNarration,
    },
    update: {
      MemoNo: syntheticNo,
      MemoDate: row.MemoDate as Date,
      Terms: termsDays,
      MemoEndDate: memoEndDate,
      ClientID: client?.ClientID ?? null,
      MemoNarration: row.MemoNarration,
    },
  });

  await db.memo_stock.create({
    data: {
      MemoID: memo.MemoID,
      StockNo: stockNo,
    },
  });
  return true;
}

type SalesImportHaltDetail = {
  dataRowIndex1Based: number;
  /** Assumes row 1 is headers; first data row is 2. */
  spreadsheetRowApprox: number;
  reasons: string[];
  mappedFieldPresence: {
    hasInvoiceNoKey: boolean;
    hasInvoiceDateKey: boolean;
    hasStockNoKey: boolean;
  };
  /** Truncated string previews of mapped cell values (after mapRowToDbFields). */
  rawPreview: { invoiceNo?: string; invoiceDate?: string; stockNo?: string };
  parsed: {
    invoiceNo: string | null;
    invoiceDateIso: string | null;
    stockNo: string | null;
  };
  mappingHints: {
    excelHeaderForInvoiceNo?: string;
    excelHeaderForInvoiceDate?: string;
    excelHeaderForStockNo?: string;
  };
};

type SalesImportDebugReport = {
  skippedCount: number;
  /** Counts can overlap on one row (e.g. missing date and missing stock). */
  breakdown: Record<string, number>;
  mappingHints: SalesImportHaltDetail["mappingHints"];
  samples: SalesImportHaltDetail[];
};

type ProcessUploadResult = {
  inserted: number;
  updated: number;
  memoLinksCreated: number;
  rowsRead: number;
  /** Rows from the file that were dropped (missing StockNo / sales keys after mapping). */
  rowsSkipped: number;
  /** Stock upload only: memo_stock rows marked sold (seen in sales, missing from file). */
  markedSold: number;
  /** Stock upload only: memo_stock rows marked returned (back in warehouse in file). */
  markedReturned: number;
  /** Stock upload only: memo_stock rows flagged missing (not in file, not in sales). */
  flaggedMissing: number;
  /** Stock upload only: memos set to IsActive false when no active memo_stock lines remain. */
  memosDeactivated: number;
  salesImportDebug?: SalesImportDebugReport;
  importHalted?: boolean;
  haltDetail?: SalesImportHaltDetail;
};

function previewCell(value: unknown, max = 140): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  const t = s.trim();
  if (!t) {
    return undefined;
  }
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function mappingExcelHeadersForSales(mapping: Record<string, string>): SalesImportHaltDetail["mappingHints"] {
  const pick = (db: string) => Object.entries(mapping).find(([, v]) => v === db)?.[0];
  return {
    excelHeaderForInvoiceNo: pick("InvoiceNo"),
    excelHeaderForInvoiceDate: pick("InvoiceDate"),
    excelHeaderForStockNo: pick("StockNo"),
  };
}

type SalesOkRow = {
  InvoiceNo: string;
  InvoiceDate: Date;
  StockNo: string;
  StyleNo: string | null;
  PartyCode: string | null;
  PartyName: string | null;
  Department: string | null;
  STShapes: string | null;
  ProductType: string | null;
  Metal: string | null;
  StonePCs: number | null;
  StoneWT: number | null;
  MetalType: string | null;
  MetalWT: number | null;
  Size: string | null;
  Remarks: string | null;
  RestockNeeded: boolean;
  RestockType: string | null;
  SaleValue: number | null;
  CRAmount: number | null;
};

const SALES_SKIP_SAMPLE_LIMIT = 45;

function partitionSalesImportRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  dateFormat: ExcelDateFormat,
  options: { importDebug: boolean; importDebugHalt: boolean },
):
  | {
      halted: true;
      haltDetail: SalesImportHaltDetail;
      mappedRows: SalesOkRow[];
      rowsRead: number;
      rowsSkipped: number;
      salesImportDebug?: SalesImportDebugReport;
      invoiceDateParseSample?: { rawPreview: string; parsedUtcYmd: string };
    }
  | {
      halted: false;
      mappedRows: SalesOkRow[];
      rowsRead: number;
      rowsSkipped: number;
      salesImportDebug?: SalesImportDebugReport;
      invoiceDateParseSample?: { rawPreview: string; parsedUtcYmd: string };
    } {
  const rowsRead = rows.length;
  const mappedRows: SalesOkRow[] = [];
  let invoiceDateParseSample: { rawPreview: string; parsedUtcYmd: string } | undefined;
  const breakdown: Record<string, number> = {
    missingInvoiceNoColumn: 0,
    emptyInvoiceNoValue: 0,
    missingInvoiceDateColumn: 0,
    emptyInvoiceDateValue: 0,
    unparsableInvoiceDate: 0,
    missingStockNoColumn: 0,
    emptyStockNoValue: 0,
  };
  const samples: SalesImportHaltDetail[] = [];
  const mappingHints = mappingExcelHeadersForSales(mapping);
  const MAX_SAMPLES = SALES_SKIP_SAMPLE_LIMIT;

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const m = mapRowToDbFields(raw, mapping, SALES_DBFIELDS);
    const hasInv = Object.prototype.hasOwnProperty.call(m, "InvoiceNo");
    const hasDate = Object.prototype.hasOwnProperty.call(m, "InvoiceDate");
    const hasStock = Object.prototype.hasOwnProperty.call(m, "StockNo");

    const invT = asText(m.InvoiceNo);
    const dateD = asDate(m.InvoiceDate, dateFormat);
    const stockT = asText(m.StockNo);

    if (!hasInv) {
      breakdown.missingInvoiceNoColumn += 1;
    } else if (!invT) {
      breakdown.emptyInvoiceNoValue += 1;
    }
    if (!hasDate) {
      breakdown.missingInvoiceDateColumn += 1;
    } else if (!asText(m.InvoiceDate)) {
      breakdown.emptyInvoiceDateValue += 1;
    } else if (!dateD) {
      breakdown.unparsableInvoiceDate += 1;
    }
    if (!hasStock) {
      breakdown.missingStockNoColumn += 1;
    } else if (!stockT) {
      breakdown.emptyStockNoValue += 1;
    }

    if (invT && dateD && stockT) {
      if (!invoiceDateParseSample) {
        invoiceDateParseSample = {
          rawPreview: previewCell(m.InvoiceDate) ?? String(m.InvoiceDate ?? ""),
          parsedUtcYmd: dateD.toISOString().slice(0, 10),
        };
      }
      mappedRows.push({
        InvoiceNo: invT,
        InvoiceDate: dateD,
        StockNo: stockT,
        StyleNo: Object.prototype.hasOwnProperty.call(m, "StyleNo") ? asText(m.StyleNo) : null,
        PartyCode: asText(m.PartyCode),
        PartyName: asText(m.PartyName),
        Department: asText(m.Department),
        STShapes: asText(m.STShapes),
        ProductType: asText(m.ProductType),
        Metal: asText(m.Metal),
        StonePCs: asNumber(m.StonePCs),
        StoneWT: asNumber(m.StoneWT),
        MetalType: asText(m.MetalType),
        MetalWT: asNumber(m.MetalWT),
        Size: asText(m.Size),
        Remarks: asText(m.Remarks),
        RestockNeeded: asBoolean(m.RestockNeeded),
        RestockType: asText(m.RestockType),
        SaleValue: asDecimalMoney(m.SaleValue),
        CRAmount: asDecimalMoney(m.CRAmount),
      });
      continue;
    }

    const reasons: string[] = [];
    if (!hasInv) {
      reasons.push("No column maps to InvoiceNo for this row (check Excel map config).");
    } else if (!invT) {
      reasons.push("InvoiceNo is mapped but the cell is empty or whitespace.");
    }
    if (!hasDate) {
      reasons.push("No column maps to InvoiceDate for this row.");
    } else if (m.InvoiceDate === null || m.InvoiceDate === undefined || asText(m.InvoiceDate) === null) {
      reasons.push("InvoiceDate is mapped but the cell is empty.");
    } else if (!dateD) {
      reasons.push(
        `InvoiceDate value could not be parsed as a date (raw preview: ${previewCell(m.InvoiceDate) ?? "?"})`,
      );
    }
    if (!hasStock) {
      reasons.push("No column maps to StockNo for this row.");
    } else if (!stockT) {
      reasons.push("StockNo is mapped but the cell is empty or whitespace.");
    }

    const detail: SalesImportHaltDetail = {
      dataRowIndex1Based: i + 1,
      spreadsheetRowApprox: i + 2,
      reasons,
      mappedFieldPresence: {
        hasInvoiceNoKey: hasInv,
        hasInvoiceDateKey: hasDate,
        hasStockNoKey: hasStock,
      },
      rawPreview: {
        invoiceNo: previewCell(m.InvoiceNo),
        invoiceDate: previewCell(m.InvoiceDate),
        stockNo: previewCell(m.StockNo),
      },
      parsed: {
        invoiceNo: invT,
        invoiceDateIso: dateD ? dateD.toISOString().slice(0, 10) : null,
        stockNo: stockT,
      },
      mappingHints: { ...mappingHints },
    };

    if (options.importDebugHalt) {
      return {
        halted: true,
        haltDetail: detail,
        mappedRows: [],
        rowsRead,
        rowsSkipped: rowsRead,
        invoiceDateParseSample: undefined,
        salesImportDebug: options.importDebug
          ? {
              skippedCount: rowsRead,
              breakdown,
              mappingHints,
              samples: [detail],
            }
          : undefined,
      };
    }

    if (options.importDebug && samples.length < MAX_SAMPLES) {
      samples.push(detail);
    }
  }

  const rowsSkipped = rowsRead - mappedRows.length;
  const salesImportDebug: SalesImportDebugReport | undefined = options.importDebug
    ? {
        skippedCount: rowsSkipped,
        breakdown,
        mappingHints,
        samples,
      }
    : undefined;

  return {
    halted: false,
    mappedRows,
    rowsRead,
    rowsSkipped,
    salesImportDebug,
    invoiceDateParseSample,
  };
}

const STOCK_UPLOAD_ZERO_COUNTERS = {
  markedSold: 0,
  markedReturned: 0,
  flaggedMissing: 0,
  memosDeactivated: 0,
} as const;

async function processStockUpload(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  dateFormat: ExcelDateFormat,
): Promise<ProcessUploadResult> {
  const rowsRead = rows.length;
  const memoForDaysMapped = Object.values(mapping).includes("MEMO_FOR_DAYS");
  const mappedRows = rows
    .map((row) => mapRowToDbFields(row, mapping, STOCK_UPLOAD_FIELDS))
    .map((mapped) => ({
      StockNo: asText(mapped.StockNo),
      StockType: asText(mapped.StockType),
      ProductDescription: asText(mapped.ProductDescription),
      ProductType: asText(mapped.ProductType),
      ProductStyle: asText(mapped.ProductStyle),
      StoneShape: asText(mapped.StoneShape),
      Metal: asText(mapped.Metal),
      StonePCs: asNumber(mapped.StonePCs),
      StoneWT: asNumber(mapped.StoneWT),
      MetalType: asText(mapped.MetalType),
      MetalWT: asNumber(mapped.MetalWT),
      StyleNo: asText(mapped.StyleNo),
      BoxCode: asText(mapped.BoxCode),
      Location: asText(mapped.Location),
      HoldDate: asDate(mapped.HoldDate, dateFormat),
      HoldLocation: asText(mapped.HoldLocation),
      HoldNarration: asText(mapped.HoldNarration),
      Company: asText(mapped.Company),
      MemoNo: asText(mapped.MemoNo),
      MemoDate: asDate(mapped.MemoDate, dateFormat),
      Terms: parseLegacyTermsColumn(mapped.Terms),
      memoForDaysRaw: memoForDaysMapped ? mapped.MEMO_FOR_DAYS : undefined,
      MemoNarration: asText(mapped.MemoNarration),
    }))
    .filter((row) => row.StockNo);

  const rowsSkipped = rowsRead - mappedRows.length;
  const uniqueStockNos = [...new Set(mappedRows.map((row) => row.StockNo as string))];
  const uploadedStockNos = new Set(uniqueStockNos);

  const lastRowByStockNo = new Map<string, ParsedStockRow>();
  for (const row of mappedRows) {
    lastRowByStockNo.set(row.StockNo as string, row);
  }

  if (uniqueStockNos.length === 0) {
    const memoPass = await applyStockUploadMemoLifecyclePasses(
      uploadedStockNos,
      lastRowByStockNo,
      isReturnedCandidateFromUpload,
    );
    return {
      inserted: 0,
      updated: 0,
      memoLinksCreated: 0,
      rowsRead,
      rowsSkipped,
      ...memoPass,
    };
  }

  const existing = await db.stock.findMany({
    where: { StockNo: { in: uniqueStockNos } },
    select: { StockNo: true },
  });
  const existingSet = new Set(existing.map((item) => item.StockNo));

  let inserted = 0;
  let updated = 0;
  let memoLinksCreated = 0;
  const stockData = (row: ParsedStockRow) => ({
    StockType: row.StockType,
    ProductDescription: row.ProductDescription,
    ProductType: row.ProductType,
    ProductStyle: row.ProductStyle,
    StoneShape: row.StoneShape,
    Metal: row.Metal,
    StonePCs: row.StonePCs,
    StoneWT: row.StoneWT,
    MetalType: row.MetalType,
    MetalWT: row.MetalWT,
    StyleNo: row.StyleNo,
    BoxCode: row.BoxCode,
    Location: row.Location,
    HoldDate: row.HoldDate,
    HoldLocation: row.HoldLocation,
    HoldNarration: row.HoldNarration,
  });

  // IMPORTANT: Never delete stock rows — this upload path only inserts/updates (see memo lifecycle helpers below).
  for (const row of mappedRows) {
    const stockNo = row.StockNo as string;
    const data = stockData(row);

    if (existingSet.has(stockNo)) {
      await db.stock.update({
        where: { StockNo: stockNo },
        data: {
          ...data,
          UploadedAt: new Date(),
        },
      });
      updated += 1;
    } else {
      await db.stock.create({
        data: {
          StockNo: stockNo,
          ...data,
        },
      });
      existingSet.add(stockNo);
      inserted += 1;
    }
  }

  const memoPass = await applyStockUploadMemoLifecyclePasses(
    uploadedStockNos,
    lastRowByStockNo,
    isReturnedCandidateFromUpload,
  );

  for (const row of mappedRows) {
    const stockNo = row.StockNo as string;
    if (await syncMemoLinksForStockRow(row, stockNo, memoForDaysMapped)) {
      memoLinksCreated += 1;
    }
  }

  return {
    inserted,
    updated,
    memoLinksCreated,
    rowsRead,
    rowsSkipped,
    ...memoPass,
  };
}

/** Sales.FK → stock: every `StockNo` must exist before we upsert `sales`. */
async function ensureStocksExistForSalesUpload(stockNos: string[]) {
  const unique = [...new Set(stockNos.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  const found = await db.stock.findMany({
    where: { StockNo: { in: unique } },
    select: { StockNo: true },
  });
  const have = new Set(found.map((s) => s.StockNo));
  const missing = unique.filter((sn) => !have.has(sn));
  if (missing.length === 0) {
    return;
  }
  await db.stock.createMany({
    data: missing.map((StockNo) => ({ StockNo })),
    skipDuplicates: true,
  });
}

/**
 * Latest memo_stock.MemoID per stock, only if that memo row still exists (avoids FK errors on
 * `sales.MemoID`).
 */
async function buildValidMemoIdByStockNo(stockNos: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(stockNos.filter(Boolean))];
  if (unique.length === 0) {
    return out;
  }
  const links = await db.memo_stock.findMany({
    where: { StockNo: { in: unique }, MemoID: { not: null } },
    orderBy: { AddedAt: "desc" },
    select: { StockNo: true, MemoID: true },
  });
  for (const link of links) {
    const sn = link.StockNo;
    if (!sn || out.has(sn)) {
      continue;
    }
    out.set(sn, link.MemoID ?? null);
  }
  const candidateIds = [...new Set([...out.values()].filter((id): id is string => Boolean(id)))];
  if (candidateIds.length === 0) {
    return out;
  }
  const memos = await db.memo.findMany({
    where: { MemoID: { in: candidateIds } },
    select: { MemoID: true },
  });
  const valid = new Set(memos.map((m) => m.MemoID));
  for (const [sn, mid] of [...out.entries()]) {
    if (mid && !valid.has(mid)) {
      out.set(sn, null);
    }
  }
  return out;
}

async function processSalesUpload(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  dateFormat: ExcelDateFormat,
  options: { importDebug: boolean; importDebugHalt: boolean },
): Promise<ProcessUploadResult> {
  const part = partitionSalesImportRows(rows, mapping, dateFormat, options);
  if (part.halted) {
    return {
      inserted: 0,
      updated: 0,
      memoLinksCreated: 0,
      rowsRead: part.rowsRead,
      rowsSkipped: part.rowsSkipped,
      importHalted: true,
      haltDetail: part.haltDetail,
      salesImportDebug: part.salesImportDebug,
      ...STOCK_UPLOAD_ZERO_COUNTERS,
    };
  }

  const { mappedRows, rowsRead, rowsSkipped, salesImportDebug, invoiceDateParseSample } = part;
  if (mappedRows.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      memoLinksCreated: 0,
      rowsRead,
      rowsSkipped,
      salesImportDebug,
      ...STOCK_UPLOAD_ZERO_COUNTERS,
    };
  }

  if (invoiceDateParseSample) {
    console.log(
      "[upload/sales] Sample InvoiceDate (first importable row before DB write):",
      invoiceDateParseSample,
    );
  }

  const invoiceNos = [...new Set(mappedRows.map((row) => row.InvoiceNo))];
  const stockNos = [...new Set(mappedRows.map((row) => row.StockNo))];
  const existing = await db.sales.findMany({
    where: {
      InvoiceNo: { in: invoiceNos },
      StockNo: { in: stockNos },
    },
    select: { InvoiceNo: true, StockNo: true },
  });
  const existingSet = new Set(
    existing.map((item) => `${item.InvoiceNo}__${item.StockNo ?? ""}`),
  );

  await ensureStocksExistForSalesUpload(stockNos);
  const memoIdByStock = await buildValidMemoIdByStockNo(stockNos);

  const stockStyles = await db.stock.findMany({
    where: { StockNo: { in: stockNos } },
    select: { StockNo: true, StyleNo: true },
  });
  const styleNoByStockNo = new Map(
    stockStyles.map((s) => [s.StockNo, s.StyleNo ? String(s.StyleNo).trim() || null : null]),
  );

  let inserted = 0;
  let updated = 0;
  for (const row of mappedRows) {
    await ensureClient({ partyCode: row.PartyCode, partyName: row.PartyName });

    const memoId = memoIdByStock.get(row.StockNo) ?? null;
    const resolvedStyleNo = row.StyleNo ?? styleNoByStockNo.get(row.StockNo) ?? null;

    const restockType =
      row.RestockType === "same" || row.RestockType === "different"
        ? row.RestockType
        : null;

    const dedupeKey = `${row.InvoiceNo}__${row.StockNo}`;
    const wasExisting = existingSet.has(dedupeKey);

    await db.sales.upsert({
      where: {
        InvoiceNo_StockNo: {
          InvoiceNo: row.InvoiceNo,
          StockNo: row.StockNo,
        },
      },
      create: {
        InvoiceNo: row.InvoiceNo,
        InvoiceDate: row.InvoiceDate,
        PartyCode: row.PartyCode,
        PartyName: row.PartyName,
        Department: row.Department,
        StockNo: row.StockNo,
        StyleNo: resolvedStyleNo,
        STShapes: row.STShapes,
        ProductType: row.ProductType,
        Metal: row.Metal,
        StonePCs: row.StonePCs,
        StoneWT: row.StoneWT,
        MetalType: row.MetalType,
        MetalWT: row.MetalWT,
        Size: row.Size,
        Remarks: row.Remarks,
        RestockNeeded: row.RestockNeeded,
        RestockType: restockType,
        SaleValue: row.SaleValue ?? null,
        CRAmount: row.CRAmount ?? null,
        MemoID: memoId,
      },
      update: {
        InvoiceDate: row.InvoiceDate,
        PartyCode: row.PartyCode,
        PartyName: row.PartyName,
        Department: row.Department,
        StyleNo: resolvedStyleNo,
        STShapes: row.STShapes,
        ProductType: row.ProductType,
        Metal: row.Metal,
        StonePCs: row.StonePCs,
        StoneWT: row.StoneWT,
        MetalType: row.MetalType,
        MetalWT: row.MetalWT,
        Size: row.Size,
        Remarks: row.Remarks,
        RestockNeeded: row.RestockNeeded,
        RestockType: restockType,
        SaleValue: row.SaleValue ?? null,
        CRAmount: row.CRAmount ?? null,
        MemoID: memoId,
        UploadedAt: new Date(),
      },
    });

    existingSet.add(dedupeKey);
    if (wasExisting) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  return {
    inserted,
    updated,
    memoLinksCreated: 0,
    rowsRead,
    rowsSkipped,
    salesImportDebug,
    ...STOCK_UPLOAD_ZERO_COUNTERS,
  };
}

/** DB fields that must be reachable from the uploaded file (via mapping) for import to run. */
const REQUIRED_MAPPED_FIELDS: Record<ReportType, readonly string[]> = {
  stock: ["StockNo"],
  sales: ["InvoiceNo", "InvoiceDate", "StockNo"],
};

function mappingForPresentHeaders(
  mapping: Record<string, string>,
  presentHeaders: Set<string>,
): Record<string, string> {
  const fileHeaders = [...presentHeaders];
  return Object.fromEntries(
    Object.entries(mapping).filter(([excelHeader]) => {
      const trimmed = excelHeader.trim();
      if (presentHeaders.has(trimmed) || presentHeaders.has(excelHeader)) {
        return true;
      }
      const lower = trimmed.toLowerCase();
      return fileHeaders.some((h) => h.trim().toLowerCase() === lower);
    }),
  );
}

function mapRowToImportSnapshot(
  row: {
    LastImportAt: Date | null;
    LastImportInserted: number | null;
    LastImportUpdated: number | null;
  } | null,
) {
  if (!row) {
    return {
      lastImportAt: null,
      lastImportInserted: null,
      lastImportUpdated: null,
    };
  }
  return {
    lastImportAt: row.LastImportAt?.toISOString() ?? null,
    lastImportInserted: row.LastImportInserted ?? null,
    lastImportUpdated: row.LastImportUpdated ?? null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const [stockRow, salesRow] = await Promise.all([
    db.excel_mappings.findUnique({ where: { ReportType: "stock" } }),
    db.excel_mappings.findUnique({ where: { ReportType: "sales" } }),
  ]);

  const body: UploadImportStatusPayload = {
    stock: mapRowToImportSnapshot(stockRow),
    sales: mapRowToImportSnapshot(salesRow),
  };

  return NextResponse.json(body);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const formData = await request.formData();
  const reportType = String(formData.get("reportType") ?? "") as ReportType;
  const file = formData.get("file");

  if (!REPORT_TYPES.includes(reportType)) {
    return NextResponse.json(
      { message: "Please select a valid report type." },
      { status: 400 },
    );
  }

  try {
    const permissionKey = reportType === "stock" ? "upload.stock" : "upload.sales";
    await requirePermission(auth.userId, permissionKey);
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "Please select a file to upload." },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: "File is too large. Max allowed size is 10MB." },
      { status: 400 },
    );
  }

  const mappingEntry = await db.excel_mappings.findUnique({
    where: { ReportType: reportType },
  });
  const parsedMapping = parseStoredExcelMappingJson(mappingEntry?.Mapping, reportType);
  const mapping = parsedMapping.columns;
  const dateFormat = parsedMapping.dateFormat;
  if (!mappingEntry || Object.keys(mapping).length === 0) {
    return NextResponse.json(
      { message: "Please configure mapping in Excel Map Configuration first." },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  let rows: Record<string, unknown>[] = [];
  try {
    rows = await extractRowsFromWorkbook(Buffer.from(arrayBuffer), {
      filename: file.name,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to parse upload file.",
      },
      { status: 400 },
    );
  }

  const presentHeaders = new Set(rows.flatMap((row) => Object.keys(row)));
  const effectiveMapping = mappingForPresentHeaders(mapping, presentHeaders);

  const required = REQUIRED_MAPPED_FIELDS[reportType];
  const mappedValues = new Set(Object.values(effectiveMapping));
  const missingRequired = required.filter((field) => !mappedValues.has(field));
  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        message: `This file does not include all columns required by your saved mapping. Each of these must map from a column header that exists in this file: ${missingRequired.join(", ")}.`,
        missingRequiredFields: missingRequired,
      },
      { status: 400 },
    );
  }

  const importDebug = ["1", "true", "yes"].includes(
    String(formData.get("importDebug") ?? "").trim().toLowerCase(),
  );
  const importDebugHalt = ["1", "true", "yes"].includes(
    String(formData.get("importDebugHalt") ?? "").trim().toLowerCase(),
  );

  const result =
    reportType === "stock"
      ? await processStockUpload(rows, effectiveMapping, dateFormat)
      : await processSalesUpload(rows, effectiveMapping, dateFormat, { importDebug, importDebugHalt });

  if (result.importHalted && result.haltDetail) {
    return NextResponse.json(
      {
        message: "Import halted on first skipped row (debug mode). No database changes were made.",
        importHalted: true,
        haltDetail: result.haltDetail,
        salesImportDebug: result.salesImportDebug,
      },
      { status: 422 },
    );
  }

  await db.excel_mappings.update({
    where: { ReportType: reportType },
    data: {
      LastImportAt: new Date(),
      LastImportInserted: result.inserted,
      LastImportUpdated: result.updated,
    },
  });

  // Fire-and-forget rankings recalculation after a sales upload — does not block the response.
  if (reportType === "sales") {
    recalculateRankings().catch((err) => {
      console.error("[rankings] recalculateRankings failed after sales upload:", err);
    });
  }

  const parts = [
    `${result.inserted} inserted`,
    `${result.updated} updated`,
    `${result.rowsRead} rows read from file`,
  ];
  const stockMappingTargetsMemo =
    reportType === "stock" &&
    Object.values(effectiveMapping).some((f) => f === "MemoNo" || f === "MemoDate");
  if (reportType === "stock" && result.memoLinksCreated > 0) {
    parts.push(`${result.memoLinksCreated} memo links`);
  } else if (stockMappingTargetsMemo && result.memoLinksCreated === 0) {
    parts.push(
      "0 memo links — each row needs a parsed MemoDate; add MemoNo in the file or leave it blank to key the memo by StockNo",
    );
  }
  if (result.rowsSkipped > 0) {
    parts.push(
      `${result.rowsSkipped} file rows skipped (missing ${reportType === "stock" ? "StockNo" : "InvoiceNo, InvoiceDate, or StockNo"} after mapping)`,
    );
  }
  return NextResponse.json({
    message: `${parts.join(", ")}. Existing rows were refreshed in place.`,
    reportType,
    inserted: result.inserted,
    updated: result.updated,
    memoLinksCreated: result.memoLinksCreated,
    rowsRead: result.rowsRead,
    rowsSkipped: result.rowsSkipped,
    markedSold: result.markedSold,
    markedReturned: result.markedReturned,
    flaggedMissing: result.flaggedMissing,
    memosDeactivated: result.memosDeactivated,
    ...(result.salesImportDebug ? { salesImportDebug: result.salesImportDebug } : {}),
  });
}
