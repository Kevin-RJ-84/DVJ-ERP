"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, Settings2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { REPORT_TYPES, type ReportType } from "@/lib/excel-config";
import type { UploadImportStatusPayload } from "@/lib/import-upload";
import {
  alertError,
  alertSuccess,
  btnPrimary,
  btnSecondary,
  fieldInput,
  fieldLabel,
  modalCloseBtn,
  modalOverlay,
  modalPanel,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

const REPORT_LABELS: Record<ReportType, string> = {
  stock: "Stock Report",
  sales: "Sales Report",
};

export type UploadModalProps = {
  mode?: "standalone" | "controlled";
  open?: boolean;
  onClose?: () => void;
  defaultReportType?: ReportType;
};

export function UploadModal({
  mode = "standalone",
  open: controlledOpen,
  onClose,
  defaultReportType = "stock",
}: UploadModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>(defaultReportType);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importDebug, setImportDebug] = useState(false);
  const [importDebugHalt, setImportDebugHalt] = useState(false);
  const [debugPayload, setDebugPayload] = useState<string | null>(null);
  const [mappingStatus, setMappingStatus] = useState<UploadImportStatusPayload | null>(null);
  const [isCheckingMappings, setIsCheckingMappings] = useState(false);

  const isControlled = mode === "controlled";
  const isOpen = isControlled ? Boolean(controlledOpen) : internalOpen;

  useEffect(() => {
    if (!isControlled || !controlledOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setReportType(defaultReportType);
      setFile(null);
      setError(null);
      setNotice(null);
      setDebugPayload(null);
    });
    return () => {
      cancelled = true;
    };
  }, [isControlled, controlledOpen, defaultReportType]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function loadMappingStatus() {
      setIsCheckingMappings(true);
      try {
        const response = await fetch("/api/upload", { credentials: "same-origin" });
        const result = (await response.json()) as UploadImportStatusPayload & { message?: string };
        if (!cancelled && response.ok) {
          setMappingStatus(result);
        }
      } catch {
        // Upload POST remains the source of truth if this lightweight readiness check fails.
      } finally {
        if (!cancelled) {
          setIsCheckingMappings(false);
        }
      }
    }

    void loadMappingStatus();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  function closeDialog() {
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  }

  function openStandalone() {
    setInternalOpen(true);
    setError(null);
    setNotice(null);
    setDebugPayload(null);
  }

  const currentMappingStatus = mappingStatus?.[reportType] ?? null;
  const mappingReady = currentMappingStatus?.mappingConfigured ?? false;
  const shouldBlockForMapping = Boolean(currentMappingStatus && !currentMappingStatus.mappingConfigured);
  const missingRequiredFields = currentMappingStatus?.missingRequiredFields ?? [];

  async function handleUpload() {
    if (shouldBlockForMapping) {
      setError("Configure the Excel mapping before uploading this report type.");
      return;
    }

    if (!file) {
      setError("Please select a file before uploading.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    setDebugPayload(null);
    try {
      const formData = new FormData();
      formData.append("reportType", reportType);
      formData.append("file", file);
      if (importDebug) formData.append("importDebug", "1");
      if (importDebugHalt) formData.append("importDebugHalt", "1");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const result = (await response.json()) as {
        message?: string;
        haltDetail?: unknown;
        salesImportDebug?: unknown;
      };
      if (!response.ok) {
        setError(result.message ?? "Upload failed.");
        if (result.haltDetail || result.salesImportDebug) {
          setDebugPayload(
            JSON.stringify(
              { haltDetail: result.haltDetail, salesImportDebug: result.salesImportDebug },
              null,
              2,
            ),
          );
        }
        return;
      }

      setNotice(result.message ?? "Upload completed.");
      if (result.salesImportDebug) {
        setDebugPayload(JSON.stringify(result.salesImportDebug, null, 2));
      }
      setFile(null);
      window.dispatchEvent(new CustomEvent("dvj:data-imported"));
    } catch {
      setError("Unexpected network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {!isControlled ? (
        <button type="button" onClick={openStandalone} className={btnSecondary}>
          <Upload className="size-4" aria-hidden />
          Upload Excel
        </button>
      ) : null}

      {isOpen ? (
        <div className={cn(modalOverlay, "z-[200]")} role="presentation" onClick={closeDialog}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-dialog-title"
            className={cn(
              modalPanel,
              "flex max-h-[min(92dvh,920px)] max-w-2xl flex-col overflow-hidden",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Data import
                  </p>
                  <h3 id="upload-dialog-title" className="mt-1 text-lg font-semibold text-foreground">
                    Upload report file
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">.xlsx or .csv — mapped columns apply.</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    First time: set column mapping in{" "}
                    <Link
                      href="/excel-config"
                      className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground/40"
                      onClick={closeDialog}
                    >
                      Excel map config
                    </Link>
                    , then upload here.
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeDialog} className={modalCloseBtn} aria-label="Close">
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 py-6">
              <label className={fieldLabel}>
                Report type
                <select
                  value={reportType}
                  onChange={(event) => {
                    setReportType(event.target.value as ReportType);
                    setFile(null);
                    setError(null);
                    setNotice(null);
                    setDebugPayload(null);
                  }}
                  className={fieldInput}
                >
                  {REPORT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {REPORT_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>

              {isCheckingMappings ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                  Checking saved Excel mapping before upload…
                </div>
              ) : shouldBlockForMapping ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <AlertTriangle className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">Configure {REPORT_LABELS[reportType].toLowerCase()} mapping first</p>
                      <p className="mt-1 leading-relaxed text-amber-900/85">
                        Uploads need a saved column map so the importer knows which Excel headers contain{" "}
                        {missingRequiredFields.length > 0 ? missingRequiredFields.join(", ") : "the required fields"}.
                      </p>
                      <Link
                        href="/excel-config"
                        onClick={closeDialog}
                        className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-amber-950 px-4 text-sm font-semibold text-white transition hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/30"
                      >
                        <Settings2 className="size-4" aria-hidden />
                        Open Excel map config
                      </Link>
                    </div>
                  </div>
                </div>
              ) : currentMappingStatus ? (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  Mapping ready for {REPORT_LABELS[reportType].toLowerCase()} ({currentMappingStatus.mappedFieldCount} fields).
                </div>
              ) : null}

              <label className={fieldLabel}>
                File (.xlsx / .csv)
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={isCheckingMappings || shouldBlockForMapping}
                  className={cn(
                    fieldInput,
                    "h-auto py-2 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-accent",
                  )}
                />
                {file ? <p className="mt-1.5 text-xs font-medium text-muted-foreground">{file.name}</p> : null}
              </label>

              {reportType === "sales" ? (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sales import diagnostics
                  </p>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={importDebug}
                      onChange={(e) => setImportDebug(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Debug</span> — include skip breakdown and
                      sample rows in the response.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={importDebugHalt}
                      onChange={(e) => setImportDebugHalt(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Halt on first bad row</span> — stops before
                      writing; returns <span className="font-mono text-xs">422</span> with failure reason.
                    </span>
                  </label>
                </div>
              ) : null}

              {error ? (
                <div className={alertError}>
                  <p>{error}</p>
                  <p className="mt-1 text-xs opacity-90">
                    Check{" "}
                    <Link href="/excel-config" className="font-semibold underline underline-offset-2">
                      Excel map config
                    </Link>{" "}
                    if headers or required fields do not match this file.
                  </p>
                </div>
              ) : null}
              {notice ? <p className={alertSuccess}>{notice}</p> : null}
              {debugPayload ? (
                <div className="max-h-[min(50vh,20rem)] min-h-0 overflow-auto rounded-xl border border-border bg-foreground px-3 py-2">
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-background/90">
                    {debugPayload}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" onClick={closeDialog} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isSubmitting || isCheckingMappings || shouldBlockForMapping}
                className={btnPrimary}
              >
                <Upload className="size-4" aria-hidden />
                {isSubmitting ? "Uploading…" : mappingReady ? "Upload" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
