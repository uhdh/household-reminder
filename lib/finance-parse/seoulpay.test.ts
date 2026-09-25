import ExcelJS from "exceljs";
import officeCrypto from "officecrypto-tool";
import { describe, expect, test } from "vitest";
import { detectUploadFileKind, isSeoulPayWorkbook, parseSeoulPayFile, parseSeoulPayWorkbook } from "./index";

// 실제 서울페이 이용내역 파일 형식(값은 전부 가상)을 exceljs로 재현한다: 1~3행 메타(성명/생년월일/
// 조회기간), 공백 행, 6행이 헤더, 그 아래가 데이터. 헤더 행 번호를 하드코딩하지 않고 라벨로 찾는지
// 검증하기 위해 일부러 실제 파일처럼 6행에 둔다.
function buildSeoulPayWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  const purchaseSheet = wb.addWorksheet("구매내역");
  purchaseSheet.getCell("A1").value = "성명";
  purchaseSheet.getCell("B1").value = "홍길동";
  purchaseSheet.getCell("A2").value = "생년월일";
  purchaseSheet.getCell("B2").value = "19900101";
  purchaseSheet.getCell("A3").value = "조회기간";
  purchaseSheet.getCell("B3").value = "20250925~20260925";
  purchaseSheet.getRow(6).values = [
    "상품권명", "구매(환불)일", "구매(환불)방법", "거래구분", "거래번호", "고객구매금(A)", "지원금(B)", "총금액(A+B)",
  ];
  purchaseSheet.getRow(7).values = ["서울페이상품권", "2026-09-05 10:00", "카드", "구매", "TX-1", 100000, 10000, 110000];
  purchaseSheet.getRow(8).values = ["서울페이상품권", "2026-09-10 11:30", "카드", "환불", "TX-2", 50000, 5000, 55000];

  const paymentSheet = wb.addWorksheet("결제내역");
  paymentSheet.getCell("A1").value = "성명";
  paymentSheet.getCell("B1").value = "홍길동";
  paymentSheet.getCell("A2").value = "생년월일";
  paymentSheet.getCell("B2").value = "19900101";
  paymentSheet.getCell("A3").value = "조회기간";
  paymentSheet.getCell("B3").value = "20250925~20260925";
  paymentSheet.getRow(6).values = [
    "결제채널", "거래번호", "결제일", "가맹점", "사업자번호", "가맹점ID", "거래유형", "결제구분", "거래금액", "공급가액", "봉사료", "부가세", "과세여부",
  ];
  paymentSheet.getRow(7).values = ["앱", "TX-3", "2026-09-06 09:00:00", "동네마트  ", "111-11-11111", "M1", "결제", "결제", 15000, 15000, 0, 0, "과세"];
  paymentSheet.getRow(8).values = ["앱", "TX-4", "2026-09-07 12:00:00", "분식집", "222-22-22222", "M2", "결제", "취소", 8000, 8000, 0, 0, "과세"];

  return wb;
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

/** Buffer#buffer는 SharedArrayBuffer일 수도 있는 타입이라, 항상 순수 ArrayBuffer로 복사해 돌려준다. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out.buffer;
}

describe("isSeoulPayWorkbook", () => {
  test("결제내역 시트 + 가맹점/결제일 헤더가 있으면 서울페이로 판별한다", () => {
    expect(isSeoulPayWorkbook(buildSeoulPayWorkbook())).toBe(true);
  });

  test("결제내역 시트가 없으면 서울페이가 아니다", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("가계부 내역");
    expect(isSeoulPayWorkbook(wb)).toBe(false);
  });
});

describe("parseSeoulPayWorkbook", () => {
  test("결제내역은 결제=음수/취소=양수, 구매내역은 거래구분=구매만, 지원금(B)은 버린다", () => {
    const parsed = parseSeoulPayWorkbook(buildSeoulPayWorkbook());

    expect(parsed.periodStart).toBe("2025-09-25");
    expect(parsed.periodEnd).toBe("2026-09-25");

    expect(parsed.purchases).toHaveLength(1); // "환불" 행은 제외
    expect(parsed.purchases[0]).toEqual({
      txnDate: "2026-09-05",
      txnTime: "10:00:00",
      productName: "서울페이상품권",
      amountA: 100000,
    });

    expect(parsed.payments).toHaveLength(2);
    expect(parsed.payments[0]).toEqual({ txnDate: "2026-09-06", txnTime: "09:00:00", merchant: "동네마트", amount: -15000 });
    expect(parsed.payments[1]).toEqual({ txnDate: "2026-09-07", txnTime: "12:00:00", merchant: "분식집", amount: 8000 });
  });

  test("조회기간이 없으면 파싱된 날짜의 최소~최대로 대신한다", () => {
    const wb = buildSeoulPayWorkbook();
    wb.getWorksheet("결제내역")!.getCell("B3").value = null;
    wb.getWorksheet("구매내역")!.getCell("B3").value = null;

    const parsed = parseSeoulPayWorkbook(wb);
    expect(parsed.periodStart).toBe("2026-09-05");
    // 구매내역의 "환불" 행(2026-09-10)은 애초에 purchases에 안 들어가므로 최대값에 안 잡힌다.
    expect(parsed.periodEnd).toBe("2026-09-07");
  });
});

describe("parseSeoulPayFile + officecrypto-tool 암호화 경로", () => {
  test("암호화되지 않은 파일은 비밀번호 없이 파싱된다", async () => {
    const buffer = await toBuffer(buildSeoulPayWorkbook());
    const parsed = await parseSeoulPayFile(buffer);
    expect(parsed.payments).toHaveLength(2);
  });

  test("비밀번호로 암호화한 파일을 같은 라이브러리로 복호화해 정상 파싱한다", async () => {
    const plain = Buffer.from(await toBuffer(buildSeoulPayWorkbook()));
    const encrypted = officeCrypto.encrypt(plain, { password: "990101" });
    expect(officeCrypto.isEncrypted(encrypted)).toBe(true);

    const parsed = await parseSeoulPayFile(toArrayBuffer(encrypted), "990101");
    expect(parsed.payments).toHaveLength(2);
    expect(parsed.purchases).toHaveLength(1);
  });

  test("암호화된 파일에 비밀번호를 안 주면 친절한 에러", async () => {
    const plain = Buffer.from(await toBuffer(buildSeoulPayWorkbook()));
    const encrypted = officeCrypto.encrypt(plain, { password: "990101" });
    await expect(parseSeoulPayFile(toArrayBuffer(encrypted))).rejects.toThrow(
      "비밀번호가 걸린 파일이에요. 파일 비밀번호를 입력해 주세요."
    );
  });

  test("비밀번호가 틀리면 친절한 에러", async () => {
    const plain = Buffer.from(await toBuffer(buildSeoulPayWorkbook()));
    const encrypted = officeCrypto.encrypt(plain, { password: "990101" });
    await expect(
      parseSeoulPayFile(toArrayBuffer(encrypted), "000000")
    ).rejects.toThrow("파일 비밀번호가 맞지 않아요.");
  });
});

describe("detectUploadFileKind", () => {
  test("서울페이 워크북은 seoulpay로 판별하고 복호화된 버퍼를 돌려준다", async () => {
    const buffer = await toBuffer(buildSeoulPayWorkbook());
    const result = await detectUploadFileKind(buffer);
    expect(result.kind).toBe("seoulpay");
  });

  test("뱅크샐러드류(가계부 내역 시트)는 banksalad로 판별한다", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("뱅샐현황");
    wb.addWorksheet("가계부 내역");
    const buffer = await toBuffer(wb);
    const result = await detectUploadFileKind(buffer);
    expect(result.kind).toBe("banksalad");
  });

  test("엑셀로 열 수 없는 파일은 판별을 포기하고 banksalad로 넘긴다(호출부가 자체 에러를 낸다)", async () => {
    const garbage = new TextEncoder().encode("not an excel file").buffer;
    const result = await detectUploadFileKind(garbage);
    expect(result.kind).toBe("banksalad");
  });

  test("암호화된 파일에 비밀번호가 없으면 판별 단계에서 에러를 던진다", async () => {
    const plain = Buffer.from(await toBuffer(buildSeoulPayWorkbook()));
    const encrypted = officeCrypto.encrypt(plain, { password: "990101" });
    await expect(detectUploadFileKind(toArrayBuffer(encrypted))).rejects.toThrow(
      "비밀번호가 걸린 파일이에요. 파일 비밀번호를 입력해 주세요."
    );
  });
});
