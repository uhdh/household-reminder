// @vitest-environment node
import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from "@zip.js/zip.js";
import { unwrapExportZip, MAX_IMPORT_BYTES } from "./zip";
import { detectUploadFileKind } from "./index";

test("일반 xlsx와 암호화 ZIP(AES·ZipCrypto)을 처리하고 비밀번호 오류·다중 파일·용량 초과를 거부한다", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("뱅샐현황"); workbook.addWorksheet("가계부 내역");
  const xlsx = new Uint8Array(await workbook.xlsx.writeBuffer());
  expect(await unwrapExportZip(xlsx.buffer)).toEqual(xlsx.buffer);
  for (const zipCrypto of [true, false]) {
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    await writer.add("export.xlsx", new Uint8ArrayReader(xlsx), { password: " test-password ", zipCrypto });
    const zip = new Uint8Array(await writer.close()).buffer;
    await expect(unwrapExportZip(zip)).rejects.toThrow("비밀번호");
    await expect(unwrapExportZip(zip, "wrong")).rejects.toThrow("비밀번호");
    expect(await unwrapExportZip(zip, " test-password ")).toEqual(xlsx.buffer);
    expect((await detectUploadFileKind(zip, " test-password ")).kind).toBe("banksalad");
  }
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  for (const name of ["a.xlsx", "b.xlsx"]) await writer.add(name, new Uint8ArrayReader(xlsx));
  await expect(unwrapExportZip(new Uint8Array(await writer.close()).buffer)).rejects.toThrow("하나");
  await expect(unwrapExportZip(new ArrayBuffer(MAX_IMPORT_BYTES + 1))).rejects.toThrow("10MB");
});
