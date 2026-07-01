import ExcelJS from "exceljs";

export type ClientReplenishmentExcelRow = {
  groupValue: string;
  stoneShape: string;
  metal: string;
  metalType: string;
  productType: string;
  productStyle: string;
  soldQty: number;
  overrideQty: number;
  inWarehouse: number;
  pullbackAvailable: number;
  factoryOrder: number;
  selectedStockNos: string;
};

function safeFileSegment(s: string): string {
  const t = s.replace(/[/\\?*[\]:]/g, "_").replace(/\s+/g, " ").trim();
  return t.slice(0, 80) || "client";
}

export async function exportClientReplenishmentExcel(params: {
  clientName: string;
  fromDate: string;
  toDate: string;
  groupBy: string;
  rows: ClientReplenishmentExcelRow[];
}) {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("Summary");
  sum.addRow(["Client name", params.clientName]);
  sum.addRow(["Date range", `${params.fromDate} → ${params.toDate}`]);
  sum.addRow(["Group by", params.groupBy]);
  sum.addRow(["Generated at", new Date().toISOString()]);

  const data = wb.addWorksheet("Results");
  data.addRow([
    "Group value",
    "Shape",
    "Metal",
    "Metal Type",
    "Product Type",
    "Product Style",
    "Sold qty",
    "Override qty",
    "In warehouse",
    "Pullback available",
    "Factory order",
    "Selected StockNos",
  ]);
  for (const r of params.rows) {
    data.addRow([
      r.groupValue,
      r.stoneShape,
      r.metal,
      r.metalType,
      r.productType,
      r.productStyle,
      r.soldQty,
      r.overrideQty,
      r.inWarehouse,
      r.pullbackAvailable,
      r.factoryOrder,
      r.selectedStockNos,
    ]);
  }

  const party = safeFileSegment(params.clientName);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `client-replenishment-${party}-${params.fromDate}-${params.toDate}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
