import type { ColorSchemeName } from 'react-native';
import { defaultAppearance, type AppearancePreferences } from './appearance';

export type ThemeMode = 'system' | 'light' | 'dark';

export type AppTheme = {
  dark: boolean;
  colors: {
    canvas: string;
    surface: string;
    surfaceRaised: string;
    surfaceMuted: string;
    text: string;
    textMuted: string;
    textOnAccent: string;
    border: string;
    accent: string;
    accentPressed: string;
    accentSoft: string;
    lava: string;
    warning: string;
    danger: string;
    success: string;
    scrim: string;
  };
  spacing: typeof spacing;
  radius: typeof radius;
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999
} as const;

const common = { spacing, radius };

export const lightTheme: AppTheme = {
  ...common,
  dark: false,
  colors: {
    canvas: '#F4F2EC',
    surface: '#FCFBF7',
    surfaceRaised: '#FFFFFF',
    surfaceMuted: '#E9ECE7',
    text: '#10201B',
    textMuted: '#62706B',
    textOnAccent: '#F8FFFC',
    border: '#D8DCD6',
    accent: '#0D705B',
    accentPressed: '#095242',
    accentSoft: '#DCEFE8',
    lava: '#D75B3D',
    warning: '#9A6500',
    danger: '#B4233A',
    success: '#167555',
    scrim: 'rgba(10, 20, 18, 0.58)'
  }
};

export const darkTheme: AppTheme = {
  ...common,
  dark: true,
  colors: {
    canvas: '#09130F',
    surface: '#111D19',
    surfaceRaised: '#182722',
    surfaceMuted: '#22332D',
    text: '#F5F7F2',
    textMuted: '#B4C0BB',
    textOnAccent: '#071B16',
    border: '#2F443C',
    accent: '#78DFC1',
    accentPressed: '#A8E8D7',
    accentSoft: '#153B31',
    lava: '#FF8A67',
    warning: '#F6C35B',
    danger: '#FF8FA0',
    success: '#70D3B1',
    scrim: 'rgba(0, 0, 0, 0.7)'
  }
};

export function resolveTheme(mode: ThemeMode, systemScheme: ColorSchemeName, appearance: AppearancePreferences = defaultAppearance): AppTheme {
  const base = mode === 'dark' || (mode === 'system' && systemScheme === 'dark') ? darkTheme : lightTheme;
  const palettes = {
    forest: { canvas: '#070E0C', surface: '#0D1B17', surfaceRaised: '#182C25', surfaceMuted: '#20382F', border: '#355247' },
    midnight: { canvas: '#080D1B', surface: '#121B30', surfaceRaised: '#1B2944', surfaceMuted: '#283653', border: '#3F506F' },
    charcoal: { canvas: '#101114', surface: '#1B1D22', surfaceRaised: '#26292F', surfaceMuted: '#34373E', border: '#4A4F59' },
  };
  const accents = base.dark ? {
    pink: ['#FF6B98', '#FF90B0', '#341826'], mint: ['#78DFC1', '#A8E8D7', '#153B31'],
    violet: ['#BCACFF', '#D4CAFF', '#292340'], amber: ['#F3C776', '#F9DCA6', '#382E1B'],
  } : {
    pink: ['#B91C50', '#95113C', '#FBE3ED'], mint: ['#0D705B', '#095242', '#DCEFE8'],
    violet: ['#6240B9', '#492C91', '#EDE7FC'], amber: ['#845A08', '#644304', '#F5EAD2'],
  };
  const [accent, accentPressed, accentSoft] = accents[appearance.accent];
  return { ...base, colors: { ...base.colors, ...(base.dark ? palettes[appearance.darkPreset] : {}),
    accent: accent!, accentPressed: accentPressed!, accentSoft: accentSoft!, textOnAccent: base.dark ? '#101318' : '#FFFFFF' } };
}
