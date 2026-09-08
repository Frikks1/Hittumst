import { z } from 'zod';

/** Canonical moderation categories stored by new clients and Hittingar APIs. */
export const reportCategories = [
  'minor_suspected',
  'csam',
  'threat',
  'ncii',
  'harassment',
  'coercion_non_consent',
  'dangerous_location',
  'misrepresentation',
  'hate_discrimination',
  'spam_advertising',
  'trafficking_exploitation',
  'illegal_activity',
  'compensated_sexual_services',
  'other',
] as const;

export const reportCategorySchema = z.enum(reportCategories);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

const legacyReportCategoryAliases: Readonly<Record<string, ReportCategory>> = {
  underage: 'minor_suspected',
  suspected_minor: 'minor_suspected',
  minor: 'minor_suspected',
  non_consensual_intimate_image: 'ncii',
  non_consensual_intimate_media: 'ncii',
  intimate: 'ncii',
  threats: 'threat',
  harassment_or_threats: 'threat',
  coercion: 'coercion_non_consent',
  coercion_or_no_consent: 'coercion_non_consent',
  dangerous_or_misleading_location: 'dangerous_location',
  materially_misrepresented: 'misrepresentation',
  event_materially_misrepresented: 'misrepresentation',
  impersonation: 'misrepresentation',
  hate: 'hate_discrimination',
  hate_speech: 'hate_discrimination',
  hate_or_discrimination: 'hate_discrimination',
  spam: 'spam_advertising',
  spam_or_advertising: 'spam_advertising',
  trafficking: 'trafficking_exploitation',
  exploitation: 'trafficking_exploitation',
  illegal: 'illegal_activity',
  illegal_or_compensated_sex: 'illegal_activity',
  compensated_sex: 'compensated_sexual_services',
};

/**
 * Converts historical UI/database spellings at an ingestion boundary. Unknown
 * values return null so callers cannot silently turn new categories into
 * `other` and lose moderation signal.
 */
export function normalizeReportCategory(value: string): ReportCategory | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const canonical = reportCategorySchema.safeParse(normalized);
  if (canonical.success) return canonical.data;
  return legacyReportCategoryAliases[normalized] ?? null;
}

