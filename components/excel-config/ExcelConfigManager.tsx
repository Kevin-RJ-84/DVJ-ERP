"use client";

import { useEffect, useMemo, useState } from "react";
import {
  REPORT_TYPES,
  EXCEL_DATE_FORMATS,
  getFieldsForReportType,
  type ReportType,
  type ExcelDateFormat,
} from "@/lib/excel-config";

type ConfigResponse = {
  reportType: ReportType;
  mapping: Record<string, string>;
  dateFormat?: ExcelDateFormat;
  updatedAt: string | null;
  fields: readonly string[];
};

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  stock: "Stock Report Mapping",
  sales: "Sales Report Mapping",
};

const DEFAULT_DATE_FORMAT: ExcelDateFormat = "DD/MM/YYYY";

export function ExcelConfigManager() {
  const [reportType, setReportType] = useState<ReportType>("stock");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = useState<ExcelDateFormat>(DEFAULT_DATE_FORMAT);
  const [fields, setFields] = useState<readonly string[]>(
    getFieldsForReportType("stock"),
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mappedCount = useMemo(
    () => Object.values(mapping).filter(Boolean).length,
    [mapping],
  );

  const hasRequiredMappings = useMemo(() => {
    const values = new Set(Object.values(mapping).filter(Boolean));
    if (reportType === "stock") {
      return values.has("StockNo");
    }
    return (
      values.has("InvoiceNo") &&
      values.has("InvoiceDate") &&
      values.has("StockNo")
    );
  }, [mapping, reportType]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMapping() {
      setIsLoading(true);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(`/api/excel-config?reportType=${reportType}`);
        const result = (await response.json()) as ConfigResponse & { message?: string };
        if (!response.ok) {
          setError(result.message ?? "Unable to load mapping.");
          return;
        }

        if (!isCancelled) {
          setMapping(result.mapping ?? {});
          setDateFormat(result.dateFormat ?? DEFAULT_DATE_FORMAT);
          setFields(result.fields?.length ? result.fields : getFieldsForReportType(reportType));
          setUpdatedAt(result.updatedAt);
          setHeaders((current) =>
            current.length > 0 ? current : Object.keys(result.mapping ?? {}),
          );
        }
      } catch {
        if (!isCancelled) {
          setError("Unexpected network error while loading mappings.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadMapping();
    return () => {
      isCancelled = true;
    };
  }, [reportType]);

  async function handleSampleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsDetecting(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("reportType", reportType);
      formData.append("sampleFile", file);

      const response = await fetch("/api/excel-config", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        headers?: string[];
        fields?: string[];
        message?: string;
      };

      if (!response.ok) {
        setError(result.message ?? "Failed to detect headers.");
        return;
      }

      const detectedHeaders = result.headers ?? [];
      setHeaders(detectedHeaders);
      setFields(result.fields?.length ? result.fields : getFieldsForReportType(reportType));
      setMapping((previous) => {
        const next: Record<string, string> = {};
        for (const header of detectedHeaders) {
          const existing = previous[header];
          if (existing) {
            next[header] = existing;
          }
        }
        return next;
      });
      setNotice(
        detectedHeaders.length > 0
          ? `Detected ${detectedHeaders.length} headers from the uploaded sample file.`
          : "No headers found in the uploaded sample file.",
      );
    } catch {
      setError("Unexpected network error while detecting headers.");
    } finally {
      setIsDetecting(false);
      event.target.value = "";
    }
  }

  async function handleSaveMapping() {
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/excel-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, mapping, dateFormat }),
      });
      const result = (await response.json()) as ConfigResponse & { message?: string };

      if (!response.ok) {
        setError(result.message ?? "Failed to save mapping.");
        return;
      }

      setMapping(result.mapping ?? {});
      setDateFormat(result.dateFormat ?? DEFAULT_DATE_FORMAT);
      setUpdatedAt(result.updatedAt);
      setNotice(result.message ?? "Mapping saved.");
    } catch {
      setError("Unexpected network error while saving mapping.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="box-border flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <header className="border-b border-slate-200/70 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Import pipeline</p>
        <p className="mt-1 text-sm text-slate-600">
          Upload a sample file, map Excel headers to database fields, then save for automated ingestion.
        </p>
      </header>

      <div className="mt-4 box-border w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="grid w-full min-w-0 max-w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex min-w-0 max-w-full flex-wrap gap-2">
            {REPORT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setReportType(type);
                  setHeaders([]);
                  setNotice(null);
                  setError(null);
                }}
                className={`h-10 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-400/35 focus:ring-offset-2 ${
                  reportType === type
                    ? "border-violet-500/40 bg-violet-600 text-white hover:bg-violet-500"
                    : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-900"
                }`}
              >
                {REPORT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 md:justify-end">
            <span className="max-w-full text-xs text-slate-600">Sample: `.xlsx` or `.csv`</span>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors duration-200 hover:border-violet-300 hover:text-violet-900">
              {isDetecting ? "Detecting..." : "Upload Sample"}
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={handleSampleUpload}
                disabled={isDetecting}
                className="sr-only"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-900">
            Step 2: Map headers ({mappedCount}/{headers.length || 0} mapped)
          </p>
          {updatedAt ? (
            <p className="text-xs text-slate-500">Last saved: {new Date(updatedAt).toLocaleString()}</p>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
            Loading mapping...
          </div>
        ) : headers.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
            No headers detected yet. Upload a sample file to auto-detect columns.
          </div>
        ) : (
          <>
            {!hasRequiredMappings ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {reportType === "stock" ? (
                  <span>
                    Select which Excel column maps to <strong>StockNo</strong> before saving.
                  </span>
                ) : (
                  <span>
                    Map at least one column each to <strong>InvoiceNo</strong>, <strong>InvoiceDate</strong>, and{" "}
                    <strong>StockNo</strong> before saving.
                  </span>
                )}
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
                <label htmlFor="excel-date-format" className="text-sm font-medium text-slate-800">
                  Text / slash date format
                </label>
                <p className="text-xs text-slate-500">
                  Used when dates appear as text (e.g. 07/01/2026). Typed Excel dates and{" "}
                  <code className="rounded bg-slate-100 px-1 text-slate-700">YYYY-MM-DD</code> cells are unambiguous.
                </p>
              </div>
              <select
                id="excel-date-format"
                value={dateFormat}
                onChange={(event) => setDateFormat(event.target.value as ExcelDateFormat)}
                disabled={isLoading}
                className="h-10 w-full shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors duration-200 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 sm:w-48 disabled:opacity-60"
              >
                {EXCEL_DATE_FORMATS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt}
                  </option>
                ))}
              </select>
            </div>

              <div className="mt-5 relative h-full min-h-[320px] overflow-y-auto rounded-lg border border-slate-300 bg-white">
                <table className="w-full table-fixed border-separate border-spacing-0">
                  <colgroup>
                    <col className="w-[42%]" />
                    <col className="w-[58%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Excel Header
                      </th>
                      <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        DB Field
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((header) => (
                      <tr key={header}>
                        <td className="border-b border-slate-100 px-4 py-3 text-sm text-slate-700">
                          <span className="block truncate" title={header}>
                            {header}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-3">
                          <select
                            value={mapping[header] ?? ""}
                            onChange={(event) =>
                              setMapping((prev) => ({
                                ...prev,
                                [header]: event.target.value,
                              }))
                            }
                            className="h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors duration-200 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                          >
                            <option value="">Ignore this column</option>
                            {fields.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </>
        )}
      </div>

      {error ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="flex justify-end mt-5 pt-5">
        <button
          type="button"
          onClick={handleSaveMapping}
          disabled={isSaving || isLoading || headers.length === 0 || !hasRequiredMappings}
          className="mt-5 h-11 cursor-pointer rounded-full bg-gradient-to-r from-violet-600 to-sky-600 px-8 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors duration-200 hover:from-violet-500 hover:to-sky-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Mapping"}
        </button>
      </div>
    </section>
  );
}
