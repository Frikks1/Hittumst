const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return parsed;
}

export function calculateAge(dateOfBirth: string | Date, today = new Date()): number | null {
  const birth = typeof dateOfBirth === 'string' ? parseDateOnly(dateOfBirth) : dateOfBirth;
  if (!birth || Number.isNaN(birth.getTime()) || birth.getTime() > today.getTime()) return null;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAtLeast18(dateOfBirth: string, today = new Date()): boolean {
  const age = calculateAge(dateOfBirth, today);
  return age !== null && age >= 18;
}
