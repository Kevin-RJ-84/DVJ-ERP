import { NextRequest, NextResponse } from "next/server";
import { getPendingInvoiceRows } from "@/lib/replenishment-pending-invoices";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

type SortBy = "invoiceNo" | "partyName" | "pieceCount" | "daysSinceSold";
type SortDir = "asc" | "desc";

const SORT_KEYS: SortBy[] = ["invoiceNo", "partyName", "pieceCount", "daysSinceSold"];

function compareRows(
  a: Awaited<ReturnType<typeof getPendingInvoiceRows>>[number],
  b: Awaited<ReturnType<typeof getPendingInvoiceRows>>[number],
  sortBy: SortBy,
  sortDir: SortDir,
): number {
  let cmp = 0;
  switch (sortBy) {
    case "invoiceNo":
      cmp = a.invoiceNo.localeCompare(b.invoiceNo, undefined, { sensitivity: "base" });
      break;
    case "partyName":
      cmp = a.partyName.localeCompare(b.partyName, undefined, { sensitivity: "base" });
      break;
    case "pieceCount":
      cmp = a.pieceCount - b.pieceCount;
      break;
    case "daysSinceSold":
      cmp = a.daysSinceSold - b.daysSinceSold;
      break;
  }
  return sortDir === "asc" ? cmp : -cmp;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const sortByRaw = searchParams.get("sortBy") ?? "daysSinceSold";
  const sortDirRaw = searchParams.get("sortDir") ?? "desc";
  const sortBy = SORT_KEYS.includes(sortByRaw as SortBy) ? (sortByRaw as SortBy) : "daysSinceSold";
  const sortDir: SortDir = sortDirRaw === "asc" ? "asc" : "desc";

  const rows = await getPendingInvoiceRows();
  rows.sort((a, b) => compareRows(a, b, sortBy, sortDir));

  return NextResponse.json(rows);
}
