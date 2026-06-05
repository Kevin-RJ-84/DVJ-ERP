export const REPORT_TYPES = ["stock", "sales"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const STOCK_REPORT_FIELDS = [
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
  "Company",
  "MemoNo",
  "MemoDate",
  "Terms",
  /** Memo duration in days from Excel; 0 = in warehouse (no memo). See CHANGES-6 Part 7. */
  "MEMO_FOR_DAYS",
  "MemoNarration",
] as const;

export const SALES_REPORT_FIELDS = [
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
] as const;

export function getFieldsForReportType(reportType: ReportType) {
  return reportType === "stock" ? STOCK_REPORT_FIELDS : SALES_REPORT_FIELDS;
}

/** How slash-delimited text dates in Excel uploads are interpreted (ISO `YYYY-MM-DD` cells stay unambiguous). */
export const EXCEL_DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export type ExcelDateFormat = (typeof EXCEL_DATE_FORMATS)[number];

export function defaultExcelDateFormatForReport(_reportType: ReportType): ExcelDateFormat {
  return "DD/MM/YYYY";
}

export function isExcelDateFormat(value: unknown): value is ExcelDateFormat {
  return typeof value === "string" && (EXCEL_DATE_FORMATS as readonly string[]).includes(value);
}

export function parseExcelDateFormat(value: unknown, fallback: ExcelDateFormat): ExcelDateFormat {
  return isExcelDateFormat(value) ? value : fallback;
}

/**
 * Normalize header → DB field entries (only allowed fields for the report type).
 */
export function sanitizeExcelColumnMapping(
  rawMapping: unknown,
  reportType: ReportType,
): Record<string, string> {
  const allowedFields = new Set<string>(getFieldsForReportType(reportType));
  const input =
    rawMapping && typeof rawMapping === "object" && !Array.isArray(rawMapping)
      ? (rawMapping as Record<string, unknown>)
      : {};

  const sanitized: Record<string, string> = {};
  for (const [excelHeader, dbField] of Object.entries(input)) {
    const header = excelHeader.trim();
    if (!header || typeof dbField !== "string") {
      continue;
    }

    const fieldName = dbField.trim();
    if (!fieldName || !allowedFields.has(fieldName)) {
      continue;
    }

    sanitized[header] = fieldName;
  }

  return sanitized;
}

export type ParsedStoredExcelMapping = {
  columns: Record<string, string>;
  dateFormat: ExcelDateFormat;
};

/**
 * Read `excel_mappings.Mapping` JSON: supports legacy flat `{ [header]: field }` or
 * `{ columns: { … }, dateFormat?: … }`.
 */
export function parseStoredExcelMappingJson(
  raw: unknown,
  reportType: ReportType,
): ParsedStoredExcelMapping {
  const fallbackFormat = defaultExcelDateFormatForReport(reportType);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { columns: {}, dateFormat: fallbackFormat };
  }

  const o = raw as Record<string, unknown>;

  if (
    "columns" in o &&
    o.columns &&
    typeof o.columns === "object" &&
    !Array.isArray(o.columns)
  ) {
    return {
      columns: sanitizeExcelColumnMapping(o.columns, reportType),
      dateFormat: parseExcelDateFormat(o.dateFormat, fallbackFormat),
    };
  }

  return {
    columns: sanitizeExcelColumnMapping(raw, reportType),
    dateFormat: parseExcelDateFormat(o.dateFormat, fallbackFormat),
  };
}

export function buildStoredExcelMappingJson(
  columns: Record<string, string>,
  dateFormat: ExcelDateFormat,
): Record<string, unknown> {
  return { columns, dateFormat };
}
