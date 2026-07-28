import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { completeSupplyRow } from "@/lib/supplies-db";

export async function completeSupply(id: number, doneDateISO: string): Promise<void> {
  "use server";
  completeSupplyRow(getDb(), id, doneDateISO);
  revalidatePath("/supplies");
  revalidatePath("/");
}
