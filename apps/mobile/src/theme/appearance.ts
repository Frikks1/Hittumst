export const darkPresets = ['forest', 'midnight', 'charcoal'] as const;
export const accentColors = ['pink', 'mint', 'violet', 'amber'] as const;
export const textFonts = ['system', 'rounded', 'serif'] as const;
export type AppearancePreferences = {
  darkPreset: typeof darkPresets[number];
  accent: typeof accentColors[number];
  density: 'comfortable' | 'compact';
  textScale: 1 | 1.15 | 1.3;
  font: typeof textFonts[number];
  reducedMotion: boolean;
  discoveryLayout: 'large' | 'grid' | 'dense';
  chatBackground: 'plain' | 'soft' | 'glow';
  chatBubble: 'accent' | 'neutral';
};

export const defaultAppearance: AppearancePreferences = {
  darkPreset: 'charcoal', accent: 'amber', density: 'comfortable', textScale: 1,
  font: 'system', reducedMotion: false, discoveryLayout: 'dense',
  chatBackground: 'plain', chatBubble: 'accent',
};

export function parseAppearance(value: unknown): AppearancePreferences {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    darkPreset: darkPresets.includes(p.darkPreset as never) ? p.darkPreset as AppearancePreferences['darkPreset'] : defaultAppearance.darkPreset,
    accent: accentColors.includes(p.accent as never) ? p.accent as AppearancePreferences['accent'] : defaultAppearance.accent,
    density: p.density === 'compact' ? 'compact' : 'comfortable',
    textScale: p.textScale === 1.15 || p.textScale === 1.3 ? p.textScale : 1,
    font: textFonts.includes(p.font as never) ? p.font as AppearancePreferences['font'] : 'system',
    reducedMotion: p.reducedMotion === true,
    discoveryLayout: p.discoveryLayout === 'large' || p.discoveryLayout === 'dense' || p.discoveryLayout === 'grid' ? p.discoveryLayout : defaultAppearance.discoveryLayout,
    chatBackground: p.chatBackground === 'soft' || p.chatBackground === 'glow' ? p.chatBackground : 'plain',
    chatBubble: p.chatBubble === 'neutral' ? 'neutral' : 'accent',
  };
}

export function appearanceFont(font: AppearancePreferences['font'], platform: string): string | undefined {
  if (font === 'system') return undefined;
  if (font === 'serif') return platform === 'ios' ? 'Georgia' : 'serif';
  return platform === 'ios' ? 'Avenir Next' : platform === 'android' ? 'sans-serif-medium' : 'Verdana';
}
