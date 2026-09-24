import "server-only";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  allocationTargets,
  assetItems,
  budgetCategories,
  categoryKeywordRules,
  categoryMappings,
  categoryRules,
  households,
  householdInvites,
  householdMembers,
  people,
  transactions,
  uploads,
} from "@/lib/finance-db";

// 가구 하나의 모든 가계부·자산 데이터 + 소속(membership) + 가구 자체를 삭제한다.
// "가구 나가기(유일한 구성원)"와 "가구 삭제(owner)" 양쪽에서 공용으로 쓴다.
//
// ponytail: neon-http 드라이버는 진짜 트랜잭션(BEGIN/COMMIT)을 지원하지 않는다. 그래서 FK
// 참조 순서대로 순차 삭제한다(uploads가 transactions/asset_items의 부모, people이 uploads의
// 부모인 식). 각 단계는 WHERE household_id = householdId 조건만 걸기 때문에, 중간에 실패해도
// 재실행하면 이미 지워진 테이블은 0행 삭제로 넘어가고 나머지가 이어서 지워진다(멱등) -
// 완전한 원자성이 필요해지면 neon-serverless(Pool) 드라이버로 교체해야 한다.
export async function deleteHouseholdData(db: AppDb, householdId: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.householdId, householdId));
  await db.delete(assetItems).where(eq(assetItems.householdId, householdId));
  await db.delete(uploads).where(eq(uploads.householdId, householdId));
  await db.delete(allocationTargets).where(eq(allocationTargets.householdId, householdId));
  await db.delete(categoryMappings).where(eq(categoryMappings.householdId, householdId));
  await db.delete(categoryRules).where(eq(categoryRules.householdId, householdId));
  await db.delete(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId));
  await db.delete(budgetCategories).where(eq(budgetCategories.householdId, householdId));
  await db.delete(people).where(eq(people.householdId, householdId));
  await db.delete(householdInvites).where(eq(householdInvites.householdId, householdId));
  await db.delete(householdMembers).where(eq(householdMembers.householdId, householdId));
  await db.delete(households).where(eq(households.id, householdId));
}
