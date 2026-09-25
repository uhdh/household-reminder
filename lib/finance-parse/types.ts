export type ParsedAssetItem = {
  side: "asset" | "debt";
  category: string;
  productName: string | null;
  amount: number;
  costBasis?: number | null;
  sector?: string | null;
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

export type ParsedInvestmentDetail = {
  productName: string;
  costBasis: number;
  value: number;
  sector: string | null;
};

// 서울페이 이용내역 엑셀 "결제내역" 시트 한 행. amount는 결제=음수, 취소(환불)=양수로
// 이미 부호를 반영한 값(뱅크샐러드 환불 관례와 동일하게 flowLabel이 그대로 "입금"으로 판정).
export type ParsedSeoulPayPayment = {
  txnDate: string; // YYYY-MM-DD
  txnTime: string | null; // HH:MM:SS
  merchant: string; // 가맹점(trim 완료)
  amount: number;
};

// "구매내역" 시트 중 거래구분="구매"인 행만. amountA는 고객구매금(A) 원값(양수) - 지원금(B)은 버린다.
export type ParsedSeoulPayPurchase = {
  txnDate: string;
  txnTime: string | null;
  productName: string; // 상품권명
  amountA: number;
};

export type ParsedSeoulPay = {
  periodStart: string | null;
  periodEnd: string | null;
  payments: ParsedSeoulPayPayment[];
  purchases: ParsedSeoulPayPurchase[];
};
