import { describe, expect, it } from 'vitest';
import { defaultProfileAppearance, normalizeProfileAppearance, profilePalettes, profilePhotoPosterPath, validateProfileAppearance } from './profileAppearance';

describe('profile appearance catalog', () => {
  it.each([undefined, null, [], 'violet', 1])('defaults older or malformed profile data: %s', value => {
    expect(normalizeProfileAppearance(value)).toEqual(defaultProfileAppearance);
  });

  it('preserves supported legacy choices and discards unsupported content', () => {
    expect(normalizeProfileAppearance({ palette: 'fern', banner: 'https://external.test', effect: 'fireflies', avatarBorder: 'css()', script: 'javascript()' }))
      .toEqual({ palette: 'fern', banner: 'photo', effect: 'fireflies', avatarBorder: 'none' });
  });

  it('returns independent settings so editing cannot mutate the defaults', () => {
    const result = normalizeProfileAppearance(undefined);
    result.palette = 'ember';
    expect(defaultProfileAppearance.palette).toBe('default');
  });

  it('accepts the complete appearance selection', () => {
    const selected = { palette: 'violet', banner: 'aurora', effect: 'sparkles', avatarBorder: 'ferns' } as const;
    expect(validateProfileAppearance(selected)).toEqual(selected);
    expect(validateProfileAppearance(selected)).not.toBe(selected);
  });

  it.each([
    { ...defaultProfileAppearance, palette: 'javascript()' },
    { ...defaultProfileAppearance, banner: 'https://external.test' },
    { ...defaultProfileAppearance, effect: null },
    { ...defaultProfileAppearance, avatarBorder: 'unknown' },
    { ...defaultProfileAppearance, css: 'body{}' },
    { palette: 'fern' }, null, [],
  ])('rejects invalid writes: %s', value => {
    expect(() => validateProfileAppearance(value)).toThrow('invalid_profile_appearance');
  });

  it('keeps profile text above WCAG AA contrast on every colored surface', () => {
    const luminance = (hex: string) => {
      const [red, green, blue] = hex.slice(1).match(/../g)!.map(component => {
        const value = Number.parseInt(component, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722;
    };
    for (const palette of Object.values(profilePalettes)) {
      for (const foreground of [palette.text, palette.textMuted, palette.accent]) {
        for (const background of [palette.canvas, palette.surface]) {
          expect((luminance(foreground) + 0.05) / (luminance(background) + 0.05)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('uses sanitized first-frame paths only for GIF media', () => {
    expect(profilePhotoPosterPath('member/photo.gif')).toBe('member/photo-thumb.jpg');
    expect(profilePhotoPosterPath('member/photo.jpg')).toBeUndefined();
  });
});
