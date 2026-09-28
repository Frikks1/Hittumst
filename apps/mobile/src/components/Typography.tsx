import { createContext, forwardRef, useContext } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { useAppearance } from '@/providers/AppearanceProvider';
import { appearanceFont } from '@/theme/appearance';

const InsideText = createContext(false);
export type Text = NativeText;
export type TextInput = NativeTextInput;
function useTypography(style: TextProps['style'], nested = false): TextStyle {
  const { appearance } = useAppearance();
  const flat = StyleSheet.flatten(style) ?? {};
  return {
    fontFamily: appearanceFont(appearance.font, Platform.OS),
    ...(!nested || flat.fontSize ? { fontSize: (flat.fontSize ?? 14) * appearance.textScale } : {}),
    ...(flat.lineHeight ? { lineHeight: flat.lineHeight * appearance.textScale } : {}),
  };
}

export const Text = forwardRef<NativeText, TextProps>(function Text({ style, ...props }, ref) {
  const nested = useContext(InsideText);
  const typography = useTypography(style, nested);
  return <InsideText.Provider value><NativeText ref={ref} {...props} style={[style, typography]} /></InsideText.Provider>;
});
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const typography = useTypography(style);
  return <NativeTextInput ref={ref} {...props} style={[style, typography]} />;
});
