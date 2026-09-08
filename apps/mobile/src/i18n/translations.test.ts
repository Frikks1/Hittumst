import { describe, expect, it } from 'vitest';
import { translate, translations } from './translations';

describe('localization', () => {
  it('keeps Icelandic and English keys in lockstep', () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations.is).sort());
  });

  it('defaults copy through both locales and interpolates safely', () => {
    expect(translate('is', 'brand.tagline')).toContain('næði');
    expect(translate('en', 'block.confirmTitle', { name: 'Alex' })).toBe('Block Alex?');
  });
});
