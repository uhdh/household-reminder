import type { Worksheet } from "exceljs";
import { cellNumber, cellText } from "./excel-utils";
import { normalizeInvestmentProductName } from "./investment-utils";
import type { ParsedAssetItem, ParsedInvestmentDetail } from "./types";

/**
 * "뱅샐현황" 시트는 병합 셀 기반 리포트라 고정 행 번호 대신
 * 라벨 텍스트를 스캔해서 섹션 위치를 찾는다(월마다 상품 개수가 달라 행 번호가 밀림).
 */
export function parseCustomerName(ws: Worksheet): string | null {
  for (let r = 1; r <= 15; r++) {
    const row = ws.getRow(r);
    if (cellText(row.getCell(2)) === "이름") {
      return cellText(ws.getRow(r + 1).getCell(2));
    }
  }
  return null;
}

export function parseAssetItems(ws: Worksheet): ParsedAssetItem[] {
  let sectionTitleRow: number | null = null;
  ws.eachRow((row, rowNumber) => {
    if (sectionTitleRow !== null) return;
    const b = cellText(row.getCell(2));
    if (b && b.includes("재무현황")) sectionTitleRow = rowNumber;
  });
  if (sectionTitleRow === null) {
    throw new Error("'뱅샐현황' 시트에서 '재무현황' 섹션을 찾을 수 없습니다.");
  }

  let headerRow: number | null = null;
  for (let r = sectionTitleRow + 1; r <= sectionTitleRow + 10; r++) {
    if (cellText(ws.getRow(r).getCell(2)) === "항목") {
      headerRow = r;
      break;
    }
  }
  if (headerRow === null) {
    throw new Error("재무현황 섹션의 컬럼 헤더(항목/상품명/금액)를 찾을 수 없습니다.");
  }

  const header = ws.getRow(headerRow);
  const findColumn = (labels: string[], fallback: number) => {
    for (let c = 1; c <= ws.columnCount; c++) {
      const value = cellText(header.getCell(c));
      if (value && labels.some((label) => value.includes(label))) return c;
    }
    return fallback;
  };
  const assetCategoryColumn = findColumn(["항목"], 2);
  const assetProductColumn = findColumn(["상품명", "종목명"], 3);
  const assetAmountColumn = findColumn(["평가금액", "평가액", "금액"], 5);
  const costBasisColumn = findColumn(["투자원금", "매입금액", "매입가", "취득금액"], -1);
  const sectorColumn = findColumn(["섹터", "자산군"], -1);

  const items: ParsedAssetItem[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const assetCategory = cellText(row.getCell(assetCategoryColumn));
    if (assetCategory === "총자산") break;

    const assetProduct = cellText(row.getCell(assetProductColumn));
    const assetAmount = cellNumber(row.getCell(assetAmountColumn));
    if (assetCategory && assetProduct && assetAmount !== null) {
      items.push({
        side: "asset",
        category: assetCategory,
        productName: assetProduct,
        amount: assetAmount,
        costBasis: costBasisColumn > 0 ? cellNumber(row.getCell(costBasisColumn)) : null,
        sector: sectorColumn > 0 ? cellText(row.getCell(sectorColumn)) : null,
      });
    }

    const debtCategory = cellText(row.getCell(6));
    const debtProduct = cellText(row.getCell(7));
    const debtAmount = cellNumber(row.getCell(9));
    if (debtCategory && debtProduct && debtAmount !== null) {
      items.push({
        side: "debt",
        category: debtCategory,
        productName: debtProduct,
        amount: debtAmount,
      });
    }
  }

  const investmentDetails = parseInvestmentDetails(ws);
  const costBasisApplied = new Set<string>();
  return items.map((item) => {
    if (item.side !== "asset" || !item.productName) return item;
    const productKey = normalizeInvestmentProductName(item.productName);
    const detail = investmentDetails.get(productKey);
    if (!detail) return item;
    const costBasis = costBasisApplied.has(productKey) ? 0 : detail.costBasis;
    costBasisApplied.add(productKey);
    return {
      ...item,
      costBasis,
      sector: detail.sector,
    };
  });
}

export function parseInvestmentDetails(ws: Worksheet): Map<string, { costBasis: number; sector: string | null }> {
  let sectionRow: number | null = null;
  ws.eachRow((row, rowNumber) => {
    if (sectionRow !== null) return;
    const values = row.values as unknown[];
    if (values.some((value) => typeof value === "string" && value.includes("투자현황"))) {
      sectionRow = rowNumber;
    }
  });

  if (sectionRow === null) return new Map();

  let headerRow: number | null = null;
  for (let r = sectionRow + 1; r <= Math.min(sectionRow + 8, ws.rowCount); r++) {
    const values = ws.getRow(r).values as unknown[];
    if (values.some((value) => value === "투자상품종류") && values.some((value) => value === "투자원금")) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === null) return new Map();

  const header = ws.getRow(headerRow);
  const findColumn = (labels: string[], fallback: number) => {
    for (let c = 1; c <= ws.columnCount; c++) {
      const value = cellText(header.getCell(c));
      if (value && labels.some((label) => value === label || value.includes(label))) return c;
    }
    return fallback;
  };
  const productColumn = findColumn(["상품명"], 4);
  const costBasisColumn = findColumn(["투자원금"], 6);
  const valueColumn = findColumn(["평가금액"], 7);
  const details = new Map<string, { costBasis: number; sector: string | null }>();

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const productName = cellText(row.getCell(productColumn));
    const costBasis = cellNumber(row.getCell(costBasisColumn));
    const value = cellNumber(row.getCell(valueColumn));
    if (!productName || costBasis === null || value === null || productName === "총계") break;
    const productKey = normalizeInvestmentProductName(productName);
    const existing = details.get(productKey);
    details.set(productKey, {
      costBasis: (existing?.costBasis ?? 0) + costBasis,
      sector: existing?.sector ?? null,
    });
  }
  return details;
}

export function parseInvestmentInputDetails(
  ws: Worksheet,
  owner: string,
): Map<string, ParsedInvestmentDetail> {
  let headerRow: number | null = null;
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const values = Array.from({ length: ws.columnCount }, (_, index) => cellText(ws.getRow(r).getCell(index + 1)));
    if (
      values.includes("기준월") &&
      values.includes("소유자") &&
      values.includes("상품명") &&
      values.includes("투자원금") &&
      values.includes("섹터")
    ) {
      headerRow = r;
      break;
    }
  }
  if (headerRow === null) return new Map();

  const header = ws.getRow(headerRow);
  const findColumn = (label: string) => {
    for (let c = 1; c <= ws.columnCount; c++) {
      if (cellText(header.getCell(c)) === label) return c;
    }
    return -1;
  };
  const periodColumn = findColumn("기준월");
  const ownerColumn = findColumn("소유자");
  const productColumn = findColumn("상품명");
  const costBasisColumn = findColumn("투자원금");
  const valueColumn = findColumn("평가금액");
  const sectorColumn = findColumn("섹터");
  if ([periodColumn, ownerColumn, productColumn, costBasisColumn, valueColumn, sectorColumn].some((c) => c < 1)) {
    return new Map();
  }

  const rows: { period: string; productName: string; costBasis: number; value: number; sector: string | null }[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rowOwner = cellText(row.getCell(ownerColumn));
    const period = cellText(row.getCell(periodColumn));
    const productName = cellText(row.getCell(productColumn));
    const costBasis = cellNumber(row.getCell(costBasisColumn));
    const value = cellNumber(row.getCell(valueColumn));
    if (rowOwner !== owner || !period || !productName || costBasis === null || value === null) continue;
    rows.push({ period, productName, costBasis, value, sector: cellText(row.getCell(sectorColumn)) });
  }
  const latestPeriod = rows.reduce((latest, row) => (row.period > latest ? row.period : latest), "");
  const details = new Map<string, ParsedInvestmentDetail>();
  for (const row of rows.filter((item) => item.period === latestPeriod)) {
    const productKey = normalizeInvestmentProductName(row.productName);
    const existing = details.get(productKey);
    details.set(productKey, {
      productName: existing?.productName ?? row.productName,
      costBasis: (existing?.costBasis ?? 0) + row.costBasis,
      value: (existing?.value ?? 0) + row.value,
      sector: existing?.sector ?? row.sector,
    });
  }
  return details;
}
