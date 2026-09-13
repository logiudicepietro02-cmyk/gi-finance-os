const DAY_MS = 86_400_000;

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Calendar-day difference (target − now), timezone-safe. */
export function daysUntil(now: Date, target: Date): number {
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / DAY_MS);
}

export function relativeDayLabel(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const days = daysUntil(now, d);
  if (days === 0) return "oggi";
  if (days === -1) return "ieri";
  if (days === 1) return "domani";
  return days < 0 ? `${-days} giorni fa` : `tra ${days} giorni`;
}

export function toIsoDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
