export type ReplenishmentFilters = {
  styleNo?: string;
  stoneShape?: string;
  metal?: string;
  metalType?: string;
  productType?: string;
  productStyle?: string;
};

export type InStockItem = {
  StockNo: string;
  StockType: string | null;
  Location: string | null;
};

export type PullbackItem = {
  StockNo: string;
  PartyName: string | null;
  MemoNo: string;
  MemoEndDate: Date;
};
