import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractRowsFromWorkbook } from "@/lib/excel";
import type { ReplenishmentV2ApiPayload } from "@/lib/replenishment-v2";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function valueFor(row: Record<string, unknown>, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizeHeader));
  for (const [header, value] of Object.entries(row)) {
    if (wanted.has(normalizeHeader(header))) {
      return trimOrNull(value);
    }
  }
  return null;
}

function coalesceStr(a: string | null | undefined, b: string | null | undefined): string | null {
  const first = a?.trim();
  if (first) return first;
  const second = b?.trim();
  return second && second.length > 0 ? second : null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.view");
    await requirePermission(auth.userId, "replenishment.search");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Upload an Excel or CSV file." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ message: "File is too large. Upload a file under 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsedRows: Record<string, unknown>[];
  try {
    parsedRows = await extractRowsFromWorkbook(buffer, { filename: file.name });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not read uploaded file." },
      { status: 400 },
    );
  }

  const uploadRows = parsedRows
    .map((row, index) => ({
      index,
      styleNo: valueFor(row, ["StyleNo", "Style No", "Style"]),
      metalType: valueFor(row, ["MetalType", "Metal Type", "Metal"]),
    }))
    .filter((row) => row.styleNo || row.metalType);

  if (uploadRows.length === 0) {
    return NextResponse.json(
      { message: "No usable rows found. Include StyleNo and MetalType columns." },
      { status: 400 },
    );
  }

  const invalid = uploadRows.filter((row) => !row.styleNo || !row.metalType);
  if (invalid.length > 0) {
    return NextResponse.json(
      { message: `Rows ${invalid.map((row) => row.index + 2).join(", ")} are missing StyleNo or MetalType.` },
      { status: 400 },
    );
  }

  const inWarehouseRows = await db.stock.findMany({
    where: {
      HoldDate: null,
      Sales: { none: {} },
      MemoStockLinks: { none: { Memo: { is: { IsActive: true } } } },
    },
    select: {
      StockNo: true,
      ProductDescription: true,
      Location: true,
      BoxCode: true,
      StyleNo: true,
      ProductType: true,
      StoneShape: true,
      Metal: true,
      MetalType: true,
      ProductStyle: true,
    },
  });

  const pullbackRows = await db.memo_stock.findMany({
    where: {
      StockNo: { not: null },
      Stock: { isNot: null },
      Memo: {
        is: {
          IsActive: true,
          Client: { is: { IsStockPullAllowed: true } },
        },
      },
    },
    select: {
      StockNo: true,
      Stock: {
        select: {
          ProductDescription: true,
          StyleNo: true,
          ProductType: true,
          StoneShape: true,
          Metal: true,
          MetalType: true,
          ProductStyle: true,
        },
      },
      Memo: {
        select: {
          MemoNo: true,
          MemoEndDate: true,
          Client: {
            select: {
              ClientID: true,
              PartyName: true,
              CloseToExpiryDays: true,
              OverallRank: true,
            },
          },
        },
      },
    },
  });

  const todayUtc = new Date();
  const startOfTodayUtc = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()));
  const pullbackClientIds = [
    ...new Set(
      pullbackRows
        .filter((row) => row.Memo?.Client?.ClientID)
        .map((row) => row.Memo!.Client!.ClientID),
    ),
  ];
  const styleRankRows =
    pullbackClientIds.length > 0
      ? await db.customer_rankings.findMany({
          where: { ClientID: { in: pullbackClientIds } },
          select: { ClientID: true, StyleNo: true, StyleRank: true },
        })
      : [];
  const styleRankByKey = new Map<string, number>();
  for (const row of styleRankRows) {
    if (row.StyleNo && row.StyleRank != null) {
      styleRankByKey.set(`${row.ClientID}::${row.StyleNo}`, row.StyleRank);
    }
  }

  const raw: ReplenishmentV2ApiPayload["raw"] = {
    soldItems: uploadRows.map((row) => ({
      stockNo: `STYLE-UPLOAD-${row.index + 1}`,
      invoiceNo: "STYLE-UPLOAD",
      groupValues: {
        StyleNo: row.styleNo!,
        MetalType: row.metalType!,
        ProductType: null,
        StoneShape: null,
        Metal: null,
        ProductStyle: null,
      },
      styleRank: null,
    })),
    inWarehouseItems: inWarehouseRows.map((row) => ({
      stockNo: row.StockNo,
      productDescription: row.ProductDescription,
      location: row.Location,
      boxCode: row.BoxCode,
      groupValues: {
        StyleNo: trimOrNull(row.StyleNo),
        ProductType: trimOrNull(row.ProductType),
        StoneShape: trimOrNull(row.StoneShape),
        Metal: trimOrNull(row.Metal),
        MetalType: trimOrNull(row.MetalType),
        ProductStyle: trimOrNull(row.ProductStyle),
      },
    })),
    pullbackItems: pullbackRows
      .filter((row) => row.StockNo && row.Stock && row.Memo?.Client)
      .filter((row) => {
        const memoEnd = row.Memo!.MemoEndDate;
        const closeDays = row.Memo!.Client!.CloseToExpiryDays;
        const diffMs = memoEnd.getTime() - startOfTodayUtc.getTime();
        const daysUntilMemoEnd = Math.floor(diffMs / 86400000);
        return daysUntilMemoEnd <= closeDays;
      })
      .map((row) => {
        const stock = row.Stock!;
        const client = row.Memo!.Client!;
        const styleNo = coalesceStr(stock.StyleNo, null);
        return {
          stockNo: row.StockNo as string,
          productDescription: stock.ProductDescription,
          partyName: client.PartyName,
          memoNo: row.Memo!.MemoNo,
          memoEndDate: row.Memo!.MemoEndDate.toISOString(),
          closeToExpiryDays: client.CloseToExpiryDays,
          overallRank: client.OverallRank,
          styleRank: styleNo ? (styleRankByKey.get(`${client.ClientID}::${styleNo}`) ?? null) : null,
          groupValues: {
            StyleNo: styleNo,
            ProductType: trimOrNull(stock.ProductType),
            StoneShape: trimOrNull(stock.StoneShape),
            Metal: trimOrNull(stock.Metal),
            MetalType: trimOrNull(stock.MetalType),
            ProductStyle: trimOrNull(stock.ProductStyle),
          },
        };
      }),
  };

  return NextResponse.json<ReplenishmentV2ApiPayload & { uploadedCount: number }>({
    rows: [],
    raw,
    uploadedCount: uploadRows.length,
  });
}
