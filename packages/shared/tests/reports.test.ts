import { describe, expect, it } from 'vitest';
import {
  normalizeReportCategory,
  reportCategories,
  reportCategorySchema,
} from '../src/reports';

describe('canonical report categories', () => {
  it('contains the safety-critical Hittingar categories', () => {
    expect(reportCategories).toEqual(
      expect.arrayContaining([
        'minor_suspected',
        'coercion_non_consent',
        'trafficking_exploitation',
        'compensated_sexual_services',
      ]),
    );
  });

  it('normalizes known legacy labels but rejects unknown categories', () => {
    expect(normalizeReportCategory('minor')).toBe('minor_suspected');
    expect(normalizeReportCategory('hate-or-discrimination')).toBe('hate_discrimination');
    expect(normalizeReportCategory('intimate')).toBe('ncii');
    expect(normalizeReportCategory('made_up_reason')).toBeNull();
    expect(reportCategorySchema.safeParse('impersonation').success).toBe(false);
  });
});

