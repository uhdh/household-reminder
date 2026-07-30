import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { completeSupplyRow, completeSupplyRows } from "@/lib/supplies-db";

export async function completeSupply(id: number, doneDateISO: string): Promise<void> {
  "use server";
  await completeSupplyRow(getDb(), id, doneDateISO);
  revalidatePath("/supplies");
  revalidatePath("/");
}

export async function completeSupplies(ids: number[], doneDateISO: string): Promise<void> {
  "use server";
  await completeSupplyRows(getDb(), ids, doneDateISO);
  revalidatePath("/supplies");
  revalidatePath("/");
}
