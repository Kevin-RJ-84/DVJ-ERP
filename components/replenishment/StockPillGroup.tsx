"use client";

type Props = {
  allStockNos: string[];
  selectedStockNos: Set<string>;
  onToggle: (stockNo: string) => void;
};

export function StockPillGroup({ allStockNos, selectedStockNos, onToggle }: Props) {
  if (allStockNos.length === 0) {
    return <span className="text-xs text-stone-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {allStockNos.map((sn) => {
        const selected = selectedStockNos.has(sn);
        return (
          <button
            key={sn}
            type="button"
            onClick={() => onToggle(sn)}
            title={selected ? "Click to deselect" : "Click to select"}
            className={[
              "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
              selected
                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                : "bg-stone-200 text-stone-500 hover:bg-stone-300",
            ].join(" ")}
          >
            {sn}
          </button>
        );
      })}
    </div>
  );
}
