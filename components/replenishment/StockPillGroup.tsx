"use client";

type Props = {
  allStockNos: string[];
  selectedStockNos: Set<string>;
  onToggle: (stockNo: string) => void;
  variant?: "warehouse" | "hold";
  labelPrefix?: string;
  /** When set, renders this text inside the pill instead of stockNo (read-only display). */
  displayText?: string;
  readOnly?: boolean;
};

export function StockPillGroup({
  allStockNos,
  selectedStockNos,
  onToggle,
  variant = "warehouse",
  labelPrefix,
  displayText,
  readOnly = false,
}: Props) {
  if (allStockNos.length === 0) {
    return <span className="text-xs text-stone-400">—</span>;
  }
  const selectedClass =
    variant === "hold"
      ? "bg-pink-500 text-white hover:bg-pink-600"
      : "bg-emerald-500 text-white hover:bg-emerald-600";
  const unselectedClass =
    variant === "hold"
      ? "bg-pink-100 text-pink-800 hover:bg-pink-200"
      : "bg-stone-200 text-stone-500 hover:bg-stone-300";
  return (
    <div className="flex flex-wrap gap-1">
      {allStockNos.map((sn) => {
        const selected = selectedStockNos.has(sn);
        const label = displayText ?? (labelPrefix ? `${labelPrefix} · ${sn}` : sn);
        const className = [
          "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
          selected ? selectedClass : unselectedClass,
          readOnly ? "cursor-default" : "",
        ].join(" ");

        if (readOnly) {
          return (
            <span key={sn} className={className}>
              {label}
            </span>
          );
        }

        return (
          <button
            key={sn}
            type="button"
            onClick={() => onToggle(sn)}
            title={selected ? "Click to deselect" : "Click to select"}
            className={className}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
