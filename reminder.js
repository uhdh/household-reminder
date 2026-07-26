const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / MS_PER_DAY);
}

export function computeStatus(lastDoneISO, cycleDays, todayISODate) {
  if (cycleDays === null) {
    return { dueDate: null, daysRemaining: null, overdue: false, percent: null };
  }
  const dueDate = addDays(lastDoneISO, cycleDays);
  const daysRemaining = daysBetween(todayISODate, dueDate);
  const elapsedDays = cycleDays - daysRemaining;
  const percent = Math.max(0, Math.min(100, Math.round((elapsedDays / cycleDays) * 100)));
  return { dueDate, daysRemaining, overdue: daysRemaining <= 0, percent };
}
