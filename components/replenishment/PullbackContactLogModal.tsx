"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import {
  btnPrimary,
  btnSecondary,
  fieldInput,
  fieldLabel,
  fieldTextarea,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

export type PullbackContactLogEntry = {
  localId: string;
  channel: string;
  response: string;
  notes: string;
  salesperson: string;
  loggedAt: Date;
};

const CONTACT_CHANNELS = ["WhatsApp", "Call", "Email", "In Person"] as const;
const CONTACT_RESPONSES = ["Accepted", "Rejected", "No Answer", "Callback Requested"] as const;

function contactChannelBadgeClass(ch: string): string {
  if (ch === "WhatsApp") return "bg-emerald-100 text-emerald-800";
  if (ch === "Call") return "bg-blue-100 text-blue-800";
  if (ch === "Email") return "bg-violet-100 text-violet-800";
  if (ch === "In Person") return "bg-secondary text-foreground";
  return "bg-muted text-muted-foreground";
}

function contactResponseBadgeClass(resp: string): string {
  if (resp === "Accepted") return "bg-emerald-100 text-emerald-800";
  if (resp === "Rejected") return "bg-red-100 text-red-800";
  if (resp === "No Answer") return "bg-amber-100 text-amber-900";
  if (resp === "Callback Requested") return "bg-blue-100 text-blue-800";
  return "bg-muted text-muted-foreground";
}

function contactResponseBadgeLabel(resp: string): string {
  if (resp === "Callback Requested") return "Callback";
  return resp;
}

export type PullbackContactLogModalProps = {
  clientName: string;
  stockNo: string;
  defaultExpanded?: boolean;
  logs: PullbackContactLogEntry[];
  contactDraft: {
    channel: string;
    response: string;
    notes: string;
    salesperson: string;
  };
  setContactDraft: Dispatch<
    SetStateAction<{
      channel: string;
      response: string;
      notes: string;
      salesperson: string;
    }>
  >;
  salespersonChoices: Array<{ userId: string; label: string }>;
  onClose: () => void;
  onSave: () => void;
};

export function PullbackContactLogModal({
  clientName,
  stockNo,
  defaultExpanded = false,
  logs,
  contactDraft,
  setContactDraft,
  salespersonChoices,
  onClose,
  onSave,
}: PullbackContactLogModalProps) {
  const [formOpen, setFormOpen] = useState(defaultExpanded);

  useEffect(() => {
    setFormOpen(defaultExpanded);
  }, [clientName, stockNo, defaultExpanded]);

  function handleSave() {
    onSave();
    setFormOpen(false);
  }

  return (
    <ModalShell
      onClose={onClose}
      title={`Contact Log — ${clientName}`}
      subtitle={stockNo}
      zIndex="z-[200]"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className={cn(btnSecondary, "w-full sm:w-auto")}
        >
          {formOpen ? "Close form" : "+ Log Contact Attempt"}
        </button>

        {formOpen ? (
          <div className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
            <label className={fieldLabel}>
              Channel
              <select
                value={contactDraft.channel}
                onChange={(e) => setContactDraft((d) => ({ ...d, channel: e.target.value }))}
                className={fieldInput}
              >
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={fieldLabel}>
              Response
              <select
                value={contactDraft.response}
                onChange={(e) => setContactDraft((d) => ({ ...d, response: e.target.value }))}
                className={fieldInput}
              >
                {CONTACT_RESPONSES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className={fieldLabel}>
              Notes (optional)
              <textarea
                value={contactDraft.notes}
                onChange={(e) => setContactDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={3}
                className={fieldTextarea}
              />
            </label>
            <div>
              <p className={fieldLabel}>
                Salesperson
                <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
                  (users with pullback log permission when available)
                </span>
              </p>
              {salespersonChoices.length > 0 ? (
                <select
                  value={contactDraft.salesperson}
                  onChange={(e) => setContactDraft((d) => ({ ...d, salesperson: e.target.value }))}
                  className={fieldInput}
                >
                  <option value="">Select salesperson…</option>
                  {salespersonChoices.map((s) => (
                    <option key={s.userId} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={contactDraft.salesperson}
                  onChange={(e) => setContactDraft((d) => ({ ...d, salesperson: e.target.value }))}
                  placeholder="Salesperson name"
                  className={fieldInput}
                />
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={() => setFormOpen(false)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!contactDraft.salesperson.trim()}
                onClick={handleSave}
                className={btnPrimary}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
          {logs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No contact attempts logged yet
            </p>
          ) : (
            <ul className="space-y-3">
              {logs.map((log) => (
                <li key={log.localId} className="rounded-xl border border-border bg-card px-3 py-3">
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs">
                    <span className="font-medium tabular-nums text-foreground">{log.loggedAt.toLocaleString()}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        contactChannelBadgeClass(log.channel),
                      )}
                    >
                      {log.channel}
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        contactResponseBadgeClass(log.response),
                      )}
                    >
                      {contactResponseBadgeLabel(log.response)}
                    </span>
                    <span className="grow text-right font-medium text-muted-foreground">{log.salesperson}</span>
                  </div>
                  {log.notes.trim().length > 0 ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{log.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
