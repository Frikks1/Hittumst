import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { showcaseStyles } from './components';

export function AdvancedSection({
  title,
  children,
  summary,
  initiallyOpen = false,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  summary?: string;
  initiallyOpen?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useApp();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={showcaseStyles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open, disabled }}
        aria-expanded={open}
        disabled={disabled}
        onPress={() => setOpen((value) => !value)}
        style={[showcaseStyles.row, { minHeight: 44 }]}
      >
        <Ionicons
          name={open ? 'chevron-down-outline' : 'chevron-forward-outline'}
          size={18}
          color={theme.colors.textMuted}
        />
        <Text style={{ color: theme.colors.text, fontWeight: '700', flex: 1 }}>
          {title}
          {summary ? ` · ${summary}` : ''}
        </Text>
      </Pressable>
      {open && children}
    </View>
  );
}
