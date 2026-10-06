import { isAtLeast18, parseDateOnly } from './age';

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Move to a month without rolling the 29th–31st into the following month. */
export function shiftCalendarMonths(date: Date, months: number): Date {
  const target = utcDate(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
  const lastDay = utcDate(target.getUTCFullYear(), target.getUTCMonth() + 1, 0).getUTCDate();
  return utcDate(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay));
}

export function birthdayBounds(today = new Date()) {
  const date = utcDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return { min: shiftCalendarMonths(date, -120 * 12), max: shiftCalendarMonths(date, -18 * 12) };
}

export function isBirthdayAllowed(value: string, today = new Date()): boolean {
  const parsed = parseDateOnly(value);
  const { min, max } = birthdayBounds(today);
  return parsed !== null && isAtLeast18(value, today) && parsed >= min && parsed <= max;
}

/** Monday-first weeks, including adjacent-month dates so boundary days stay clear. */
export function calendarWeeks(year: number, month: number): Date[][] {
  const first = utcDate(year, month, 1);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = utcDate(year, month + 1, 0).getUTCDate();
  const count = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: count / 7 }, (_, week) => Array.from({ length: 7 }, (_, day) => utcDate(year, month, week * 7 + day - offset + 1)));
}
