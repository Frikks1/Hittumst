import { describe, expect, it } from 'vitest';
import { birthdayBounds, calendarWeeks, dateOnly, isBirthdayAllowed, shiftCalendarMonths } from './birthdayCalendar';
import { birthdayDateLabel } from '../i18n/birthdayPicker';

describe('birthday calendar', () => {
  it('matches the inclusive server date interval rather than rounding integer ages', () => {
    const today = new Date('2026-09-30T23:59:59Z');
    expect(dateOnly(birthdayBounds(today).min)).toBe('1906-09-30');
    expect(dateOnly(birthdayBounds(today).max)).toBe('2008-09-30');
    expect(isBirthdayAllowed('1906-09-30', today)).toBe(true);
    expect(isBirthdayAllowed('1906-09-29', today)).toBe(false);
    expect(isBirthdayAllowed('2008-09-30', today)).toBe(true);
    expect(isBirthdayAllowed('2008-10-01', today)).toBe(false);
  });

  it('clamps leap-day bounds and preserves the existing March-first birthday rule', () => {
    const leap = new Date('2024-02-29T12:00:00Z');
    expect(dateOnly(birthdayBounds(leap).max)).toBe('2006-02-28');
    expect(isBirthdayAllowed('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(false);
    expect(isBirthdayAllowed('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(true);
  });

  it('navigates short months and year changes without overflow', () => {
    expect(dateOnly(shiftCalendarMonths(new Date('2024-01-31T00:00:00Z'), 1))).toBe('2024-02-29');
    expect(dateOnly(shiftCalendarMonths(new Date('2024-02-29T00:00:00Z'), 12))).toBe('2025-02-28');
    expect(dateOnly(shiftCalendarMonths(new Date('2000-01-31T00:00:00Z'), -1))).toBe('1999-12-31');
  });

  it('builds complete Monday-first weeks with an explicit disabled-age boundary', () => {
    const weeks = calendarWeeks(2008, 8);
    expect(dateOnly(weeks[0]![0]!)).toBe('2008-09-01');
    expect(weeks.every(week => week.length === 7)).toBe(true);
    expect(weeks.flat().map(dateOnly)).toContain('2008-10-01');
    const february = calendarWeeks(2024, 1).flat().map(dateOnly);
    expect(february).toContain('2024-02-29');
    expect(new Set(february).size).toBe(february.length);
  });

  it('uses the UTC day even when the clock is in another time zone', () => {
    expect(dateOnly(birthdayBounds(new Date('2026-10-01T00:30:00+02:00')).max)).toBe('2008-09-30');
    expect(isBirthdayAllowed('2020-02-30', new Date('2026-09-30T00:00:00Z'))).toBe(false);
  });

  it('keeps Icelandic and English calendar labels independent of platform Intl support', () => {
    const birthday = new Date('2004-02-29T00:00:00Z');
    expect(birthdayDateLabel(birthday, 'is')).toBe('sunnudagur, 29. febrúar 2004');
    expect(birthdayDateLabel(birthday, 'en')).toBe('Sunday, 29 February 2004');
    expect(birthdayDateLabel(birthday, 'is', false)).toBe('29. febrúar 2004');
  });
});
