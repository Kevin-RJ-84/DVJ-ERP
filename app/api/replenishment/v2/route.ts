import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  REPLENISHMENT_GROUP_FIELDS,
  type ReplenishmentGroupField,
  type ReplenishmentV2ApiPayload,
} from "@/lib/replenishment-v2";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getConfigBool } from "@/lib/config";
import { triggerAutoSyncIfDue } from "@/lib/erp-auto-sync";

const querySchema = z.object({
  clientId: z.string().uuid(),
  fromDate: z.string().date(),
  toDate: z.string().date(),
  groupBy: z.enum(REPLENISHMENT_GROUP_FIELDS),
  includeRaw: z.boolean().optional().default(false),
  includeCompleted: z.boolean().optional().default(false),
});

const invoiceQuerySchema = z.object({
  invoiceNo: z.string().min(1),
  groupBy: z.enum(REPLENISHMENT_GROUP_FIELDS),
  includeRaw: z.boolean().optional().default(false),
});

/** GET /api/replenishment/v2 — when searching by invoice line. */
type ReplenishmentV2InvoiceSearchSummary = {
  invoiceNo: string;
  partyName: string;
  invoiceDate: string;
  lineCount: number;
};

const SALES_FOR_REPLENISHMENT_SELECT = {
  InvoiceNo: true,
  InvoiceDate: true,
  PartyName: true,
  StockNo: true,
  StyleNo: true,
  ProductType: true,
  Metal: true,
  MetalType: true,
  STShapes: true,
  Stock: {
    select: {
      StyleNo: true,
      ProductType: true,
      StoneShape: true,
      Metal: true,
      MetalType: true,
      ProductStyle: true,
    },
  },
} as const;

const GROUP_LABEL_FOR_EMPTY = "(blank)";

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t && t.length > 0 ? t : null;
}

/** Prefer invoice-line (`sales`) values, then `stock` — stock rows are often placeholders with only `StockNo`. */
function coalesceStr(
  fromSales: string | null | undefined,
  fromStock: string | null | undefined,
): string | null {
  return trimOrNull(fromSales) ?? trimOrNull(fromStock);
}

function groupValueFor(values: Record<ReplenishmentGroupField, string | null>, groupBy: ReplenishmentGroupField) {
  return values[groupBy]?.trim() || GROUP_LABEL_FOR_EMPTY;
}

function normalizeMetalTypeUpper(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function stockGroupValuesFromMemoStock(stock: {
  StyleNo: string | null;
  ProductType: string | null;
  StoneShape: string | null;
  Metal: string | null;
  MetalType: string | null;
  ProductStyle: string | null;
}): Record<ReplenishmentGroupField, string | null> {
  return {
    StyleNo: trimOrNull(stock.StyleNo),
    ProductType: trimOrNull(stock.ProductType),
    StoneShape: trimOrNull(stock.StoneShape),
    Metal: trimOrNull(stock.Metal),
    MetalType: trimOrNull(stock.MetalType),
    ProductStyle: trimOrNull(stock.ProductStyle),
  };
}

function countClientMemoForGroup(
  clientMemoItems: Array<{
    Stock: {
      StyleNo: string | null;
      ProductType: string | null;
      StoneShape: string | null;
      Metal: string | null;
      MetalType: string | null;
      ProductStyle: string | null;
    } | null;
  }>,
  groupBy: ReplenishmentGroupField,
  groupValue: string,
  soldInGroup: Array<{ groupValues: Record<ReplenishmentGroupField, string | null> }>,
): number {
  const soldMetalTypes = new Set(
    soldInGroup
      .map((item) => normalizeMetalTypeUpper(item.groupValues.MetalType))
      .filter((metalType) => metalType.length > 0),
  );
  return clientMemoItems.filter((ms) => {
    if (!ms.Stock) return false;
    const gv = stockGroupValuesFromMemoStock(ms.Stock);
    if (groupValueFor(gv, groupBy) !== groupValue) return false;
    const metalType = normalizeMetalTypeUpper(ms.Stock.MetalType);
    if (soldMetalTypes.size > 0 && (metalType.length === 0 || !soldMetalTypes.has(metalType))) {
      return false;
    }
    return true;
  }).length;
}

function mergeGroupValues(
  a: Record<ReplenishmentGroupField, string | null> | undefined,
  b: Record<ReplenishmentGroupField, string | null>,
): Record<ReplenishmentGroupField, string | null> {
  if (!a) return { ...b };
  return {
    StyleNo: coalesceStr(a.StyleNo, b.StyleNo),
    ProductType: coalesceStr(a.ProductType, b.ProductType),
    StoneShape: coalesceStr(a.StoneShape, b.StoneShape),
    Metal: coalesceStr(a.Metal, b.Metal),
    MetalType: coalesceStr(a.MetalType, b.MetalType),
    ProductStyle: coalesceStr(a.ProductStyle, b.ProductStyle),
  };
}

export async function GET(request: NextRequest) {
  const erpConfigured = Boolean(
    process.env.ERP_API_BASE_URL &&
      process.env.ERP_USER_NAME &&
      process.env.ERP_PASSWORD,
  );
  if (erpConfigured) {
    triggerAutoSyncIfDue();
  }

  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "replenishment.view");
    await requirePermission(auth.userId, "replenishment.search");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const includeRawParam = ["1", "true", "yes"].includes(
    String(searchParams.get("includeRaw") ?? "")
      .trim()
      .toLowerCase(),
  );

  const invoiceNoRaw = (searchParams.get("invoiceNo") ?? "").trim();
  let groupBy: ReplenishmentGroupField;
  let includeRaw: boolean;
  let salesItems: Array<{
    InvoiceNo: string;
    InvoiceDate: Date;
    PartyName: string | null;
    StockNo: string | null;
    StyleNo: string | null;
    ProductType: string | null;
    Metal: string | null;
    MetalType: string | null;
    STShapes: string | null;
    Stock: {
      StyleNo: string | null;
      ProductType: string | null;
      StoneShape: string | null;
      Metal: string | null;
      MetalType: string | null;
      ProductStyle: string | null;
    } | null;
  }>;
  let invoiceSearchSummary: ReplenishmentV2InvoiceSearchSummary | undefined;
  const invoiceMode = invoiceNoRaw.length > 0;
  let searchClientId: string | undefined;
  let clientPartyName: string | null = null;
  let includeCompleted = false;

  if (invoiceMode) {
    const invParsed = invoiceQuerySchema.safeParse({
      invoiceNo: invoiceNoRaw,
      groupBy: searchParams.get("groupBy"),
      includeRaw: includeRawParam,
    });
    if (!invParsed.success) {
      return NextResponse.json(
        { message: invParsed.error.issues[0]?.message ?? "Invalid query parameters." },
        { status: 400 },
      );
    }
    ({ groupBy, includeRaw } = invParsed.data);

    salesItems = await db.sales.findMany({
      where: {
        InvoiceNo: invoiceNoRaw,
        StockNo: { not: null },
        Stock: { isNot: null },
      },
      select: SALES_FOR_REPLENISHMENT_SELECT,
    });

    if (salesItems.length === 0) {
      return NextResponse.json({ message: "No sales found for this invoice." }, { status: 404 });
    }

    const first = salesItems[0];
    invoiceSearchSummary = {
      invoiceNo: invoiceNoRaw,
      partyName: trimOrNull(first.PartyName) ?? "Unknown",
      invoiceDate: first.InvoiceDate.toISOString(),
      lineCount: salesItems.filter((s) => s.StockNo && s.Stock).length,
    };
  } else {
    const parsed = querySchema.safeParse({
      clientId: searchParams.get("clientId"),
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
      groupBy: searchParams.get("groupBy"),
      includeRaw: includeRawParam,
      includeCompleted: ["1", "true", "yes"].includes(
        String(searchParams.get("includeCompleted") ?? "")
          .trim()
          .toLowerCase(),
      ),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid query parameters." },
        { status: 400 },
      );
    }

    const { clientId, fromDate, toDate } = parsed.data;
    includeCompleted = parsed.data.includeCompleted;
    searchClientId = clientId;
    ({ groupBy, includeRaw } = parsed.data);

    const client = await db.clients.findUnique({
      where: { ClientID: clientId },
      select: { PartyCode: true, PartyName: true },
    });
    if (!client) {
      return NextResponse.json({ message: "Client not found." }, { status: 404 });
    }
    clientPartyName = client.PartyName;

    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T23:59:59.999Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return NextResponse.json({ message: "Invalid date range." }, { status: 400 });
    }

    salesItems = await db.sales.findMany({
      where: {
        InvoiceDate: { gte: from, lte: to },
        OR: [
          ...(client.PartyCode ? [{ PartyCode: client.PartyCode }] : []),
          { PartyName: client.PartyName },
        ],
        StockNo: { not: null },
        Stock: { isNot: null },
      },
      select: SALES_FOR_REPLENISHMENT_SELECT,
    });
  }

  // ── Replenishment exclusion filter (client + date search only) ─────────────────
  const partialVisibility = invoiceMode ? false : await getConfigBool("partial_replenishment_visibility");
  const invoiceNosInRange = [...new Set(salesItems.map((s) => s.InvoiceNo))];
  const excludedInvoiceNos = new Set<string>();
  const replenishedCombos = new Set<string>(); // JSON([invoiceNo, groupField, groupValue])
  const completedItems: NonNullable<ReplenishmentV2ApiPayload["raw"]["completedItems"]> = [];

  if (!invoiceMode && invoiceNosInRange.length > 0) {
    const activeReps = await db.replenishments.findMany({
      where: { InvoiceNo: { in: invoiceNosInRange }, IsUndone: false },
      select: {
        InvoiceNo: true,
        GroupField: true,
        GroupValue: true,
        Items: {
          where: { IsActive: true },
          select: {
            InvoiceNo: true,
            GroupField: true,
            GroupValue: true,
            Status: true,
            StockNo: true,
            PullbackCandidateCount: true,
          },
        },
      },
    });
    for (const r of activeReps) {
      for (const item of r.Items) {
        completedItems.push({
          invoiceNo: item.InvoiceNo,
          groupField: item.GroupField,
          groupValue: item.GroupValue,
          status: item.Status,
          stockNo: item.StockNo,
          pullbackCandidateCount: item.PullbackCandidateCount,
        });
      }
      if (!includeCompleted) {
        if (partialVisibility) {
          replenishedCombos.add(JSON.stringify([r.InvoiceNo, r.GroupField, r.GroupValue]));
        } else {
          excludedInvoiceNos.add(r.InvoiceNo);
        }
      }
    }
  }

  const inWarehouseRows = await db.stock.findMany({
    where: {
      HoldDate: null,
      Sales: { none: {} },
      MemoStockLinks: {
        none: {
          Memo: {
            is: {
              IsActive: true,
            },
          },
        },
      },
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
          Client: {
            is: {
              IsStockPullAllowed: true,
            },
          },
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
              IsStockPullAllowed: true,
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

  // ── Client rankings for pullback sort ─────────────────────────────────────
  // OverallRank comes from clients table (already loaded via Memo.Client above).
  const overallRankByClientId = new Map<string, number>();
  for (const row of pullbackRows) {
    const client = row.Memo?.Client;
    if (client?.ClientID && client.OverallRank != null) {
      overallRankByClientId.set(client.ClientID, client.OverallRank);
    }
  }

  // StyleRank still comes from customer_rankings (all rows now have non-null StyleNo).
  const pullbackClientIds = [
    ...new Set(
      pullbackRows
        .filter((r) => r.Memo?.Client?.ClientID)
        .map((r) => r.Memo!.Client!.ClientID),
    ),
  ];
  const styleRankRows =
    pullbackClientIds.length > 0
      ? await db.customer_rankings.findMany({
          where: { ClientID: { in: pullbackClientIds } },
          select: { ClientID: true, StyleNo: true, StyleRank: true },
        })
      : [];
  const styleRankByKey = new Map<string, number>(); // `${clientId}::${styleNo}`
  for (const r of styleRankRows) {
    if (r.StyleNo && r.StyleRank != null) {
      styleRankByKey.set(`${r.ClientID}::${r.StyleNo}`, r.StyleRank);
    }
  }

  const soldItems = salesItems
    .filter((item) => item.Stock && item.StockNo)
    .filter((item) => {
      if (invoiceMode) {
        return true;
      }
      if (!partialVisibility) {
        return !excludedInvoiceNos.has(item.InvoiceNo);
      }
      // Partial: exclude if any of this item's group field values match a confirmed replenishment
      const st = item.Stock!;
      const candidates: [string, string | null][] = [
        ["StyleNo", coalesceStr(item.StyleNo, st.StyleNo)],
        ["ProductType", coalesceStr(item.ProductType, st.ProductType)],
        ["StoneShape", coalesceStr(st.StoneShape, item.STShapes)],
        ["Metal", coalesceStr(item.Metal, st.Metal)],
        ["MetalType", coalesceStr(item.MetalType, st.MetalType)],
        ["ProductStyle", trimOrNull(st.ProductStyle)],
      ];
      for (const [field, value] of candidates) {
        if (value && replenishedCombos.has(JSON.stringify([item.InvoiceNo, field, value]))) {
          return false;
        }
      }
      return true;
    })
    .map((item) => {
      const st = item.Stock!;
      return {
        stockNo: item.StockNo as string,
        invoiceNo: item.InvoiceNo,
        groupValues: {
          StyleNo: coalesceStr(item.StyleNo, st.StyleNo),
          ProductType: coalesceStr(item.ProductType, st.ProductType),
          StoneShape: coalesceStr(st.StoneShape, item.STShapes),
          Metal: coalesceStr(item.Metal, st.Metal),
          MetalType: coalesceStr(item.MetalType, st.MetalType),
          ProductStyle: trimOrNull(st.ProductStyle),
        },
      };
    });

  const styleNos = [
    ...new Set(
      soldItems
        .map((s) => s.groupValues.StyleNo?.trim())
        .filter((sn): sn is string => Boolean(sn)),
    ),
  ];

  const styleRankMap = new Map<string, number>();
  if (searchClientId && styleNos.length > 0) {
    const clientStyleRows = await db.client_style_rankings.findMany({
      where: {
        ClientID: searchClientId,
        StyleNo: { in: styleNos },
      },
      select: { StyleNo: true, ClientStyleRank: true },
    });
    for (const row of clientStyleRows) {
      const key = row.StyleNo.trim();
      if (row.ClientStyleRank != null) {
        styleRankMap.set(key, row.ClientStyleRank);
      }
    }
  }

  const soldItemsWithRank = soldItems.map((item) => {
    const styleNo = item.groupValues.StyleNo?.trim() ?? null;
    return {
      ...item,
      styleRank: searchClientId && styleNo ? (styleRankMap.get(styleNo) ?? null) : null,
    };
  });

  const groupHintByStockNo = new Map<string, Record<ReplenishmentGroupField, string | null>>();
  for (const sold of soldItemsWithRank) {
    const prev = groupHintByStockNo.get(sold.stockNo);
    groupHintByStockNo.set(sold.stockNo, mergeGroupValues(prev, sold.groupValues));
  }

  const clientMemoDbRows = searchClientId
    ? await db.memo_stock.findMany({
        where: {
          Status: "active",
          Memo: {
            is: {
              IsActive: true,
              ClientID: searchClientId,
            },
          },
        },
        include: {
          Stock: {
            select: {
              StockNo: true,
              StyleNo: true,
              MetalType: true,
              ProductType: true,
              StoneShape: true,
              Metal: true,
              ProductStyle: true,
            },
          },
        },
      })
    : [];

  const searchClientName = clientPartyName;
  const holdDbRows =
    searchClientId && searchClientName
      ? await db.stock.findMany({
          where: {
            HoldCompany: {
              equals: searchClientName,
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
            Metal: true,
            MetalPurity: true,
          },
        })
      : [];

  const raw: ReplenishmentV2ApiPayload["raw"] = {
    soldItems: soldItemsWithRank,
    inWarehouseItems: inWarehouseRows.map((row) => {
      const hint = groupHintByStockNo.get(row.StockNo);
      return {
        stockNo: row.StockNo,
        productDescription: row.ProductDescription,
        location: row.Location,
        boxCode: row.BoxCode,
        groupValues: {
          StyleNo: coalesceStr(hint?.StyleNo, row.StyleNo),
          ProductType: coalesceStr(hint?.ProductType, row.ProductType),
          StoneShape: coalesceStr(hint?.StoneShape, row.StoneShape),
          Metal: coalesceStr(hint?.Metal, row.Metal),
          MetalType: coalesceStr(hint?.MetalType, row.MetalType),
          ProductStyle: coalesceStr(hint?.ProductStyle, row.ProductStyle),
        },
      };
    }),
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
        const st = row.Stock!;
        const sn = row.StockNo as string;
        const hint = groupHintByStockNo.get(sn);
        const clientId = row.Memo!.Client!.ClientID;
        const resolvedStyleNo = coalesceStr(hint?.StyleNo, st.StyleNo);
        const overallRank = overallRankByClientId.get(clientId) ?? null;
        const styleRank = resolvedStyleNo
          ? (styleRankByKey.get(`${clientId}::${resolvedStyleNo}`) ?? null)
          : null;
        return {
          stockNo: sn,
          productDescription: st.ProductDescription,
          partyName: row.Memo!.Client!.PartyName,
          memoNo: row.Memo!.MemoNo,
          memoEndDate: row.Memo!.MemoEndDate.toISOString(),
          closeToExpiryDays: row.Memo!.Client!.CloseToExpiryDays,
          overallRank,
          styleRank,
          groupValues: {
            StyleNo: resolvedStyleNo,
            ProductType: coalesceStr(hint?.ProductType, st.ProductType),
            StoneShape: coalesceStr(hint?.StoneShape, st.StoneShape),
            Metal: coalesceStr(hint?.Metal, st.Metal),
            MetalType: coalesceStr(hint?.MetalType, st.MetalType),
            ProductStyle: coalesceStr(hint?.ProductStyle, st.ProductStyle),
          },
        };
      }),
    holdItems: holdDbRows.map((row) => ({
      stockNo: row.StockNo,
      styleNo: trimOrNull(row.StyleNo),
      metalType: trimOrNull(row.MetalType),
      holdCompany: trimOrNull(row.HoldCompany),
      productDescription: row.ProductDescription,
      location: null,
      boxCode: null,
      groupValues: {
        StyleNo: trimOrNull(row.StyleNo),
        ProductType: null,
        StoneShape: null,
        Metal: trimOrNull(row.Metal),
        MetalType: trimOrNull(row.MetalType),
        ProductStyle: null,
      },
    })),
    clientMemoItems: clientMemoDbRows
      .filter((row) => row.StockNo && row.Stock)
      .map((row) => ({
        stockNo: row.StockNo as string,
        groupValues: stockGroupValuesFromMemoStock(row.Stock!),
      })),
    completedItems,
  };

  const soldByGroup = new Map<string, number>();
  const invoiceNosByGroup = new Map<string, Set<string>>();
  for (const item of raw.soldItems) {
    const key = groupValueFor(item.groupValues, groupBy);
    soldByGroup.set(key, (soldByGroup.get(key) ?? 0) + 1);
    if (!invoiceNosByGroup.has(key)) invoiceNosByGroup.set(key, new Set());
    invoiceNosByGroup.get(key)!.add(item.invoiceNo);
  }

  const rows = [...soldByGroup.entries()]
    .map(([groupValue, soldQty]) => {
      const soldInGroup = raw.soldItems.filter(
        (item) => groupValueFor(item.groupValues, groupBy) === groupValue,
      );
      const groupMemoQty =
        clientMemoDbRows.length > 0
          ? countClientMemoForGroup(clientMemoDbRows, groupBy, groupValue, soldInGroup)
          : 0;
      const memoAlloc = Math.min(soldQty, groupMemoQty);
      const groupHoldItems = (raw.holdItems ?? []).filter(
        (item) => groupValueFor(item.groupValues, groupBy) === groupValue,
      );
      let remainingAfterMemo = soldQty - memoAlloc;
      const holdAlloc = Math.min(remainingAfterMemo, groupHoldItems.length);
      remainingAfterMemo -= holdAlloc;

      const inWarehouseItems = raw.inWarehouseItems
        .filter((item) => groupValueFor(item.groupValues, groupBy) === groupValue)
        .map((item) => ({
          StockNo: item.stockNo,
          ProductDescription: item.productDescription,
          Location: item.location,
          BoxCode: item.boxCode,
        }));
      const pullbackItems = raw.pullbackItems
        .filter((item) => groupValueFor(item.groupValues, groupBy) === groupValue)
        .sort((a, b) => {
          const aOverall = a.overallRank ?? -Infinity;
          const bOverall = b.overallRank ?? -Infinity;
          if (aOverall !== bOverall) return bOverall - aOverall;
          return (b.styleRank ?? -Infinity) - (a.styleRank ?? -Infinity);
        })
        .map((item) => ({
          StockNo: item.stockNo,
          ProductDescription: item.productDescription,
          PartyName: item.partyName,
          MemoNo: item.memoNo,
          MemoEndDate: item.memoEndDate,
          CloseToExpiryDays: item.closeToExpiryDays,
          OverallRank: item.overallRank,
          StyleRank: item.styleRank,
        }));
      const inWarehouse = inWarehouseItems.length;
      const pullbackAvailable = pullbackItems.length;
      const stockAlloc = Math.min(remainingAfterMemo, inWarehouse);
      remainingAfterMemo -= stockAlloc;
      const pullAlloc = Math.min(remainingAfterMemo, pullbackAvailable);
      remainingAfterMemo -= pullAlloc;
      const factoryOrder = Math.max(0, remainingAfterMemo);
      return {
        groupValue,
        styleRank:
          groupBy === "StyleNo" && groupValue !== GROUP_LABEL_FOR_EMPTY
            ? (styleRankMap.get(groupValue) ?? null)
            : null,
        soldQty,
        memoAlloc,
        holdAlloc,
        inWarehouse,
        pullbackAvailable,
        factoryOrder,
        invoiceNos: [...(invoiceNosByGroup.get(groupValue) ?? [])],
        inWarehouseItems,
        pullbackItems,
      };
    })
    .sort((a, b) => a.groupValue.localeCompare(b.groupValue));

  if (!includeRaw) {
    return NextResponse.json(rows);
  }

  if (invoiceSearchSummary) {
    return NextResponse.json({ rows, raw, invoiceSearchSummary });
  }

  return NextResponse.json<ReplenishmentV2ApiPayload>({ rows, raw });
}
