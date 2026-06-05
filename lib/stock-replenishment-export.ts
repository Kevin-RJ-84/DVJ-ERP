import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StockReplenishmentReport } from "@/lib/stock-replenishment";

function modeLabel(mode: StockReplenishmentReport["mode"]): string {
  if (mode === "global") return "Same for all";
  if (mode === "velocity") return "Velocity";
  return "Manual";
}

function configSummary(r: StockReplenishmentReport): string {
  const p: string[] = [modeLabel(r.mode)];
  if (r.mode === "velocity" && r.config.method1Weight != null && r.config.yearsBack != null) {
    p.push(`M1 ${r.config.method1Weight}%`, `${r.config.yearsBack}yr history`);
  }
  if (r.mode === "global" && r.config.globalValue != null) {
    p.push(`global min ${r.config.globalValue}`);
  }
  return p.join(" · ");
}

export function exportStockReplenishmentPdf(report: StockReplenishmentReport) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("Stock Replenishment Report", 40, 40);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date(report.checkedAt).toLocaleString()}`, 40, 58);
  doc.text(`Settings: ${configSummary(report)}`, 40, 74);

  const body = report.items.map((row) => [
    row.styleNo,
    row.productDescription,
    String(row.currentStock),
    String(row.minThreshold),
    String(row.shortage),
    row.severity.toUpperCase(),
  ]);

  const totalShortage = report.items.reduce((a, i) => a + i.shortage, 0);

  autoTable(doc, {
    startY: 90,
    head: [["Style No", "Description", "Current", "Min", "Shortage", "Severity"]],
    body: body.length ? body : [["—", "No items below threshold", "", "", "", ""]],
    foot: [
      [
        "Summary",
        "",
        "",
        "",
        `Shortage pieces: ${totalShortage}`,
        `Critical ${report.criticalCount} · Warning ${report.warningCount}`,
      ],
    ],
    styles: { fontSize: 9 },
    footStyles: { fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 90 } },
  });

  doc.save(`stock-replenishment-${report.checkedAt.slice(0, 10)}.pdf`);
}

export async function exportStockReplenishmentExcel(report: StockReplenishmentReport) {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet("Summary");
  summary.addRow(["Stock Replenishment Report"]);
  summary.addRow(["Generated", new Date(report.checkedAt).toLocaleString()]);
  summary.addRow(["Mode / config", configSummary(report)]);
  summary.addRow(["Total alerts", report.totalAlerts]);
  summary.addRow(["Critical", report.criticalCount]);
  summary.addRow(["Warning", report.warningCount]);
  summary.addRow(["Healthy (evaluated)", report.healthyCount]);

  const data = wb.addWorksheet("Below threshold");
  data.addRow([
    "Style No",
    "Product Description",
    "Current Stock",
    "Min Threshold",
    "Shortage",
    "Severity",
    "% of min",
  ]);
  for (const row of report.items) {
    data.addRow([
      row.styleNo,
      row.productDescription,
      row.currentStock,
      row.minThreshold,
      row.shortage,
      row.severity,
      row.percentageOfMin,
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock-replenishment-${report.checkedAt.slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
