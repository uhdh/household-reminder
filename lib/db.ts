import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";

// drizzle의 제네릭 스키마 타입을 요구하지 않는 범용 DB 핸들 타입(기존부터 any로 선언돼 있었음, 이번 작업 범위 밖).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDb = PgDatabase<any, any, any>;

let dbInstance: AppDb | null = null;
let testOverride: AppDb | null = null;

export function getDb(): AppDb {
  if (testOverride) return testOverride;

  if (!dbInstance) {
    // 환경변수에 앞뒤 공백이 섞이면 neon()이 연결 문자열 전체를 오류 메시지(로그)에 담아 던지므로 다듬어 쓴다.
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL is not set");
    dbInstance = drizzleNeon({ client: neon(url) });
  }

  return dbInstance;
}

export function setDbForTesting(database: AppDb | null): void {
  testOverride = database;
}
