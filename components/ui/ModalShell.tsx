"use client";

import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { modalCloseBtn, modalOverlay, modalPanel } from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

type ModalShellProps = {
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
  zIndex?: string;
  panelClassName?: string;
};

export function ModalShell({
  onClose,
  title,
  subtitle,
  icon: Icon,
  header,
  footer,
  children,
  maxWidth = "max-w-lg",
  zIndex = "z-50",
  panelClassName,
}: ModalShellProps) {
  return (
    <div
      className={cn(modalOverlay, zIndex)}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-shell-title"
        className={cn(
          modalPanel,
          maxWidth,
          "flex max-h-[min(92dvh,44rem)] flex-col overflow-hidden",
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {header ?? (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {Icon ? (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Icon className="size-5" strokeWidth={2} aria-hidden />
                </span>
              ) : null}
              <div className="min-w-0">
                <h3 id="modal-shell-title" className="text-lg font-semibold text-foreground">
                  {title}
                </h3>
                {subtitle ? (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
            </div>
            <button type="button" onClick={onClose} className={modalCloseBtn} aria-label="Close dialog">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
