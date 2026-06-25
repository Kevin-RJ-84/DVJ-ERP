import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractRowsFromWorkbook } from "@/lib/excel";
import type {
  ReplenishmentGroupField,
  ReplenishmentV2ApiPayload,
  StyleUploadGroupMeta,
  StyleUploadSuggestion,
} from "@/lib/replenishment-v2";
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

function parseUploadQty(value: unknown): number | "invalid" {
  if (value === null || value === undefined || String(value).trim() === "") return 1;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return Math.trunc(n);
}

function normalizeMetalType(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function matchesMetalType(stockMetalType: string | null, uploadMetalType: string | null): boolean {
  if (!uploadMetalType || uploadMetalType.trim() === "") {
    console.log(
      `[STYLE UPLOAD]   matchesMetalType: stock="${stockMetalType ?? ""}" upload="${uploadMetalType ?? ""}" result=true`,
    );
    return true;
  }
  const result = normalizeMetalType(stockMetalType) === normalizeMetalType(uploadMetalType);
  console.log(
    `[STYLE UPLOAD]   matchesMetalType: stock="${stockMetalType ?? ""}" upload="${uploadMetalType ?? ""}" result=${result}`,
  );
  return result;
}

function styleUploadGroupKey(styleNo: string, metalType: string | null): string {
  return `${styleNo.trim()} · ${metalType?.trim() || "(any)"}`;
}

function matchesStyleRow(
  stockStyleNo: string | null,
  uploadStyleNo: string,
  stockMetalType: string | null,
  uploadMetalType: string | null,
): boolean {
  const styleMatch = trimOrNull(stockStyleNo)?.toUpperCase() === uploadStyleNo.trim().toUpperCase();
  return styleMatch && matchesMetalType(stockMetalType, uploadMetalType);
}

function findSuggestedInventory(
  styleNo: string,
  uploadMetalType: string | null,
  clientMemoItems: Array<{
    StockNo: string | null;
    Stock: { StockNo: string; StyleNo: string | null; MetalType: string | null } | null;
  }>,
  holdItems: StyleUploadHoldRow[],
  warehouseItems: StyleUploadWarehouseRow[],
  alreadyAllocatedStockNos: Set<string>,
): StyleUploadSuggestion | null {
  const memoSuggestion = clientMemoItems.find(
    (m) => {
      const stockNo = m.Stock?.StockNo ?? m.StockNo ?? "";
      return (
        m.Stock?.StyleNo === styleNo &&
        !matchesMetalType(m.Stock?.MetalType ?? null, uploadMetalType) &&
        stockNo &&
        !alreadyAllocatedStockNos.has(stockNo)
      );
    },
  );
  if (memoSuggestion) {
    const stockNo = memoSuggestion.Stock?.StockNo ?? memoSuggestion.StockNo ?? "";
    const metalType = memoSuggestion.Stock?.MetalType ?? "";
    if (stockNo) {
      return { stockNo, metalType, source: "memo" };
    }
  }

  const holdSuggestion = holdItems.find(
    (h) =>
      h.styleNo === styleNo &&
      !matchesMetalType(h.metalType, uploadMetalType) &&
      !alreadyAllocatedStockNos.has(h.stockNo),
  );
  if (holdSuggestion) {
    return {
      stockNo: holdSuggestion.stockNo,
      metalType: holdSuggestion.metalType ?? "",
      source: "hold",
    };
  }

  const stockSuggestion = warehouseItems.find(
    (w) =>
      w.groupValues.StyleNo === styleNo &&
      !matchesMetalType(w.groupValues.MetalType, uploadMetalType) &&
      !alreadyAllocatedStockNos.has(w.stockNo),
  );
  if (stockSuggestion) {
    return {
      stockNo: stockSuggestion.stockNo,
      metalType: stockSuggestion.groupValues.MetalType ?? "",
      source: "stock",
    };
  }

  return null;
}

type StyleUploadHoldRow = {
  stockNo: string;
  styleNo: string | null;
  metalType: string | null;
};

type StyleUploadWarehouseRow = {
  stockNo: string;
  groupValues: Record<ReplenishmentGroupField, string | null>;
};

type StyleUploadPullbackRow = {
  stockNo: string;
  groupValues: Record<ReplenishmentGroupField, string | null>;
};

function stockGroupValues(row: {
  StyleNo: string | null;
  ProductType: string | null;
  StoneShape: string | null;
  Metal: string | null;
  MetalType: string | null;
  ProductStyle: string | null;
}): Record<ReplenishmentGroupField, string | null> {
  return {
    StyleNo: trimOrNull(row.StyleNo),
    ProductType: trimOrNull(row.ProductType),
    StoneShape: trimOrNull(row.StoneShape),
    Metal: trimOrNull(row.Metal),
    MetalType: trimOrNull(row.MetalType),
    ProductStyle: trimOrNull(row.ProductStyle),
  };
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

  const clientIdRaw = trimOrNull(form.get("clientId"));
  let clientPartyName: string | null = null;
  let selectedClient: { PartyName: string } | null = null;
  if (clientIdRaw) {
    const client = await db.clients.findUnique({
      where: { ClientID: clientIdRaw },
      select: { PartyName: true },
    });
    if (!client) {
      return NextResponse.json({ message: "Selected client not found." }, { status: 400 });
    }
    selectedClient = client;
    clientPartyName = client.PartyName;
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

  console.log(`[STYLE UPLOAD] ========== NEW UPLOAD ==========`);
  console.log(`[STYLE UPLOAD] File parsed: ${parsedRows.length} rows`);
  parsedRows.forEach((row, i) => {
    const styleNo = valueFor(row, ["StyleNo", "Style No", "Style"]);
    const metalType = valueFor(row, ["MetalType", "Metal Type", "Metal"]);
    const qty = valueFor(row, ["Qty", "QTY", "Quantity"]) ?? "1";
    console.log(
      `[STYLE UPLOAD] Row ${i + 1}: StyleNo="${styleNo ?? ""}" MetalType="${metalType ?? ""}" Qty=${qty}`,
    );
  });

  console.log(
    `[STYLE UPLOAD] Client: ID="${clientIdRaw ?? ""}" PartyName="${clientPartyName ?? ""}"`,
  );

  const uploadRows = parsedRows
    .map((row, index) => ({
      index,
      styleNo: valueFor(row, ["StyleNo", "Style No", "Style"]),
      metalType: valueFor(row, ["MetalType", "Metal Type", "Metal"]),
      qty: parseUploadQty(valueFor(row, ["Qty", "QTY", "Quantity"])),
    }))
    .filter((row) => row.styleNo);

  if (uploadRows.length === 0) {
    return NextResponse.json(
      { message: "No usable rows found. Include a StyleNo column." },
      { status: 400 },
    );
  }

  const invalidQty = uploadRows.filter((row) => row.qty === "invalid");
  if (invalidQty.length > 0) {
    return NextResponse.json(
      {
        message: `Rows ${invalidQty.map((row) => row.index + 2).join(", ")} have an invalid Qty (use 0 or a positive whole number).`,
      },
      { status: 400 },
    );
  }

  const validUploadRows = uploadRows.map((row) => ({
    index: row.index,
    styleNo: row.styleNo!,
    metalType: row.metalType,
    qty: row.qty as number,
  }));

  const styleNos = [...new Set(validUploadRows.map((row) => row.styleNo))];

  console.log(`[STYLE UPLOAD] Fetching hold items for client: "${clientPartyName ?? ""}"`);
  const holdRows =
    clientPartyName
      ? await db.stock.findMany({
          where: {
            HoldCompany: {
              equals: clientPartyName,
              mode: "insensitive",
            },
            HoldDate: { not: null },
            StyleNo: { not: null },
            Sales: { none: {} },
            MemoStockLinks: {
              none: {
                Status: "active",
                Memo: {
                  is: { IsActive: true },
                },
              },
            },
          },
          select: {
            StockNo: true,
            StyleNo: true,
            MetalType: true,
            HoldCompany: true,
            HoldDate: true,
            ProductDescription: true,
            Location: true,
            BoxCode: true,
            ProductType: true,
            StoneShape: true,
            Metal: true,
            ProductStyle: true,
          },
        })
      : [];

  console.log(`[STYLE UPLOAD] Hold items found: ${holdRows.length}`);
  holdRows.forEach((h) => {
    console.log(
      `[STYLE UPLOAD]   Hold: StockNo="${h.StockNo}" StyleNo="${h.StyleNo ?? ""}" MetalType="${h.MetalType ?? ""}" HoldCompany="${h.HoldCompany ?? ""}"`,
    );
  });

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

  console.log(`[STYLE UPLOAD] Fetching memo items for client: "${clientPartyName ?? ""}"`);
  const clientMemoItems = clientIdRaw
    ? await db.memo_stock.findMany({
        where: {
          Status: "active",
          Memo: {
            is: {
              IsActive: true,
              ClientID: clientIdRaw,
            },
          },
        },
        include: {
          Stock: {
            select: {
              StockNo: true,
              StyleNo: true,
              MetalType: true,
            },
          },
          Memo: {
            select: {
              MemoID: true,
              ClientID: true,
            },
          },
        },
      })
    : [];

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
  const startOfTodayUtc = new Date(
    Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()),
  );
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

  const holdItems = holdRows.map((row) => ({
    stockNo: row.StockNo,
    styleNo: trimOrNull(row.StyleNo),
    metalType: trimOrNull(row.MetalType),
    holdCompany: trimOrNull(row.HoldCompany),
    holdDate: row.HoldDate ? row.HoldDate.toISOString() : null,
    productDescription: row.ProductDescription,
    location: row.Location,
    boxCode: row.BoxCode,
    groupValues: stockGroupValues(row),
  }));

  const inWarehouseItems = inWarehouseRows.map((row) => ({
    stockNo: row.StockNo,
    productDescription: row.ProductDescription,
    location: row.Location,
    boxCode: row.BoxCode,
    groupValues: stockGroupValues(row),
  }));

  const pullbackItems = pullbackRows
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
        groupValues: stockGroupValues(stock),
      };
    });

  const clientPartyNorm = clientPartyName?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

  console.log(`[STYLE UPLOAD] Memo items found: ${clientMemoItems.length}`);
  clientMemoItems.forEach((m) => {
    console.log(
      `[STYLE UPLOAD]   Memo: StockNo="${m.Stock?.StockNo ?? m.StockNo ?? ""}" StyleNo="${m.Stock?.StyleNo ?? ""}" MetalType="${m.Stock?.MetalType ?? ""}"`,
    );
  });

  console.log(`[STYLE UPLOAD] Warehouse items found: ${inWarehouseItems.length}`);
  inWarehouseItems.slice(0, 10).forEach((w) => {
    console.log(
      `[STYLE UPLOAD]   Stock: StockNo="${w.stockNo}" StyleNo="${w.groupValues.StyleNo ?? ""}" MetalType="${w.groupValues.MetalType ?? ""}"`,
    );
  });

  const groupedUpload = new Map<
    string,
    { styleNo: string; metalType: string | null; soldQty: number; rows: typeof validUploadRows }
  >();
  for (const row of validUploadRows) {
    const key = styleUploadGroupKey(row.styleNo, row.metalType);
    const current = groupedUpload.get(key) ?? {
      styleNo: row.styleNo,
      metalType: row.metalType,
      soldQty: 0,
      rows: [],
    };
    current.soldQty += row.qty;
    current.rows.push(row);
    groupedUpload.set(key, current);
  }

  const alreadyAllocatedStockNos = new Set<string>();
  const styleUploadGroups: StyleUploadGroupMeta[] = [];

  for (const [groupKey, group] of groupedUpload.entries()) {
    const { styleNo, metalType: uploadMetalType } = group;
    const uploadQty = group.soldQty;

    const holdMatches = holdItems.filter((item) =>
      matchesStyleRow(item.styleNo, group.styleNo, item.metalType, group.metalType),
    );

    const matchingMemo = clientMemoItems.filter(
      (ms) =>
        ms.Stock?.StyleNo === styleNo &&
        matchesMetalType(ms.Stock?.MetalType ?? null, uploadMetalType),
    );
    const clientMemoQty = matchingMemo.length;

    let remaining = group.soldQty;
    const memoAlloc = Math.min(remaining, clientMemoQty);
    remaining -= memoAlloc;
    const holdAlloc = Math.min(remaining, holdMatches.length);
    remaining -= holdAlloc;
    const holdPillStockNos = holdMatches.slice(0, holdAlloc).map((item) => item.stockNo);

    const warehouseMatches = inWarehouseItems.filter((item) =>
      matchesStyleRow(item.groupValues.StyleNo, group.styleNo, item.groupValues.MetalType, group.metalType),
    );
    const stockAlloc = Math.min(remaining, warehouseMatches.length);
    remaining -= stockAlloc;
    const selectedWarehouseStockNos = warehouseMatches.slice(0, stockAlloc).map((item) => item.stockNo);

    const externalPullback = clientPartyNorm
      ? pullbackItems.filter(
          (item) =>
            matchesStyleRow(item.groupValues.StyleNo, group.styleNo, item.groupValues.MetalType, group.metalType) &&
            (item.partyName ?? "").trim().replace(/\s+/g, " ").toLowerCase() !== clientPartyNorm,
        )
      : pullbackItems.filter((item) =>
          matchesStyleRow(item.groupValues.StyleNo, group.styleNo, item.groupValues.MetalType, group.metalType),
        );
    const pullAlloc = Math.min(remaining, externalPullback.length);
    remaining -= pullAlloc;
    const factoryAlloc = Math.max(0, remaining);

    const suggestion =
      factoryAlloc > 0
        ? findSuggestedInventory(
            styleNo,
            uploadMetalType,
            clientMemoItems,
            holdItems,
            inWarehouseItems,
            alreadyAllocatedStockNos,
          )
        : null;

    console.log(
      `[STYLE UPLOAD] ----- Group: StyleNo="${styleNo}" MetalType="${uploadMetalType ?? ""}" UploadQty=${uploadQty} -----`,
    );

    console.log(`[STYLE UPLOAD]   Matching memo items: ${matchingMemo.length}`);
    matchingMemo.forEach((m) => {
      console.log(
        `[STYLE UPLOAD]     → Memo match: StockNo="${m.Stock?.StockNo ?? m.StockNo ?? ""}" MetalType="${m.Stock?.MetalType ?? ""}"`,
      );
    });

    const matchingHold = holdItems.filter(
      (h) => h.styleNo === styleNo && matchesMetalType(h.metalType, uploadMetalType),
    );
    console.log(`[STYLE UPLOAD]   Matching hold items: ${matchingHold.length}`);
    matchingHold.forEach((h) => {
      console.log(
        `[STYLE UPLOAD]     → Hold match: StockNo="${h.stockNo}" MetalType="${h.metalType ?? ""}" HoldCompany="${h.holdCompany ?? ""}"`,
      );
    });

    const matchingWarehouse = inWarehouseItems.filter(
      (w) =>
        w.groupValues.StyleNo === styleNo &&
        matchesMetalType(w.groupValues.MetalType, uploadMetalType),
    );
    console.log(`[STYLE UPLOAD]   Matching warehouse items: ${matchingWarehouse.length}`);

    console.log(`[STYLE UPLOAD]   ALLOCATION RESULT:`);
    console.log(`[STYLE UPLOAD]     memoAlloc=${memoAlloc}`);
    console.log(`[STYLE UPLOAD]     holdAlloc=${holdAlloc}`);
    console.log(`[STYLE UPLOAD]     stockAlloc=${stockAlloc}`);
    console.log(`[STYLE UPLOAD]     pullAlloc=${pullAlloc}`);
    console.log(`[STYLE UPLOAD]     factoryAlloc=${factoryAlloc}`);
    console.log(
      `[STYLE UPLOAD]     FINAL STATUS: ${
        memoAlloc > 0
          ? "MEMO"
          : holdAlloc > 0
            ? "HOLD"
            : stockAlloc > 0
              ? "STOCK"
              : pullAlloc > 0
                ? "PULLBACK"
                : "FACTORY ORDER"
      }`,
    );

    for (const ms of matchingMemo.slice(0, memoAlloc)) {
      const stockNo = ms.Stock?.StockNo ?? ms.StockNo;
      if (stockNo) alreadyAllocatedStockNos.add(stockNo);
    }
    for (const stockNo of holdPillStockNos) {
      alreadyAllocatedStockNos.add(stockNo);
    }
    for (const stockNo of selectedWarehouseStockNos) {
      alreadyAllocatedStockNos.add(stockNo);
    }

    styleUploadGroups.push({
      groupKey,
      styleNo: group.styleNo,
      metalType: group.metalType,
      soldQty: group.soldQty,
      memoAlloc,
      holdAlloc,
      holdPillStockNos,
      suggestion,
    });
  }

  const raw: ReplenishmentV2ApiPayload["raw"] = {
    soldItems: validUploadRows.map((row) => ({
      stockNo: `STYLE-UPLOAD-${row.index + 1}`,
      invoiceNo: "STYLE-UPLOAD",
      groupValues: {
        StyleNo: row.styleNo,
        MetalType: row.metalType,
        ProductType: null,
        StoneShape: null,
        Metal: null,
        ProductStyle: null,
      },
      styleRank: null,
      uploadQty: row.qty,
    })),
    inWarehouseItems,
    pullbackItems,
    holdItems,
    styleUploadGroups,
  };

  return NextResponse.json<ReplenishmentV2ApiPayload & { uploadedCount: number }>({
    rows: [],
    raw,
    uploadedCount: validUploadRows.length,
  });
}
