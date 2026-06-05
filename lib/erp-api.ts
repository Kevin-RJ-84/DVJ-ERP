/**
 * ERP API client for DVJ Jewelry Corp
 * Handles authentication + data fetching from external ERP system
 */

const ERP_BASE_URL = process.env.ERP_API_BASE_URL!;
const ERP_LOGIN_TYPE = process.env.ERP_LOGIN_TYPE ?? "";
const ERP_USERNAME = process.env.ERP_USER_NAME!;
const ERP_PASSWORD = process.env.ERP_PASSWORD!;
const ERP_USER_ID = process.env.ERP_USER_ID ?? "HITESH";
const ERP_REMOTE_ADDRESS = process.env.ERP_REMOTE_ADDRESS ?? "";
const ERP_COMMAND_TYPE = process.env.ERP_COMMAND_TYPE ?? "GETDATA";

// Auth token cached in memory (re-auth if expired)
let cachedToken: string | null = null;
let tokenExpiresAt: Date | null = null;

export interface ErpStockRecord {
  PROD_CODE: string;
  LOCATION: string;
  PROD_SIZE: string | null;
  PROD_TYPE: string | null;
  PROD_STYLE_CODE: string | null;
  PROD_STYLE: string | null;
  STONE_TYPES: string | null;
  STONE_WT: number | null;
  QUANTITY: number | null;
  STONE_PCS: number | null;
  STONE_SHAPES: string | null;
  METAL_TYPE: string | null;
  METAL_WT: number | null;
  PROD_VAL: number | null;
  MEMO_REMARK: string | null;
  MEMO_DATE: string | null;
  HOLD_REMARK: string | null;
  HOLD_DATE: string | null;
  HOLD_SOLD_REMARK: string | null;
  HOLD_SOLD_DATE: string | null;
  ROWID: number;
  // Future fields (when API team adds them)
  MEMO_PARTY_CODE?: string | null;
  MEMO_PARTY_NAME?: string | null;
  MEMO_TERMS_DAYS?: number | null;
  PROD_DESC?: string | null;
  BOX_CODE?: string | null;
}

export interface ErpSaleRecord {
  INVOICE_NO: string;
  INV_DATE: string;
  PROD_CODE: string;
  LOCATION: string | null;
  PROD_SIZE: string | null;
  PROD_TYPE: string | null;
  PROD_STYLE_CODE: string | null;
  PROD_STYLE: string | null;
  STONE_TYPES: string | null;
  STONE_WT: number | null;
  STONE_PCS: number | null;
  STONE_SHAPES: string | null;
  METAL_TYPE: string | null;
  METAL_WT: number | null;
  PROD_VAL: number | null;
  ROWID: number;
  // Future fields
  PARTY_CODE?: string | null;
  PARTY_NAME?: string | null;
  CR_AMOUNT?: number | null;
}

/**
 * Authenticate with ERP and return token
 * Caches token in memory until expiry
 */
export async function getErpToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch(`${ERP_BASE_URL}/api/Authenticate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      loginType: ERP_LOGIN_TYPE,
      userName: ERP_USERNAME,
      password: ERP_PASSWORD,
      sessionId: "",
      remoteAddress: ERP_REMOTE_ADDRESS,
      remoteHost: "",
      remoteUser: "",
      urlName: "",
    }),
  });

  if (!response.ok) {
    throw new Error(`ERP auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Extract token — adjust field name based on actual API response
  const token = data.token ?? data.Token ?? data.access_token ?? data.data?.token;
  if (!token) {
    throw new Error("ERP auth response missing token field");
  }

  cachedToken = token;
  // Cache for 50 minutes (assuming 1hr expiry)
  tokenExpiresAt = new Date(Date.now() + 50 * 60 * 1000);

  return token;
}

/**
 * Fetch all stock records from ERP
 */
export async function fetchErpStock(): Promise<ErpStockRecord[]> {
  const token = await getErpToken();

  const response = await fetch(`${ERP_BASE_URL}/api/JewelryReport/getJewelryStock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      command_type: ERP_COMMAND_TYPE,
      user_id: ERP_USER_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`ERP stock fetch failed: ${response.status}`);
  }

  const data = await response.json();
  // API may return array directly or nested in a data field
  return Array.isArray(data) ? data : (data.data ?? data.records ?? []);
}

/**
 * Fetch all sales records from ERP
 */
export async function fetchErpSales(): Promise<ErpSaleRecord[]> {
  const token = await getErpToken();

  const response = await fetch(`${ERP_BASE_URL}/api/JewelryReport/getJewelrySale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      command_type: ERP_COMMAND_TYPE,
      user_id: ERP_USER_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`ERP sales fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : (data.data ?? data.records ?? []);
}

/**
 * Parse METAL_TYPE code into Metal + MetalPurity
 * Examples: 14KY → {metal: 'Yellow Gold', purity: '14K'}
 *           18KW → {metal: 'White Gold', purity: '18K'}
 *           PT   → {metal: 'Platinum', purity: 'PT'}
 */
export function parseMetalType(metalType: string | null): {
  metal: string | null;
  purity: string | null;
} {
  if (!metalType) return { metal: null, purity: null };

  const mt = metalType.trim().toUpperCase();

  const karatMatch = mt.match(/^(\d+K)/);
  const karat = karatMatch ? karatMatch[1] : null;

  let metal: string | null = null;

  if (mt.includes("Y")) metal = "Yellow Gold";
  else if (mt.includes("W")) metal = "White Gold";
  else if (mt.includes("R") || mt.includes("P")) metal = "Rose Gold";
  else if (mt.startsWith("PT")) {
    return { metal: "Platinum", purity: "PT" };
  } else if (mt.startsWith("SS")) {
    return { metal: "Silver", purity: "SS" };
  } else if (karat) metal = "Gold";

  return { metal, purity: karat };
}
