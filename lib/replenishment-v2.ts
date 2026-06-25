export const REPLENISHMENT_GROUP_FIELDS = [
  "StyleNo",
  "ProductType",
  "StoneShape",
  "Metal",
  "MetalType",
  "ProductStyle",
] as const;

export type ReplenishmentGroupField = (typeof REPLENISHMENT_GROUP_FIELDS)[number];

export type ReplenishmentV2RawSoldItem = {
  stockNo: string;
  invoiceNo: string;
  groupValues: Record<ReplenishmentGroupField, string | null>;
  /** Client's StyleRank for this StyleNo (when available). */
  styleRank?: number | null;
  /** Style upload rows: quantity from Excel (defaults to 1 per row when omitted). */
  uploadQty?: number;
};

export type ReplenishmentV2RawWarehouseItem = {
  stockNo: string;
  productDescription: string | null;
  location: string | null;
  boxCode: string | null;
  groupValues: Record<ReplenishmentGroupField, string | null>;
};

export type ReplenishmentV2RawHoldItem = {
  stockNo: string;
  styleNo: string | null;
  metalType: string | null;
  holdCompany: string | null;
  productDescription?: string | null;
  location?: string | null;
  boxCode?: string | null;
  groupValues: Record<ReplenishmentGroupField, string | null>;
};

export type StyleUploadSuggestion = {
  stockNo: string;
  metalType: string;
  source: "memo" | "hold" | "stock" | "pullback";
};

export type StyleUploadGroupMeta = {
  groupKey: string;
  styleNo: string;
  metalType: string | null;
  soldQty: number;
  memoAlloc: number;
  holdAlloc: number;
  holdPillStockNos: string[];
  suggestion?: StyleUploadSuggestion | null;
};

export type ReplenishmentV2RawPullbackItem = {
  stockNo: string;
  productDescription: string | null;
  partyName: string | null;
  memoNo: string;
  memoEndDate: string;
  closeToExpiryDays: number;
  overallRank: number | null;
  styleRank: number | null;
  groupValues: Record<ReplenishmentGroupField, string | null>;
};

export type ReplenishmentV2RawClientMemoItem = {
  stockNo: string;
  groupValues: Record<ReplenishmentGroupField, string | null>;
};

export type ReplenishmentV2ApiPayload = {
  rows: Array<{
    groupValue: string;
    styleRank: number | null;
    soldQty: number;
    memoAlloc?: number;
    holdAlloc?: number;
    inWarehouse: number;
    pullbackAvailable: number;
    factoryOrder: number;
    invoiceNos: string[];
    inWarehouseItems: Array<{
      StockNo: string;
      ProductDescription: string | null;
      Location: string | null;
      BoxCode: string | null;
    }>;
    pullbackItems: Array<{
      StockNo: string;
      ProductDescription: string | null;
      PartyName: string | null;
      MemoNo: string;
      MemoEndDate: string;
      CloseToExpiryDays: number;
      OverallRank: number | null;
      StyleRank: number | null;
    }>;
  }>;
  raw: {
    soldItems: ReplenishmentV2RawSoldItem[];
    inWarehouseItems: ReplenishmentV2RawWarehouseItem[];
    pullbackItems: ReplenishmentV2RawPullbackItem[];
    holdItems?: ReplenishmentV2RawHoldItem[];
    clientMemoItems?: ReplenishmentV2RawClientMemoItem[];
    styleUploadGroups?: StyleUploadGroupMeta[];
    completedItems?: Array<{
      invoiceNo: string;
      groupField: ReplenishmentGroupField | string;
      groupValue: string;
      status: string;
      stockNo: string | null;
      pullbackCandidateCount: number | null;
    }>;
  };
};
