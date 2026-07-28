import { revalidatePath } from "next/cache";
import { getDb, completeSupplyRow } from "@/lib/db";

export async function completeSupply(id: number, doneDateISO: string): Promise<void> {
  "use server";
  completeSupplyRow(getDb(), id, doneDateISO);
  revalidatePath("/supplies");
  revalidatePath("/");
}
