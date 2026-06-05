import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

type ParseOptions = {
  filename?: string;
};

function getExtension(filename?: string) {
  const clean = filename?.trim().toLowerCase();
  if (!clean || !clean.includes(".")) {
    return "";
  }
  return clean.split(".").pop() ?? "";
}

function normalizeHeaderRow(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function assertSupportedExtension(filename?: string) {
  const ext = getExtension(filename);
  if (ext === "xls") {
    throw new Error(
      "Legacy .xls is not supported. Please re-save file as .xlsx or .csv and upload again.",
    );
  }
}

/**
 * Prefer `cell.value` (Date, number, formula result) over `.text`, which is often empty for
 * typed Excel dates and numeric memo numbers.
 */
function xlsxCellToScalar(cell: ExcelJS.Cell): unknown {
  const raw = cell.value;
  if (raw === null || raw === undefined) {
    const t = cell.text?.trim();
    return t && t.length > 0 ? t : null;
  }
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof raw === "boolean") {
    return raw ? "1" : "0";
  }
  if (typeof raw === "object" && raw !== null && "result" in raw) {
    const r = (raw as { result?: unknown }).result;
    if (r instanceof Date) {
      return r.toISOString().slice(0, 10);
    }
    if (typeof r === "number" && Number.isFinite(r)) {
      return r;
    }
    if (typeof r === "string" && r.trim()) {
      return r.trim();
    }
  }
  /** ExcelJS rich text / hyperlink wrapper — common on formatted currency cells */
  if (typeof raw === "object" && raw !== null && "richText" in raw) {
    const rt = (raw as { richText: { text?: string }[] }).richText;
    if (Array.isArray(rt)) {
      const s = rt.map((p) => String(p?.text ?? "")).join("").trim();
      if (s.length > 0) {
        return s;
      }
    }
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "text" in raw &&
    typeof (raw as { text?: unknown }).text === "string"
  ) {
    const t = String((raw as { text: string }).text).trim();
    if (t.length > 0) {
      return t;
    }
  }
  const fallback = cell.text?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}

async function readXlsxRows(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS typings use a legacy `Buffer` declaration that disagrees with Node's generic Buffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const rows: Record<string, unknown>[] = [];
  const headerRow = worksheet.getRow(1);
  const headers = normalizeHeaderRow((headerRow.values as unknown[]).slice(1));

  if (headers.length === 0) {
    return [];
  }

  // `worksheet.rowCount` can stop short of the real used range in some workbooks; `dimensions`
  // reflects the bounding box of cells with content/styles and usually reaches the last data row.
  const dimBottom = worksheet.dimensions?.bottom ?? 0;
  const lastRow = Math.max(worksheet.rowCount, dimBottom, 2);

  for (let rowIndex = 2; rowIndex <= lastRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const mapped: Record<string, unknown> = {};
    let hasAnyValue = false;

    headers.forEach((header, index) => {
      const cell = row.getCell(index + 1);
      const scalar = xlsxCellToScalar(cell);
      mapped[header] = scalar;
      if (scalar !== null && scalar !== undefined && String(scalar).trim() !== "") {
        hasAnyValue = true;
      }
    });

    if (hasAnyValue) {
      rows.push(mapped);
    }
  }

  return rows;
}

function readCsvRows(buffer: Buffer) {
  const text = buffer.toString("utf8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];
}

export async function extractRowsFromWorkbook(buffer: Buffer, options?: ParseOptions) {
  assertSupportedExtension(options?.filename);
  const ext = getExtension(options?.filename);

  if (ext === "csv") {
    return readCsvRows(buffer);
  }

  return readXlsxRows(buffer);
}

export async function extractHeadersFromWorkbook(buffer: Buffer, options?: ParseOptions) {
  const rows = await extractRowsFromWorkbook(buffer, options);
  const firstRow = rows[0];
  if (!firstRow) {
    return [];
  }
  return Object.keys(firstRow).map((header) => header.trim()).filter(Boolean);
}
