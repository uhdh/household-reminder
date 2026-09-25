import officeCrypto from "officecrypto-tool";

const NO_PASSWORD_MESSAGE = "비밀번호가 걸린 파일이에요. 파일 비밀번호를 입력해 주세요.";
const WRONG_PASSWORD_MESSAGE = "파일 비밀번호가 맞지 않아요.";

/**
 * 서울페이 이용내역 엑셀처럼 OLE/CFB 컨테이너(D0 CF 11 E0로 시작)로 암호화된 파일이면
 * 비밀번호로 복호화해 평문 xlsx 버퍼를 돌려준다. 암호화되지 않은 파일(뱅크샐러드 등 대부분)은
 * 그대로 통과시킨다. 비밀번호는 어떤 경우에도 로그/에러 메시지에 담지 않는다.
 */
export async function decryptWorkbookBuffer(buffer: ArrayBuffer, password?: string): Promise<ArrayBuffer> {
  const buf = Buffer.from(buffer);
  // isEncrypted 자체가 CFB 파서라 너무 작거나 깨진 버퍼에는 예외를 던진다 - 그런 파일은 애초에
  // 암호화된 오피스 문서가 아니므로 통과시켜서(엑셀 로드 단계의 에러 메시지가 대신 나가게) 둔다.
  let encrypted: boolean;
  try {
    encrypted = officeCrypto.isEncrypted(buf);
  } catch {
    encrypted = false;
  }
  if (!encrypted) return buffer;
  if (!password) throw new Error(NO_PASSWORD_MESSAGE);
  try {
    const decrypted = await officeCrypto.decrypt(buf, { password });
    // Buffer#buffer는 SharedArrayBuffer일 수도 있는 타입이라, 항상 순수 ArrayBuffer인 새
    // Uint8Array로 복사해 돌려준다.
    const out = new Uint8Array(decrypted.byteLength);
    out.set(decrypted);
    return out.buffer;
  } catch {
    throw new Error(WRONG_PASSWORD_MESSAGE);
  }
}
