export type ParsedAssetItem = {
  side: "asset" | "debt";
  category: string;
  productName: string | null;
  amount: number;
};

export type ParsedTransaction = {
  txnDate: string; // YYYY-MM-DD
  txnTime: string | null; // HH:MM:SS
  txnType: "수입" | "지출" | "이체";
  category: string | null;
  subcategory: string | null;
  description: string | null;
  amount: number;
  paymentMethod: string | null;
};

export type ParsedUpload = {
  customerName: string | null;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  assetItems: ParsedAssetItem[];
  transactions: ParsedTransaction[];
};
