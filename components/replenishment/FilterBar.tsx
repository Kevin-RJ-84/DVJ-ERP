"use client";

import {
  Gem,
  Hash,
  Layers,
  Package,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReplenishmentFilters } from "@/lib/replenishment";

type OptionsResponse = {
  options: {
    stoneShapes: string[];
    metals: string[];
    metalTypes: string[];
    productTypes: string[];
    productStyles: string[];
  };
};

type FilterBarProps = {
  value: ReplenishmentFilters;
  requiredQty: number | "";
  onChange: (next: ReplenishmentFilters) => void;
  onRequiredQtyChange: (value: number | "") => void;
  onSearch: () => void;
  searching: boolean;
};

const inputClass =
  "h-11 w-full rounded-xl border border-stone-200/80 bg-white/85 px-3 text-sm text-stone-900 outline-none backdrop-blur-sm transition-colors duration-200 placeholder:text-stone-400 focus:border-violet-500/45 focus:ring-2 focus:ring-violet-500/15";

export function FilterBar({
  value,
  requiredQty,
  onChange,
  onRequiredQtyChange,
  onSearch,
  searching,
}: FilterBarProps) {
  const [options, setOptions] = useState<OptionsResponse["options"]>({
    stoneShapes: [],
    metals: [],
    metalTypes: [],
    productTypes: [],
    productStyles: [],
  });
  const [styleSuggestions, setStyleSuggestions] = useState<string[]>([]);

  useEffect(() => {
    async function loadOptions() {
      const response = await fetch("/api/replenishment/options");
      if (!response.ok) return;
      const result = (await response.json()) as OptionsResponse;
      setOptions(result.options);
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    const query = value.styleNo?.trim();
    if (!query || query.length < 1) {
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const response = await fetch(
        `/api/replenishment/options?styleQuery=${encodeURIComponent(query)}`,
      );
      if (!response.ok || !active) return;
      const result = (await response.json()) as { styleSuggestions?: string[] };
      if (active) {
        setStyleSuggestions(result.styleSuggestions ?? []);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value.styleNo]);

  return (
    <section className="rounded-[1.75rem] border border-white/55 bg-white/70 p-4 shadow-[0_20px_50px_-18px_rgba(15,15,15,0.07)] backdrop-blur-lg sm:p-6">
      <div className="mb-4 flex items-center gap-2.5 border-b border-stone-200/60 pb-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-sky-600 text-white shadow-md ring-1 ring-white/30">
          <SlidersHorizontal className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Filters</h2>
          <p className="text-xs text-stone-600">Refine scope, then search to refresh metrics.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
            <Hash className="size-3.5 text-stone-400" aria-hidden />
            Style No
          </label>
          <input
            list="style-suggestions"
            value={value.styleNo ?? ""}
            onChange={(event) => {
              const next = event.target.value;
              onChange({ ...value, styleNo: next });
              if (!next.trim()) {
                setStyleSuggestions([]);
              }
            }}
            placeholder="Type style number"
            className={inputClass}
          />
          <datalist id="style-suggestions">
            {styleSuggestions.map((style) => (
              <option key={style} value={style} />
            ))}
          </datalist>
        </div>

        <SelectField
          label="Stone Shape"
          icon={Gem}
          value={value.stoneShape ?? ""}
          onChange={(newValue) => onChange({ ...value, stoneShape: newValue || undefined })}
          options={options.stoneShapes}
        />
        <SelectField
          label="Metal"
          icon={Layers}
          value={value.metal ?? ""}
          onChange={(newValue) => onChange({ ...value, metal: newValue || undefined })}
          options={options.metals}
        />
        <SelectField
          label="Metal Type"
          icon={Layers}
          value={value.metalType ?? ""}
          onChange={(newValue) => onChange({ ...value, metalType: newValue || undefined })}
          options={options.metalTypes}
        />
        <SelectField
          label="Product Type"
          icon={Package}
          value={value.productType ?? ""}
          onChange={(newValue) => onChange({ ...value, productType: newValue || undefined })}
          options={options.productTypes}
        />
        <SelectField
          label="Product Style"
          icon={Package}
          value={value.productStyle ?? ""}
          onChange={(newValue) => onChange({ ...value, productStyle: newValue || undefined })}
          options={options.productStyles}
        />

        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
            <Package className="size-3.5 text-stone-400" aria-hidden />
            Required quantity
          </label>
          <input
            type="number"
            min={1}
            value={requiredQty}
            onChange={(event) =>
              onRequiredQtyChange(
                event.target.value ? Number(event.target.value) : "",
              )
            }
            placeholder="e.g. 12"
            className={inputClass}
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onSearch}
            disabled={searching || !requiredQty}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-sky-600 px-5 text-sm font-semibold text-white shadow-md shadow-violet-900/15 transition-colors duration-200 hover:from-violet-500 hover:to-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white/80 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            <Search className="size-4 shrink-0 opacity-90" aria-hidden />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectField({
  label,
  icon: Icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (next: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
        <Icon className="size-3.5 text-stone-400" aria-hidden />
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} cursor-pointer`}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
