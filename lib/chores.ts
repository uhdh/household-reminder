import { addDays, addWeeks, addMonths, differenceInCalendarDays, parseISO, format } from "date-fns";

export type IntervalUnit = "day" | "week" | "month";

export type ChoreStatus = {
  dueDate: string;
  daysRemaining: number;
  overdue: boolean;
  percent: number;
};

export function todayISO(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

function addInterval(fromISO: string, value: number, unit: IntervalUnit): string {
  const date = parseISO(fromISO);
  const result =
    unit === "day" ? addDays(date, value) : unit === "week" ? addWeeks(date, value) : addMonths(date, value);
  return format(result, "yyyy-MM-dd");
}

function daysBetween(fromISO: string, toISO: string): number {
  return differenceInCalendarDays(parseISO(toISO), parseISO(fromISO));
}

export function computeChoreStatus(
  lastDoneISO: string | null,
  intervalValue: number,
  intervalUnit: IntervalUnit,
  todayISODate: string
): ChoreStatus {
  if (lastDoneISO === null) {
    return { dueDate: todayISODate, daysRemaining: 0, overdue: true, percent: 100 };
  }

  const dueDate = addInterval(lastDoneISO, intervalValue, intervalUnit);
  const daysRemaining = daysBetween(todayISODate, dueDate);
  const totalDays = daysBetween(lastDoneISO, dueDate);
  const elapsedDays = totalDays - daysRemaining;
  const percent = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));

  return { dueDate, daysRemaining, overdue: daysRemaining <= 0, percent };
}
