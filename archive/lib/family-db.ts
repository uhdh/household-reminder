import { eq } from "drizzle-orm";
import { foreignKey, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import type { AppDb } from "./db";

export const families = pgTable("families", {
  id: serial("id").primaryKey(),
  inviteCode: text("invite_code").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull(),
  userId: text("user_id").notNull(),
  joinedAt: text("joined_at").notNull(),
}, (table) => [
  foreignKey({ columns: [table.familyId], foreignColumns: [families.id] }),
  unique("family_members_family_user_unique").on(table.familyId, table.userId),
]);

export type FamilyMembership = { familyId: number; inviteCode: string; userId: string; isOwner: boolean };

export async function getFamilyMembership(database: AppDb, userId: string): Promise<FamilyMembership | null> {
  const rows = await database.select({ familyId: families.id, inviteCode: families.inviteCode, userId: familyMembers.userId, createdBy: families.createdBy })
    .from(familyMembers)
    .innerJoin(families, eq(familyMembers.familyId, families.id))
    .where(eq(familyMembers.userId, userId))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, isOwner: row.createdBy === userId } : null;
}

function makeInviteCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

export async function createFamily(database: AppDb, userId: string): Promise<FamilyMembership> {
  const existing = await getFamilyMembership(database, userId);
  if (existing) return existing;
  const inviteCode = makeInviteCode();
  const [family] = await database.insert(families).values({ inviteCode, createdBy: userId, createdAt: new Date().toISOString() }).returning();
  await database.insert(familyMembers).values({ familyId: family.id, userId, joinedAt: new Date().toISOString() });
  return { familyId: family.id, inviteCode: family.inviteCode, userId, isOwner: true };
}

export async function joinFamily(database: AppDb, userId: string, rawInviteCode: string): Promise<FamilyMembership> {
  const existing = await getFamilyMembership(database, userId);
  if (existing) return existing;
  const inviteCode = rawInviteCode.trim().toUpperCase();
  const rows = await database.select().from(families).where(eq(families.inviteCode, inviteCode)).limit(1);
  const family = rows[0];
  if (!family) throw new Error("초대코드를 찾을 수 없습니다.");
  await database.insert(familyMembers).values({ familyId: family.id, userId, joinedAt: new Date().toISOString() });
  return { familyId: family.id, inviteCode: family.inviteCode, userId, isOwner: family.createdBy === userId };
}
