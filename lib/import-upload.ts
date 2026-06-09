export type ImportSnapshot = {
  lastImportAt: string | null;
  lastImportInserted: number | null;
  lastImportUpdated: number | null;
  mappingConfigured: boolean;
  mappedFieldCount: number;
  requiredFields: string[];
  missingRequiredFields: string[];
};

export type UploadImportStatusPayload = {
  stock: ImportSnapshot;
  sales: ImportSnapshot;
};

export function formatImportSnapshot(label: string, snapshot: ImportSnapshot) {
  if (!snapshot.lastImportAt) {
    return `${label}: no import yet`;
  }
  const at = new Date(snapshot.lastImportAt);
  const when = at.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const ins = snapshot.lastImportInserted ?? 0;
  const upd = snapshot.lastImportUpdated ?? 0;
  return `${label}: ${when} — ${ins} new, ${upd} refreshed`;
}
