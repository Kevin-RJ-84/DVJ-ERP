import ExcelJS from "exceljs";

export type ReplenishmentHistoryExcelRow = {
  invoiceNo: string;
  groupField: string;
  groupValue: string;
  stockNo: string;
  type: string;
  replenishedBy: string;
  replenishedAt: string;
  status: string;
};

export async function exportReplenishmentHistoryExcel(rows: ReplenishmentHistoryExcelRow[]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("History");
  sheet.addRow([
    "InvoiceNo",
    "Group Field",
    "Group Value",
    "StockNo",
    "Type",
    "Replenished By",
    "Replenished At",
    "Status",
  ]);
  for (const r of rows) {
    sheet.addRow([
      r.invoiceNo,
      r.groupField,
      r.groupValue,
      r.stockNo,
      r.type,
      r.replenishedBy,
      r.replenishedAt,
      r.status,
    ]);
  }

  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `replenishment-history-${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
