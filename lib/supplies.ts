import { addDays, differenceInCalendarDays, parseISO, format } from "date-fns";

export type SupplyCategory = "bathroom" | "kitchen" | "bedroom" | "appliance";

export type SupplyStatus = {
  dueDate: string;
  daysRemaining: number;
  overdue: boolean;
  percent: number;
};

export const SUPPLY_CATEGORIES: { id: SupplyCategory; label: string; color: string }[] = [
  { id: "bathroom", label: "욕실용품", color: "#4a90d9" },
  { id: "kitchen", label: "주방용품", color: "#4caf7d" },
  { id: "bedroom", label: "침실&리빙", color: "#e05a7e" },
  { id: "appliance", label: "가전&설비", color: "#2bb3a3" },
];

function addDaysISO(fromISO: string, days: number): string {
  return format(addDays(parseISO(fromISO), days), "yyyy-MM-dd");
}

function daysBetween(fromISO: string, toISO: string): number {
  return differenceInCalendarDays(parseISO(toISO), parseISO(fromISO));
}

export function computeSupplyStatus(
  lastDoneISO: string,
  cycleDays: number,
  todayISODate: string
): SupplyStatus {
  const dueDate = addDaysISO(lastDoneISO, cycleDays);
  const daysRemaining = daysBetween(todayISODate, dueDate);
  const elapsedDays = cycleDays - daysRemaining;
  const percent = Math.max(0, Math.min(100, Math.round((elapsedDays / cycleDays) * 100)));
  return { dueDate, daysRemaining, overdue: daysRemaining <= 0, percent };
}
