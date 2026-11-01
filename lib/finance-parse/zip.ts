import { ZipReader, Uint8ArrayReader } from "@zip.js/zip.js";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 40 * 1024 * 1024;

/** xlsx도 ZIP 컨테이너다. 워크북은 통과시키고 바깥쪽 내보내기 ZIP만 해제한다. */
export async function unwrapExportZip(buffer: ArrayBuffer, password?: string): Promise<ArrayBuffer> {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("파일은 10MB 이하로 보내 주세요.");
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return buffer;
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const entries = [];
    let expandedSize = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      entries.push(entry);
      expandedSize += entry.uncompressedSize;
      if (entries.length > 1000 || expandedSize > MAX_EXPANDED_BYTES) throw new Error("압축을 푼 파일이 너무 큽니다. 조회 기간을 줄여 주세요.");
    }
    if (entries.some((e) => e.filename === "[Content_Types].xml") && entries.some((e) => e.filename === "xl/workbook.xml")) return buffer;
    const files = entries.filter((e) => !e.directory && /\.xlsx$/i.test(e.filename));
    if (files.length !== 1) throw new Error("ZIP 안에 엑셀 파일이 하나 있어야 합니다.");
    const file = files[0];
    if (file.directory) throw new Error("엑셀 파일을 찾지 못했습니다.");
    if (file.encrypted && !password) throw new Error("압축 비밀번호를 입력해 주세요.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const output = new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.byteLength;
        if (size > MAX_IMPORT_BYTES) throw new Error("압축 해제 후 파일이 10MB를 초과합니다.");
        chunks.push(chunk);
      },
    });
    try {
      await file.getData(output, { password, checkSignature: true, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new Error("압축 비밀번호가 맞지 않거나 파일이 손상되었습니다.");
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result.buffer;
  } finally {
    await reader.close();
  }
}
