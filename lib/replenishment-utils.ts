/**
 * Generate a unique style upload reference.
 * Format: {ClientNameNoSpaces}_{YYYYMMDD}
 * e.g. CALEESIDESIGNSJEWELERS_20260625
 */
export function generateStyleUploadRef(
  clientName: string,
  date: Date = new Date(),
): string {
  const name = clientName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 30);

  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `${name}_${dateStr}`;
}
