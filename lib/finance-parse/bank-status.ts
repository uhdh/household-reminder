import type { Worksheet } from "exceljs";
import { cellNumber, cellText } from "./excel-utils";
import type { ParsedAssetItem } from "./types";

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

  return items;
}
