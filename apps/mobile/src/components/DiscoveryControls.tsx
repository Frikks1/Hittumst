import { type ReactNode, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import {
  profileGenderSchema,
  diagnosisIdSchema,
  socialFilterSchema,
  type DiscoveryExtensions,
  type ProfileGender,
  type DiagnosisId,
} from '@rummal/shared';
import { useApp } from '@/providers/AppProvider';
import type { TranslationKey } from '@/i18n/translations';
import { Text } from './Typography';
import { Button, ChoiceChip } from './ui';
export function FilterSection({
  title,
  summary,
  open,
  onPress,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { theme } = useApp();
  return (
    <View
      style={{ gap: 12, borderBottomWidth: 1, borderColor: theme.colors.border, paddingBottom: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onPress}
        style={{ minHeight: 52, justifyContent: 'center', gap: 4 }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 17 }}>
          {title} {open ? '−' : '+'}
        </Text>
        {Boolean(summary) && <Text style={{ color: theme.colors.textMuted }}>{summary}</Text>}
      </Pressable>
      {open && children}
    </View>
  );
}
export function RadiusControl({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t, theme } = useApp();
  const width = useRef(1);
  const current = useRef({ value, onChange });
  current.current = { value, onChange };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) =>
        current.current.onChange(
          Math.round(1 + Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current)) * 499),
        ),
      onPanResponderMove: (e) =>
        current.current.onChange(
          Math.round(1 + Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current)) * 499),
        ),
    }),
  ).current;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
        {t('discovery.distance')}: {value === null ? t('discovery.unlimited') : value + ' km'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ChoiceChip
          selected={value === null}
          label={t('discovery.unlimited')}
          onPress={() => onChange(null)}
        />
        <ChoiceChip
          selected={value === 10}
          label={t('discovery.closeBy')}
          onPress={() => onChange(10)}
        />
      </View>
      <View
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={t('discovery.distance')}
        accessibilityValue={{
          min: 1,
          max: 500,
          now: value ?? 500,
          text: value === null ? t('discovery.unlimited') : value + ' km',
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onChange(
            Math.max(
              1,
              Math.min(500, (value ?? 500) + (e.nativeEvent.actionName === 'increment' ? 1 : -1)),
            ),
          )
        }
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width;
        }}
        style={{ height: 48, justifyContent: 'center' }}
      >
        <View
          pointerEvents="none"
          style={{ height: 5, borderRadius: 4, backgroundColor: theme.colors.border }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: ((((value ?? 500) - 1) / 499) * 94 + '%') as `${number}%`,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button
          variant="ghost"
          label="− 1 km"
          onPress={() => onChange(Math.max(1, (value ?? 500) - 1))}
        />
        <Button
          variant="ghost"
          label="+ 1 km"
          onPress={() => onChange(Math.min(500, (value ?? 1) + 1))}
        />
      </View>
      <Text style={{ color: theme.colors.textMuted }}>{t('discovery.distanceHelp')}</Text>
    </View>
  );
}
export function GenderChoices({
  value,
  onChange,
  emptyLabel,
}: {
  value: ProfileGender[];
  onChange: (v: ProfileGender[]) => void;
  emptyLabel?: string;
}) {
  const { t } = useApp();
  const [more, setMore] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ChoiceChip
          selected={!value.length}
          label={emptyLabel ?? t('discovery.gender.all')}
          onPress={() => onChange([])}
        />
        {profileGenderSchema.options
          .filter((g, i) => i < 3 || more || value.includes(g))
          .map((g) => (
            <ChoiceChip
              key={g}
              label={t(('discovery.gender.' + g) as TranslationKey)}
              selected={value.includes(g)}
              onPress={() =>
                onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g])
              }
            />
          ))}
      </View>
      {!more && (
        <Button variant="ghost" label={t('discovery.moreOptions')} onPress={() => setMore(true)} />
      )}
    </View>
  );
}
export function DiagnosisChoices({
  value,
  onChange,
}: {
  value: DiagnosisId[];
  onChange: (v: DiagnosisId[]) => void;
}) {
  const { t } = useApp();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {diagnosisIdSchema.options.map((id) => (
        <ChoiceChip
          key={id}
          label={t(('diagnosis.' + id) as TranslationKey)}
          selected={value.includes(id)}
          onPress={() =>
            onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
          }
        />
      ))}
    </View>
  );
}
export function SocialChoices({
  value,
  onChange,
  events = false,
}: {
  value: DiscoveryExtensions['social'];
  onChange: (v: DiscoveryExtensions['social']) => void;
  events?: boolean;
}) {
  const { t } = useApp();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {socialFilterSchema.options.map((id) => (
        <ChoiceChip
          key={id}
          selected={value === id}
          label={
            events && id === 'favorites'
              ? t('discovery.savedEvents')
              : events && id === 'friends'
                ? t('discovery.hostFriends')
                : events && id === 'friends_of_friends'
                  ? t('discovery.hostFriendsOfFriends')
                  : t(('discovery.social.' + id) as TranslationKey)
          }
          onPress={() => onChange(id)}
        />
      ))}
    </View>
  );
}
