import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { isConfirmedStatus, isFactoryStatus } from "@/lib/replenishment-item-status";

export type ConfirmedReplenishmentExportRow = {
  invoiceNo: string;
  client: string;
  styleNo: string;
  stockNo: string;
  productDescription?: string | null;
  metalType?: string | null;
  metalPurity?: string | null;
  type: string;
  confirmedBy: string;
  date: string;
};

export type FactoryOrderExportRow = {
  invoiceNo: string;
  clientName: string;
  styleNo: string;
  quantity: number;
  productDescription?: string | null;
  metalType?: string | null;
  metalPurity?: string | null;
  stoneShape?: string | null;
  productType?: string | null;
  metal?: string | null;
  notes?: string | null;
};

export type ReplenishmentExportSourceItem = {
  invoiceNo: string;
  partyName: string;
  styleNo: string;
  status: string;
  stockNo?: string | null;
  productDescription?: string | null;
  metalType?: string | null;
  metalPurity?: string | null;
  stoneShape?: string | null;
  productType?: string | null;
  metal?: string | null;
  notes?: string | null;
  quantity?: number;
  replenishedByName?: string;
  replenishedAt?: string;
};

function safeFileSegment(s: string): string {
  const t = s.replace(/[/\\?*[\]:]/g, "_").replace(/\s+/g, " ").trim();
  return t.slice(0, 80) || "export";
}

function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatExportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

export function confirmedTypeLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "stock") return "Stock";
  if (s === "memo") return "Memo";
  if (s === "pullback_confirmed") return "Pullback Confirmed";
  return status;
}

export function toConfirmedExportRows(items: ReplenishmentExportSourceItem[]): ConfirmedReplenishmentExportRow[] {
  return items
    .filter((item) => isConfirmedStatus(item.status))
    .map((item) => ({
      invoiceNo: item.invoiceNo,
      client: item.partyName,
      styleNo: item.styleNo,
      stockNo: item.stockNo && item.stockNo !== "—" ? item.stockNo : "—",
      productDescription: item.productDescription,
      metalType: item.metalType,
      metalPurity: item.metalPurity,
      type: confirmedTypeLabel(item.status),
      confirmedBy: item.replenishedByName ?? "—",
      date: item.replenishedAt ?? new Date().toISOString(),
    }));
}

export function toFactoryExportRows(items: ReplenishmentExportSourceItem[]): FactoryOrderExportRow[] {
  return items
    .filter((item) => isFactoryStatus(item.status))
    .map((item) => ({
      invoiceNo: item.invoiceNo,
      clientName: item.partyName,
      styleNo: item.styleNo,
      quantity: item.quantity ?? 1,
      productDescription: item.productDescription,
      metalType: item.metalType,
      metalPurity: item.metalPurity,
      stoneShape: item.stoneShape,
      productType: item.productType,
      metal: item.metal,
      notes: item.notes,
    }));
}

export function exportConfirmedReplenishmentPdf(
  rows: ConfirmedReplenishmentExportRow[],
  clientName: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("Confirmed Replenishment", 40, 40);
  doc.setFontSize(10);
  doc.text(`Client: ${clientName}`, 40, 58);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 74);

  autoTable(doc, {
    startY: 90,
    head: [["InvoiceNo", "Client", "StyleNo", "StockNo", "Type", "Confirmed By", "Date"]],
    body: rows.length
      ? rows.map((r) => [
          r.invoiceNo,
          r.client,
          r.styleNo,
          r.stockNo,
          r.type,
          r.confirmedBy,
          formatExportDate(r.date),
        ])
      : [["—", "No confirmed items", "", "", "", "", ""]],
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 80 }, 2: { cellWidth: 80 } },
  });

  doc.save(`confirmed-replenishment-${safeFileSegment(clientName)}-${exportDateStamp()}.pdf`);
}

export async function exportConfirmedReplenishmentExcel(
  rows: ConfirmedReplenishmentExportRow[],
  clientName: string,
) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Confirmed");
  sheet.addRow([
    "InvoiceNo",
    "Client",
    "StyleNo",
    "StockNo",
    "ProductDescription",
    "MetalType",
    "MetalPurity",
    "Type",
    "Confirmed By",
    "Date",
  ]);
  for (const r of rows) {
    sheet.addRow([
      r.invoiceNo,
      r.client,
      r.styleNo,
      r.stockNo,
      r.productDescription ?? "",
      r.metalType ?? "",
      r.metalPurity ?? "",
      r.type,
      r.confirmedBy,
      formatExportDate(r.date),
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `confirmed-replenishment-${safeFileSegment(clientName)}-${exportDateStamp()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFactoryOrdersPdf(rows: FactoryOrderExportRow[], clientName: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("Factory Orders", 40, 40);
  doc.setFontSize(10);
  doc.text(`Client: ${clientName}`, 40, 58);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 74);

  autoTable(doc, {
    startY: 90,
    head: [["InvoiceNo", "Client", "StyleNo", "Qty", "ProductDescription", "MetalType", "MetalPurity"]],
    body: rows.length
      ? rows.map((r) => [
          r.invoiceNo,
          r.clientName,
          r.styleNo,
          String(r.quantity),
          r.productDescription ?? "",
          r.metalType ?? "",
          r.metalPurity ?? "",
        ])
      : [["—", "No factory order items", "", "", "", "", ""]],
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 80 }, 2: { cellWidth: 80 } },
  });

  doc.save(`factory-orders-${safeFileSegment(clientName)}-${exportDateStamp()}.pdf`);
}

export async function exportFactoryOrdersExcel(rows: FactoryOrderExportRow[], clientName: string) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Factory Orders");
  sheet.addRow([
    "InvoiceNo",
    "ClientName",
    "StyleNo",
    "Quantity",
    "ProductDescription",
    "MetalType",
    "MetalPurity",
    "StoneShape",
    "ProductType",
    "Metal",
    "Notes",
  ]);
  for (const r of rows) {
    sheet.addRow([
      r.invoiceNo,
      r.clientName,
      r.styleNo,
      r.quantity,
      r.productDescription ?? "",
      r.metalType ?? "",
      r.metalPurity ?? "",
      r.stoneShape ?? "",
      r.productType ?? "",
      r.metal ?? "",
      r.notes ?? "",
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factory-orders-${safeFileSegment(clientName)}-${exportDateStamp()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
