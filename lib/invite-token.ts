import { randomBytes, createHash } from "node:crypto";

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7일

/** 초대 링크에 쓰는 원문 토큰(32바이트, hex). DB에는 절대 저장하지 않는다 - hashInviteToken() 결과만 저장. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/** household_invites.token_hash에 저장할 값. 원문 토큰만으로 해시를 뒤집을 수 없어 DB 유출 시에도 안전. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
