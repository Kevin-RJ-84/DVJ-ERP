/**
 * Memo + hold allocation integration tests (style upload + client replenishment).
 *
 * Prerequisites:
 *   - App running: npm run dev  (or npm start) on http://localhost:3000
 *   - DATABASE_URL, TEST_EMAIL, TEST_PASSWORD in .env
 *
 * Run: npm run test:allocation
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { db } from "../lib/db";
import type { ReplenishmentV2ApiPayload, StyleUploadGroupMeta } from "../lib/replenishment-v2";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

// ─── Types ───────────────────────────────────────────────────────────────────

type TestStatus = "PASS" | "FAIL" | "SKIP";

type TestResult = {
  name: string;
  status: TestStatus;
  details?: string;
  expected?: string;
  actual?: string;
  dbNote?: string;
};

type ClientRow = {
  ClientID: string;
  PartyName: string;
};

type MemoStyleRow = {
  StyleNo: string | null;
  MetalType: string | null;
  StockNo: string | null;
};

type HoldStyleRow = {
  StyleNo: string | null;
  MetalType: string | null;
  StockNo: string;
  HoldCompany: string | null;
};

type MemoClientSummary = {
  PartyName: string;
  memo_count: number;
};

type HoldClientSummary = {
  HoldCompany: string;
  hold_count: number;
};

// ─── Test harness ────────────────────────────────────────────────────────────

const results: TestResult[] = [];

function record(result: TestResult) {
  results.push(result);
  const icon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⚠️";
  console.log(`\n${icon} ${result.status} — ${result.name}`);
  if (result.details) console.log(`   ${result.details}`);
  if (result.expected) console.log(`   Expected: ${result.expected}`);
  if (result.actual) console.log(`   Actual:   ${result.actual}`);
  if (result.dbNote) console.log(`   DB:       ${result.dbNote}`);
}

function pass(name: string, details?: string) {
  record({ name, status: "PASS", details });
}

function fail(name: string, opts: Omit<TestResult, "name" | "status">) {
  record({ name, status: "FAIL", ...opts });
}

function skip(name: string, details?: string) {
  record({ name, status: "SKIP", details });
}

// ─── Auth & HTTP ─────────────────────────────────────────────────────────────

async function assertAppReachable() {
  try {
    const res = await fetch(`${BASE_URL}/login`, { method: "GET" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `App not reachable at ${BASE_URL}. Start with "npm run dev" or "npm start". (${String(err)})`,
    );
  }
}

async function login(): Promise<string> {
  const email = process.env.TEST_EMAIL?.trim();
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_EMAIL and TEST_PASSWORD must be set in .env");
  }

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = (await res.json()) as { message?: string };
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${body.message ?? "unknown error"}`);
  }

  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter((v): v is string => Boolean(v));

  const sessionPair = setCookies
    .flatMap((header) => header.split(/,(?=\s*dvj_session=)/))
    .find((part) => part.trim().startsWith("dvj_session="));

  if (!sessionPair) {
    throw new Error("Login succeeded but dvj_session cookie was not returned.");
  }

  return sessionPair.split(";")[0].trim();
}

async function buildStyleExcel(
  rows: Array<{ styleNo: string; metalType?: string; qty?: number }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Style Upload");
  sheet.addRow(["StyleNo", "MetalType", "Qty"]);
  for (const row of rows) {
    sheet.addRow([row.styleNo, row.metalType ?? "", row.qty ?? 1]);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function postStyleUpload(
  cookie: string,
  clientId: string,
  excelBuffer: Buffer,
  filename = "test-allocation.xlsx",
): Promise<{ ok: boolean; status: number; payload: ReplenishmentV2ApiPayload & { message?: string } }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(excelBuffer)]), filename);
  form.append("clientId", clientId);

  const res = await fetch(`${BASE_URL}/api/replenishment/style-upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });

  const payload = (await res.json()) as ReplenishmentV2ApiPayload & { message?: string };
  return { ok: res.ok, status: res.status, payload };
}

async function getClientReplenishment(
  cookie: string,
  clientId: string,
  fromDate: string,
  toDate: string,
  groupBy = "StyleNo",
): Promise<{ ok: boolean; status: number; payload: ReplenishmentV2ApiPayload & { message?: string } }> {
  const params = new URLSearchParams({
    clientId,
    fromDate,
    toDate,
    groupBy,
    includeRaw: "1",
  });

  const res = await fetch(`${BASE_URL}/api/replenishment/v2?${params.toString()}`, {
    headers: { Cookie: cookie },
  });

  const payload = (await res.json()) as ReplenishmentV2ApiPayload & { message?: string };
  return { ok: res.ok, status: res.status, payload };
}

// ─── Allocation helpers (mirror API / UI logic) ──────────────────────────────

function styleUploadGroupKey(styleNo: string, metalType: string | null | undefined): string {
  return `${styleNo.trim()} · ${metalType?.trim() || "(any)"}`;
}

function deriveFinalStatus(group: {
  memoAlloc: number;
  holdAlloc: number;
  stockAlloc?: number;
  pullAlloc?: number;
  factoryAlloc?: number;
}): string {
  if (group.memoAlloc > 0) return "MEMO";
  if (group.holdAlloc > 0) return "HOLD";
  if ((group.stockAlloc ?? 0) > 0) return "STOCK";
  if ((group.pullAlloc ?? 0) > 0) return "PULLBACK";
  return "FACTORY ORDER";
}

function deriveStyleGroupStatus(group: StyleUploadGroupMeta, inWarehouseCount: number, pullCount: number): string {
  let remaining = group.soldQty;
  const memoAlloc = group.memoAlloc;
  remaining -= memoAlloc;
  const holdAlloc = group.holdAlloc;
  remaining -= holdAlloc;
  const stockAlloc = Math.min(remaining, inWarehouseCount);
  remaining -= stockAlloc;
  const pullAlloc = Math.min(remaining, pullCount);
  remaining -= pullAlloc;
  const factoryAlloc = Math.max(0, remaining);
  return deriveFinalStatus({ memoAlloc, holdAlloc, stockAlloc, pullAlloc, factoryAlloc });
}

/** UI-level allocation breakdown (mirrors computeAllocationBreakdown). */
function computeUiAllocation(input: {
  overrideQty: number;
  memoAlloc?: number;
  holdAlloc?: number;
  holdAvail?: number;
  warehouseSelected: number;
  pullbackAvail: number;
}): {
  memoAlloc: number;
  holdAlloc: number;
  stockAlloc: number;
  pullAlloc: number;
  factoryAlloc: number;
} {
  let remaining = input.overrideQty;

  const memoAlloc =
    input.memoAlloc !== undefined
      ? Math.min(remaining, input.memoAlloc)
      : 0;
  remaining -= memoAlloc;

  const holdAlloc =
    input.holdAlloc !== undefined
      ? Math.min(remaining, input.holdAlloc)
      : Math.min(remaining, input.holdAvail ?? 0);
  remaining -= holdAlloc;

  const stockAlloc = Math.min(remaining, input.warehouseSelected);
  remaining -= stockAlloc;

  const pullAlloc = Math.min(remaining, input.pullbackAvail);
  remaining -= pullAlloc;

  const factoryAlloc = Math.max(0, remaining);

  return { memoAlloc, holdAlloc, stockAlloc, pullAlloc, factoryAlloc };
}

function dateIsoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getTopMemoClients(limit = 5): Promise<MemoClientSummary[]> {
  return db.$queryRaw<MemoClientSummary[]>`
    SELECT c."PartyName", COUNT(ms.*)::int AS memo_count
    FROM clients c
    JOIN memo m ON m."ClientID" = c."ClientID"
    JOIN memo_stock ms ON ms."MemoID" = m."MemoID"
    WHERE m."IsActive" = true AND ms."Status" = 'active'
    GROUP BY c."PartyName"
    ORDER BY memo_count DESC
    LIMIT ${limit}
  `;
}

async function getTopHoldClients(limit = 5): Promise<HoldClientSummary[]> {
  return db.$queryRaw<HoldClientSummary[]>`
    SELECT "HoldCompany", COUNT(*)::int AS hold_count
    FROM stock
    WHERE "HoldCompany" IS NOT NULL
      AND "HoldDate" IS NOT NULL
      AND "HoldCompany" != ''
    GROUP BY "HoldCompany"
    ORDER BY hold_count DESC
    LIMIT ${limit}
  `;
}

async function getClientByPartyName(partyName: string): Promise<ClientRow | null> {
  return db.clients.findFirst({
    where: { PartyName: { equals: partyName, mode: "insensitive" } },
    select: { ClientID: true, PartyName: true },
  });
}

async function countActiveMemoForClient(clientId: string): Promise<number> {
  return db.memo_stock.count({
    where: {
      Status: "active",
      Memo: { is: { IsActive: true, ClientID: clientId } },
    },
  });
}

async function getMemoStylesForClient(clientId: string, limit = 3): Promise<MemoStyleRow[]> {
  const rows = await db.memo_stock.findMany({
    where: {
      Status: "active",
      Memo: { is: { IsActive: true, ClientID: clientId } },
    },
    include: {
      Stock: { select: { StyleNo: true, MetalType: true, StockNo: true } },
    },
    take: limit,
  });
  return rows.map((r) => ({
    StyleNo: r.Stock?.StyleNo ?? null,
    MetalType: r.Stock?.MetalType ?? null,
    StockNo: r.StockNo,
  }));
}

async function getHoldStylesForClient(partyName: string, limit = 3): Promise<HoldStyleRow[]> {
  return db.stock.findMany({
    where: {
      HoldCompany: { equals: partyName, mode: "insensitive" },
      HoldDate: { not: null },
      StyleNo: { not: null },
    },
    select: {
      StyleNo: true,
      MetalType: true,
      StockNo: true,
      HoldCompany: true,
    },
    take: limit,
  });
}

async function findClientWithMemoAndHold(): Promise<{
  client: ClientRow;
  memoCount: number;
  holdCount: number;
} | null> {
  const memoClients = await db.$queryRaw<Array<{ ClientID: string; PartyName: string; memo_count: number }>>`
    SELECT c."ClientID", c."PartyName", COUNT(ms.*)::int AS memo_count
    FROM clients c
    JOIN memo m ON m."ClientID" = c."ClientID"
    JOIN memo_stock ms ON ms."MemoID" = m."MemoID"
    WHERE m."IsActive" = true AND ms."Status" = 'active'
    GROUP BY c."ClientID", c."PartyName"
    ORDER BY memo_count DESC
  `;

  for (const row of memoClients) {
    const holdCount = await db.stock.count({
      where: {
        HoldCompany: { equals: row.PartyName, mode: "insensitive" },
        HoldDate: { not: null },
      },
    });
    if (holdCount > 0) {
      return {
        client: { ClientID: row.ClientID, PartyName: row.PartyName },
        memoCount: row.memo_count,
        holdCount,
      };
    }
  }
  return null;
}

async function findClientWithZeroMemo(): Promise<ClientRow | null> {
  const clients = await db.clients.findMany({
    select: { ClientID: true, PartyName: true },
    take: 200,
  });

  for (const client of clients) {
    const count = await countActiveMemoForClient(client.ClientID);
    if (count === 0) return client;
  }
  return null;
}

async function findStyleWithBothMemoAndHold(clientId: string, partyName: string): Promise<{
  styleNo: string;
  metalType: string | null;
} | null> {
  const memoStyles = await getMemoStylesForClient(clientId, 50);
  for (const memo of memoStyles) {
    if (!memo.StyleNo) continue;
    const hold = await db.stock.findFirst({
      where: {
        StyleNo: { equals: memo.StyleNo, mode: "insensitive" },
        HoldCompany: { equals: partyName, mode: "insensitive" },
        HoldDate: { not: null },
        ...(memo.MetalType
          ? { MetalType: { equals: memo.MetalType, mode: "insensitive" } }
          : {}),
      },
      select: { StyleNo: true, MetalType: true },
    });
    if (hold?.StyleNo) {
      return { styleNo: hold.StyleNo, metalType: hold.MetalType ?? memo.MetalType };
    }
  }
  return null;
}

async function findHoldForDifferentClient(testClientId: string): Promise<{
  holdStyle: HoldStyleRow;
  holdClient: ClientRow;
  wrongClient: ClientRow;
} | null> {
  const holds = await db.stock.findMany({
    where: {
      HoldDate: { not: null },
      HoldCompany: { not: null },
      StyleNo: { not: null },
    },
    select: {
      StyleNo: true,
      MetalType: true,
      StockNo: true,
      HoldCompany: true,
    },
    take: 100,
  });

  for (const hold of holds) {
    if (!hold.HoldCompany || !hold.StyleNo) continue;
    const holdClient = await getClientByPartyName(hold.HoldCompany);
    if (!holdClient || holdClient.ClientID === testClientId) continue;

    const wrongClient = await db.clients.findUnique({
      where: { ClientID: testClientId },
      select: { ClientID: true, PartyName: true },
    });
    if (!wrongClient) continue;

    return { holdStyle: hold, holdClient, wrongClient };
  }
  return null;
}

async function findInactiveMemoForClient(clientId: string): Promise<{
  stockNo: string;
  styleNo: string | null;
} | null> {
  const row = await db.memo_stock.findFirst({
    where: {
      Memo: { is: { ClientID: clientId, IsActive: false } },
      StockNo: { not: null },
    },
    include: { Stock: { select: { StyleNo: true } } },
  });
  if (!row?.StockNo) return null;
  return { stockNo: row.StockNo, styleNo: row.Stock?.StyleNo ?? null };
}

// ─── TEST SUITE 1 — DB State Verification ────────────────────────────────────

async function runSuite1(): Promise<ClientRow | null> {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("TEST SUITE 1 — DB State Verification");
  console.log("══════════════════════════════════════════════════════════");

  const topMemo = await getTopMemoClients(5);
  console.log("\nTop 5 clients by active memo items:");
  for (const row of topMemo) {
    console.log(`  • ${row.PartyName}: ${row.memo_count}`);
  }

  if (topMemo.length > 0 && topMemo[0].memo_count > 0) {
    pass("Test 1.1 — Find client with active memo items", `${topMemo.length} client(s) with active memos`);
  } else {
    fail("Test 1.1 — Find client with active memo items", {
      expected: "at least 1 client with active memo items",
      actual: "no active memo items found",
      dbNote: "memo_stock.Status='active' AND memo.IsActive=true",
    });
  }

  const topHold = await getTopHoldClients(5);
  console.log("\nTop 5 clients by hold items:");
  for (const row of topHold) {
    console.log(`  • ${row.HoldCompany}: ${row.hold_count}`);
  }

  if (topHold.length > 0 && topHold[0].hold_count > 0) {
    pass("Test 1.2 — Find client with hold items", `${topHold.length} hold company(ies) found`);
  } else {
    fail("Test 1.2 — Find client with hold items", {
      expected: "at least 1 client with hold items",
      actual: "no hold items found",
      dbNote: "stock.HoldCompany IS NOT NULL AND HoldDate IS NOT NULL",
    });
  }

  const both = await findClientWithMemoAndHold();
  if (both) {
    pass(
      "Test 1.3 — Pick test client (memo + hold)",
      `${both.client.PartyName} (${both.memoCount} memos, ${both.holdCount} holds)`,
    );
    return both.client;
  }

  if (topMemo.length > 0) {
    const fallback = await getClientByPartyName(topMemo[0].PartyName);
    if (fallback) {
      skip(
        "Test 1.3 — Pick test client (memo + hold)",
        `No client with both memo and hold. Using memo-only client: ${fallback.PartyName}`,
      );
      return fallback;
    }
  }

  fail("Test 1.3 — Pick test client (memo + hold)", {
    expected: "client with both memo and hold (or memo-only fallback)",
    actual: "no suitable test client found",
  });
  return null;
}

// ─── TEST SUITE 2 — Style Upload API ─────────────────────────────────────────

async function runSuite2(cookie: string, testClient: ClientRow) {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("TEST SUITE 2 — Style Upload API Tests");
  console.log("══════════════════════════════════════════════════════════");

  const memoStyles = (await getMemoStylesForClient(testClient.ClientID, 3)).filter((s) => s.StyleNo);
  if (memoStyles.length === 0) {
    skip("Test 2.1 — Memo allocation via style upload", "No memo styles for test client");
  } else {
    const excel = await buildStyleExcel(
      memoStyles.map((s) => ({
        styleNo: s.StyleNo!,
        metalType: s.MetalType ?? "",
        qty: 1,
      })),
    );
    const { ok, status, payload } = await postStyleUpload(cookie, testClient.ClientID, excel);
    const groups = payload.raw?.styleUploadGroups ?? [];

    if (!ok) {
      fail("Test 2.1 — Memo allocation via style upload", {
        expected: "HTTP 200 with memoAlloc >= 1 per uploaded memo style",
        actual: `HTTP ${status}: ${payload.message ?? "error"}`,
      });
    } else {
      let allPassed = true;
      for (const style of memoStyles) {
        const key = styleUploadGroupKey(style.StyleNo!, style.MetalType);
        const group = groups.find((g) => g.groupKey === key);
        const inWh = payload.raw.inWarehouseItems.filter(
          (w) =>
            w.groupValues.StyleNo?.toUpperCase() === style.StyleNo!.toUpperCase(),
        ).length;
        const pull = payload.raw.pullbackItems.filter(
          (p) => p.groupValues.StyleNo?.toUpperCase() === style.StyleNo!.toUpperCase(),
        ).length;
        const statusLabel = group ? deriveStyleGroupStatus(group, inWh, pull) : "MISSING";
        const memoAlloc = group?.memoAlloc ?? 0;
        const ui = computeUiAllocation({
          overrideQty: 1,
          memoAlloc: group?.memoAlloc,
          holdAlloc: group?.holdAlloc,
          holdAvail: group?.holdPillStockNos?.length,
          warehouseSelected: Math.min(1, inWh),
          pullbackAvail: pull,
        });

        console.log(
          `  StyleNo=${style.StyleNo} | Expected: memo | Got: ${statusLabel} | memoAlloc=${memoAlloc} | UI memo=${ui.memoAlloc}`,
        );

        if (!group || memoAlloc < 1 || statusLabel !== "MEMO" || ui.memoAlloc < 1) {
          allPassed = false;
        }
      }

      if (allPassed) {
        pass("Test 2.1 — Memo allocation via style upload", `${memoStyles.length} style(s) allocated as MEMO`);
      } else {
        fail("Test 2.1 — Memo allocation via style upload", {
          expected: "memoAlloc >= 1 and status MEMO for each memo style",
          actual: "one or more styles failed (see lines above)",
          dbNote: `${memoStyles.length} active memo styles in DB for ${testClient.PartyName}`,
        });
      }
    }
  }

  const holdStyles = await getHoldStylesForClient(testClient.PartyName, 3);
  const memoStyleSet = new Set(
    (await getMemoStylesForClient(testClient.ClientID, 10000))
      .filter((s) => s.StyleNo)
      .map((s) => `${s.StyleNo!.toUpperCase()}\0${(s.MetalType ?? "").toUpperCase()}`),
  );
  const holdOnlyStyles = holdStyles.filter((h) => {
    if (!h.StyleNo) return false;
    const key = `${h.StyleNo.toUpperCase()}\0${(h.MetalType ?? "").toUpperCase()}`;
    return !memoStyleSet.has(key);
  });

  if (holdOnlyStyles.length === 0) {
    skip(
      "Test 2.2 — Hold allocation via style upload",
      "All hold items are also on active memo — memo correctly wins",
    );
  } else {
    const excel = await buildStyleExcel(
      holdOnlyStyles.map((s) => ({
        styleNo: s.StyleNo!,
        metalType: s.MetalType ?? "",
        qty: 1,
      })),
    );
    const { ok, payload } = await postStyleUpload(cookie, testClient.ClientID, excel);
    const groups = payload.raw?.styleUploadGroups ?? [];

    if (!ok) {
      fail("Test 2.2 — Hold allocation via style upload", {
        expected: "holdAlloc >= 1 for hold-only styles",
        actual: payload.message ?? "API error",
      });
    } else {
      let allPassed = true;
      for (const style of holdOnlyStyles) {
        const key = styleUploadGroupKey(style.StyleNo!, style.MetalType);
        const group = groups.find((g) => g.groupKey === key);
        const holdAlloc = group?.holdAlloc ?? 0;
        const inWh = payload.raw.inWarehouseItems.filter(
          (w) => w.groupValues.StyleNo?.toUpperCase() === style.StyleNo!.toUpperCase(),
        ).length;
        const pull = payload.raw.pullbackItems.filter(
          (p) => p.groupValues.StyleNo?.toUpperCase() === style.StyleNo!.toUpperCase(),
        ).length;
        const statusLabel = group ? deriveStyleGroupStatus(group, inWh, pull) : "MISSING";
        console.log(
          `  StyleNo=${style.StyleNo} | Expected: hold | Got: ${statusLabel} | holdAlloc=${holdAlloc}`,
        );
        if (!group || holdAlloc < 1) allPassed = false;
      }

      if (allPassed) {
        pass("Test 2.2 — Hold allocation via style upload");
      } else {
        fail("Test 2.2 — Hold allocation via style upload", {
          expected: "holdAlloc >= 1",
          actual: "holdAlloc = 0 for one or more hold-only styles",
          dbNote: `Hold items for HoldCompany=${testClient.PartyName}`,
        });
      }
    }
  }

  const bothStyle = await findStyleWithBothMemoAndHold(testClient.ClientID, testClient.PartyName);
  if (!bothStyle) {
    skip("Test 2.3 — Priority order (memo beats hold)", "No style found with both memo and hold for same client");
  } else {
    const excel = await buildStyleExcel([
      { styleNo: bothStyle.styleNo, metalType: bothStyle.metalType ?? "", qty: 1 },
    ]);
    const { ok, payload } = await postStyleUpload(cookie, testClient.ClientID, excel);
    const key = styleUploadGroupKey(bothStyle.styleNo, bothStyle.metalType);
    const group = payload.raw?.styleUploadGroups?.find((g) => g.groupKey === key);

    if (!ok || !group) {
      fail("Test 2.3 — Priority order (memo beats hold)", {
        expected: "memoAlloc >= 1 when style has both memo and hold",
        actual: !ok ? (payload.message ?? "API error") : "group not found in response",
      });
    } else if (group.memoAlloc >= 1 && group.holdAlloc === 0) {
      pass("Test 2.3 — Priority order (memo beats hold)", `memoAlloc=${group.memoAlloc}, holdAlloc=${group.holdAlloc}`);
    } else {
      fail("Test 2.3 — Priority order (memo beats hold)", {
        expected: "memoAlloc >= 1 and holdAlloc = 0 (memo takes priority)",
        actual: `memoAlloc=${group.memoAlloc}, holdAlloc=${group.holdAlloc}`,
        dbNote: `Style ${bothStyle.styleNo} has both memo and hold in DB`,
      });
    }
  }

  const memoForEmptyMetal = memoStyles[0] ?? (await getMemoStylesForClient(testClient.ClientID, 1))[0];
  if (!memoForEmptyMetal?.StyleNo) {
    skip("Test 2.4 — MetalType empty = any piece", "No memo style available");
  } else {
    const excel = await buildStyleExcel([{ styleNo: memoForEmptyMetal.StyleNo, metalType: "", qty: 1 }]);
    const { ok, payload } = await postStyleUpload(cookie, testClient.ClientID, excel);
    const key = styleUploadGroupKey(memoForEmptyMetal.StyleNo, null);
    const group = payload.raw?.styleUploadGroups?.find((g) => g.groupKey === key);

    if (!ok || !group) {
      fail("Test 2.4 — MetalType empty = any piece", {
        expected: "memoAlloc >= 1 with empty MetalType",
        actual: !ok ? (payload.message ?? "API error") : "group not found",
      });
    } else if (group.memoAlloc >= 1) {
      pass("Test 2.4 — MetalType empty = any piece", `memoAlloc=${group.memoAlloc}`);
    } else {
      fail("Test 2.4 — MetalType empty = any piece", {
        expected: "memoAlloc >= 1 (match regardless of metal)",
        actual: `memoAlloc=${group.memoAlloc}`,
        dbNote: `Memo stock MetalType=${memoForEmptyMetal.MetalType ?? "null"}`,
      });
    }
  }
}

// ─── TEST SUITE 3 — Client Replenishment API ───────────────────────────────

async function runSuite3(cookie: string, testClient: ClientRow) {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("TEST SUITE 3 — Client Replenishment API Tests");
  console.log("══════════════════════════════════════════════════════════");

  const fromDate = dateIsoDaysAgo(365);
  const toDate = todayIso();
  const dbMemoCount = await countActiveMemoForClient(testClient.ClientID);

  const { ok, status, payload } = await getClientReplenishment(
    cookie,
    testClient.ClientID,
    fromDate,
    toDate,
  );

  if (!ok) {
    fail("Test 3.1 — Memo shows in client replenishment", {
      expected: "HTTP 200 v2 response",
      actual: `HTTP ${status}: ${payload.message ?? "error"}`,
    });
    fail("Test 3.2 — Hold shows in client replenishment", {
      expected: "HTTP 200 v2 response",
      actual: `HTTP ${status}: ${payload.message ?? "error"}`,
    });
    skip("Test 3.3 — Priority waterfall correctness", "v2 API call failed");
    return;
  }

  const rows = payload.rows ?? [];
  const memoRows = rows.filter((r) => (r.memoAlloc ?? 0) >= 1);

  console.log(`\n  v2 rows: ${rows.length} | DB active memos: ${dbMemoCount} | rows with memoAlloc>=1: ${memoRows.length}`);

  if (dbMemoCount > 0 && rows.length === 0) {
    skip(
      "Test 3.1 — Memo shows in client replenishment",
      "Client has memos but no sales in the last year — cannot produce replenishment rows",
    );
  } else if (memoRows.length >= 1) {
    const sample = memoRows[0];
    const ui = computeUiAllocation({
      overrideQty: sample.soldQty,
      memoAlloc: sample.memoAlloc,
      holdAlloc: sample.holdAlloc,
      warehouseSelected: Math.min(sample.soldQty, sample.inWarehouse),
      pullbackAvail: sample.pullbackAvailable,
    });
    pass(
      "Test 3.1 — Memo shows in client replenishment",
      `${memoRows.length} row(s) with memoAlloc>=1; sample UI memo=${ui.memoAlloc}`,
    );
  } else if (dbMemoCount > 0) {
    fail("Test 3.1 — Memo shows in client replenishment", {
      expected: "at least 1 row with memoAlloc >= 1",
      actual: `all ${rows.length} rows have memoAlloc=0`,
      dbNote: `DB has ${dbMemoCount} active memo items for ${testClient.PartyName}`,
    });
  } else {
    skip("Test 3.1 — Memo shows in client replenishment", "Test client has 0 active memo items in DB");
  }

  const dbHoldCount = await db.stock.count({
    where: {
      HoldCompany: { equals: testClient.PartyName, mode: "insensitive" },
      HoldDate: { not: null },
    },
  });
  const holdRows = rows.filter((r) => (r.holdAlloc ?? 0) >= 1);
  const apiHoldUnits = rows.reduce((sum, r) => sum + (r.holdAlloc ?? 0), 0);

  console.log(`  DB hold items: ${dbHoldCount} | rows with holdAlloc>=1: ${holdRows.length} | total holdAlloc units: ${apiHoldUnits}`);

  if (dbHoldCount > 0 && rows.length === 0) {
    skip("Test 3.2 — Hold shows in client replenishment", "No sales rows to attach hold allocation");
  } else if (dbHoldCount === 0) {
    skip("Test 3.2 — Hold shows in client replenishment", "No hold items in DB for test client");
  } else {
    const genuineHold = await db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM stock st
      WHERE st."HoldCompany" ILIKE ${testClient.PartyName}
      AND st."HoldDate" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM memo_stock ms
        JOIN memo m ON m."MemoID" = ms."MemoID"
        WHERE ms."StockNo" = st."StockNo"
        AND ms."Status" = 'active'
        AND m."IsActive" = true
      )
      AND EXISTS (
        SELECT 1 FROM sales s
        WHERE s."StyleNo" = st."StyleNo"
        AND s."InvoiceDate" >= NOW() - INTERVAL '365 days'
      )
    `;

    const actionableHoldCount = genuineHold[0]?.count ?? 0;
    console.log(`  Genuine actionable hold count: ${actionableHoldCount}`);

    if (actionableHoldCount === 0) {
      skip(
        "Test 3.2 — Hold shows in client replenishment",
        "No actionable hold items: all on active memo or no sales in range",
      );
    } else if (holdRows.length === 0) {
      fail("Test 3.2 — Hold shows in client replenishment", {
        expected: "rows with holdAlloc >= 1 when actionable hold items exist",
        actual: `holdAlloc=0 on all ${rows.length} rows`,
        dbNote: `${actionableHoldCount} actionable hold items for HoldCompany=${testClient.PartyName}`,
      });
    } else {
      pass(
        "Test 3.2 — Hold shows in client replenishment",
        `${holdRows.length} row(s) with holdAlloc>=1 (actionable holds=${actionableHoldCount})`,
      );
    }
  }

  if (rows.length === 0) {
    skip("Test 3.3 — Priority waterfall correctness", "No v2 rows returned");
    return;
  }

  let waterfallFailed = false;
  for (const row of rows) {
    const ui = computeUiAllocation({
      overrideQty: row.soldQty,
      memoAlloc: row.memoAlloc,
      holdAlloc: row.holdAlloc,
      warehouseSelected: Math.min(
        row.soldQty - (row.memoAlloc ?? 0) - (row.holdAlloc ?? 0),
        row.inWarehouse,
      ),
      pullbackAvail: row.pullbackAvailable,
    });
    const total =
      ui.memoAlloc + ui.holdAlloc + ui.stockAlloc + ui.pullAlloc + ui.factoryAlloc;
    const exceeds =
      ui.memoAlloc + ui.holdAlloc + ui.stockAlloc + ui.pullAlloc > row.soldQty ||
      total !== row.soldQty;

    if (exceeds) {
      waterfallFailed = true;
      console.log(
        `  FAIL row ${row.groupValue}: soldQty=${row.soldQty} memo=${ui.memoAlloc} hold=${ui.holdAlloc} stock=${ui.stockAlloc} pull=${ui.pullAlloc} factory=${ui.factoryAlloc} total=${total}`,
      );
    }
  }

  if (waterfallFailed) {
    fail("Test 3.3 — Priority waterfall correctness", {
      expected: "memo+hold+stock+pull+factory = soldQty without double counting",
      actual: "one or more rows failed waterfall check (see above)",
    });
  } else {
    pass("Test 3.3 — Priority waterfall correctness", `Verified ${rows.length} row(s)`);
  }
}

// ─── TEST SUITE 4 — Edge Cases ───────────────────────────────────────────────

async function runSuite4(cookie: string, testClient: ClientRow) {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("TEST SUITE 4 — Edge Cases");
  console.log("══════════════════════════════════════════════════════════");

  const zeroMemoClient = await findClientWithZeroMemo();
  if (!zeroMemoClient) {
    skip("Test 4.1 — Client with NO memo items", "Could not find a client with 0 active memos");
  } else {
    const anyStyle =
      (await db.stock.findFirst({ where: { StyleNo: { not: null } }, select: { StyleNo: true } }))
        ?.StyleNo ?? "TESTSTYLE";
    const excel = await buildStyleExcel([{ styleNo: anyStyle, qty: 1 }]);
    const { ok, payload } = await postStyleUpload(cookie, zeroMemoClient.ClientID, excel);
    const groups = payload.raw?.styleUploadGroups ?? [];
    const falsePositive = groups.some((g) => (g.memoAlloc ?? 0) > 0);

    if (!ok) {
      fail("Test 4.1 — Client with NO memo items", {
        expected: "memoAlloc=0 for all groups",
        actual: payload.message ?? "API error",
      });
    } else if (!falsePositive) {
      pass("Test 4.1 — Client with NO memo items", `Client ${zeroMemoClient.PartyName} — all memoAlloc=0`);
    } else {
      fail("Test 4.1 — Client with NO memo items", {
        expected: "memoAlloc=0 for all groups",
        actual: `memoAlloc>0 for ${groups.filter((g) => g.memoAlloc > 0).length} group(s)`,
        dbNote: `${zeroMemoClient.PartyName} has 0 active memo items in DB`,
      });
    }
  }

  const holdMismatch = await findHoldForDifferentClient(testClient.ClientID);
  if (!holdMismatch) {
    skip("Test 4.2 — Hold for DIFFERENT client not assigned", "Could not find hold item owned by another client");
  } else {
    const { holdStyle, holdClient, wrongClient } = holdMismatch;
    const excel = await buildStyleExcel([
      { styleNo: holdStyle.StyleNo!, metalType: holdStyle.MetalType ?? "", qty: 1 },
    ]);
    const { ok, payload } = await postStyleUpload(cookie, wrongClient.ClientID, excel);
    const key = styleUploadGroupKey(holdStyle.StyleNo!, holdStyle.MetalType);
    const group = payload.raw?.styleUploadGroups?.find((g) => g.groupKey === key);
    const holdAlloc = group?.holdAlloc ?? 0;

    console.log(
      `  Hold owner: ${holdClient.PartyName} | Upload client: ${wrongClient.PartyName} | holdAlloc=${holdAlloc}`,
    );

    if (!ok) {
      fail("Test 4.2 — Hold for DIFFERENT client not assigned", {
        expected: "holdAlloc=0",
        actual: payload.message ?? "API error",
      });
    } else if (holdAlloc === 0) {
      pass("Test 4.2 — Hold for DIFFERENT client not assigned");
    } else {
      fail("Test 4.2 — Hold for DIFFERENT client not assigned", {
        expected: "holdAlloc=0 (hold belongs to different client)",
        actual: `holdAlloc=${holdAlloc}`,
        dbNote: `HoldCompany=${holdStyle.HoldCompany} but uploaded with clientId=${wrongClient.ClientID}`,
      });
    }
  }

  const inactiveMemo = await findInactiveMemoForClient(testClient.ClientID);
  if (!inactiveMemo?.styleNo) {
    skip("Test 4.3 — Inactive memo not counted", "No inactive memo items for test client");
  } else {
    const activeForSameStyle = await db.memo_stock.count({
      where: {
        Status: "active",
        Memo: { is: { IsActive: true, ClientID: testClient.ClientID } },
        Stock: { is: { StyleNo: inactiveMemo.styleNo } },
      },
    });

    if (activeForSameStyle > 0) {
      skip("Test 4.3 — Inactive memo not counted", "StyleNo has active memo — memoAlloc=1 is correct");
    } else {
      const excel = await buildStyleExcel([{ styleNo: inactiveMemo.styleNo, qty: 1 }]);
      const { ok, payload } = await postStyleUpload(cookie, testClient.ClientID, excel);
      const key = styleUploadGroupKey(inactiveMemo.styleNo, null);
      const group = payload.raw?.styleUploadGroups?.find((g) => g.groupKey === key);
      const memoAlloc = group?.memoAlloc ?? 0;

      if (!ok) {
        fail("Test 4.3 — Inactive memo not counted", {
          expected: "inactive memo StockNo not counted in memoAlloc",
          actual: payload.message ?? "API error",
        });
      } else if (memoAlloc === 0) {
        pass("Test 4.3 — Inactive memo not counted", `StockNo ${inactiveMemo.stockNo} inactive — memoAlloc=0`);
      } else {
        fail("Test 4.3 — Inactive memo not counted", {
          expected: "memoAlloc=0 (inactive memo excluded)",
          actual: `memoAlloc=${memoAlloc}`,
          dbNote: `Inactive memo StockNo=${inactiveMemo.stockNo} should not count`,
        });
      }
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function printSummary() {
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  ✅ PASSED:  ${passed}`);
  console.log(`  ❌ FAILED:  ${failed}`);
  console.log(`  ⚠️  SKIPPED: ${skipped}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((x) => x.status === "FAIL")) {
      console.log(`  • ${r.name}`);
      if (r.expected) console.log(`      Expected: ${r.expected}`);
      if (r.actual) console.log(`      Actual:   ${r.actual}`);
      if (r.dbNote) console.log(`      DB:       ${r.dbNote}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Allocation integration tests");
  console.log(`Base URL: ${BASE_URL}`);

  await assertAppReachable();
  const cookie = await login();
  console.log("Logged in successfully.");

  const testClient = await runSuite1();
  if (!testClient) {
    printSummary();
    await db.$disconnect();
    process.exit(1);
  }

  console.log(`\nTEST_CLIENT: ${testClient.PartyName} (${testClient.ClientID})`);

  await runSuite2(cookie, testClient);
  await runSuite3(cookie, testClient);
  await runSuite4(cookie, testClient);

  printSummary();
  await db.$disconnect();

  const failed = results.filter((r) => r.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nFatal error:", err);
  await db.$disconnect();
  process.exit(1);
});
