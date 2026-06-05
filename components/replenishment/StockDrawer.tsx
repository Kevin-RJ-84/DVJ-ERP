"use client";

type InStockItem = {
  StockNo: string;
  StockType: string | null;
  Location: string | null;
};

type PullbackItem = {
  StockNo: string;
  PartyName: string | null;
  MemoNo: string;
  MemoEndDate: string;
};

type StockDrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  mode: "inStock" | "pullback";
  inStockItems?: InStockItem[];
  pullbackItems?: PullbackItem[];
};

function escapeCsvValue(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

export function StockDrawer({
  open,
  title,
  onClose,
  mode,
  inStockItems = [],
  pullbackItems = [],
}: StockDrawerProps) {
  if (!open) {
    return null;
  }

  const exportData =
    mode === "inStock"
      ? {
          filename: "in-stock-items.csv",
          header: ["StockNo", "StockType", "Location"],
          rows: inStockItems.map((item) => [
            item.StockNo,
            item.StockType ?? "",
            item.Location ?? "",
          ]),
        }
      : {
          filename: "pullback-items.csv",
          header: ["StockNo", "PartyName", "MemoNo", "MemoEndDate"],
          rows: pullbackItems.map((item) => [
            item.StockNo,
            item.PartyName ?? "",
            item.MemoNo,
            new Date(item.MemoEndDate).toISOString().slice(0, 10),
          ]),
        };

  function handleExportCsv() {
    const lines = [
      exportData.header.map(escapeCsvValue).join(","),
      ...exportData.rows.map((row) => row.map((value) => escapeCsvValue(String(value))).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", exportData.filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
      <aside className="h-full w-full max-w-2xl border-l border-white/40 bg-white/80 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/60 pb-5">
          <h3 className="font-serif text-2xl text-slate-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-10 cursor-pointer rounded-xl border border-slate-200/80 bg-white/70 px-3 text-sm text-slate-700 backdrop-blur-sm transition-colors duration-200 hover:border-rose-400/50 hover:text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:ring-offset-2"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 cursor-pointer rounded-xl border border-slate-200/80 bg-white/70 px-3 text-sm text-slate-700 backdrop-blur-sm transition-colors duration-200 hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-auto">
          {mode === "inStock" ? (
            <table className="min-w-full divide-y divide-slate-200/70">
              <thead className="bg-slate-50/90 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Stock No
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Stock Type
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/60">
                {inStockItems.map((item) => (
                  <tr key={item.StockNo}>
                    <td className="px-3 py-3 text-sm text-slate-900">{item.StockNo}</td>
                    <td className="px-3 py-3 text-sm text-slate-700">{item.StockType ?? "-"}</td>
                    <td className="px-3 py-3 text-sm text-slate-700">{item.Location ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-slate-200/70">
              <thead className="bg-slate-50/90 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Stock No
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Client
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Memo No
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Memo End Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/60">
                {pullbackItems.map((item) => (
                  <tr key={`${item.StockNo}-${item.MemoNo}`}>
                    <td className="px-3 py-3 text-sm text-slate-900">{item.StockNo}</td>
                    <td className="px-3 py-3 text-sm text-slate-700">{item.PartyName ?? "-"}</td>
                    <td className="px-3 py-3 text-sm text-slate-700">{item.MemoNo}</td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      {new Date(item.MemoEndDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}
