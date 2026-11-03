import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { StraxDetail, StraxShareInput } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, EmptyState, textStyles } from '@/components/ui';
import { straxCopy } from '@/i18n/strax';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { straxApi } from '@/services/strax';
import type { FriendSummary, GroupSummary } from '@/types/domain';
import { useStraxResource, useStraxSummary } from './hooks';
import { straxIsActive, straxMinutesLeft } from './model';

export function StraxLogo({ size = 24, color }: { size?: number; color?: string }) {
  const { theme } = useApp();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color ?? theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="flash" size={size * 0.63} color={color ?? theme.colors.accent} />
    </View>
  );
}

export function StraxCounter({
  count,
  loading = false,
  onPress,
}: {
  count?: number | null;
  loading?: boolean;
  onPress: () => void;
}) {
  const { theme, locale } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count == null
          ? 'Strax'
          : locale === 'is'
            ? `${count} Strax í boði núna`
            : `${count} Strax happening now`
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.counter,
        { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
        pressed && styles.pressed,
      ]}
    >
      <StraxLogo size={22} />
      <Text style={[styles.counterLabel, { color: theme.colors.accent }]}>Strax</Text>
      {loading && count == null ? (
        <ActivityIndicator size="small" color={theme.colors.accent} />
      ) : (
        count != null && (
          <View style={[styles.countBadge, { backgroundColor: theme.colors.accent }]}>
            <Text style={[styles.countBadgeText, { color: theme.colors.textOnAccent }]}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )
      )}
    </Pressable>
  );
}

export function StraxDiscoveryCounter({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const summary = useStraxSummary();
  const expiry = summary.data?.nextExpiryAt;
  const expiredSnapshot = !!expiry && Date.parse(expiry) <= summary.now;
  const refreshedExpiry = useRef<string | null>(null);
  useEffect(() => {
    if (expiredSnapshot && expiry && refreshedExpiry.current !== expiry) {
      refreshedExpiry.current = expiry;
      void summary.reload();
    }
  }, [expiredSnapshot, expiry, summary.reload]);
  return (
    <StraxCounter
      count={expiredSnapshot || summary.error ? null : summary.data?.count}
      loading={summary.loading}
      onPress={onPress ?? (() => router.push('/(tabs)/hittingar?section=strax' as Href))}
    />
  );
}

export function StraxCountdown({ item, now }: { item: StraxDetail; now: number }) {
  const { theme, locale } = useApp();
  const copy = straxCopy(locale);
  const minutes = straxMinutesLeft(item.expiresAt, now);
  const label = !straxIsActive(item, now)
    ? item.status === 'closed'
      ? copy.closed
      : copy.expired
    : minutes <= 1
      ? copy.lessMinute
      : locale === 'is'
        ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} klst. ` : ''}${minutes % 60} mín. ${copy.remaining}`
        : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m ${copy.remaining}`;
  return (
    <View style={styles.fact}>
      <Ionicons name="time-outline" size={15} color={theme.colors.accent} />
      <Text style={[styles.meta, { color: theme.colors.accent }]}>{label}</Text>
    </View>
  );
}

export function StraxCard({
  item,
  now,
  onPress,
}: {
  item: StraxDetail;
  now: number;
  onPress: () => void;
}) {
  const { theme, locale } = useApp();
  const copy = straxCopy(locale);
  const active = straxIsActive(item, now);
  const places =
    item.spacesNeeded === null ? null : Math.max(0, item.spacesNeeded - item.participantCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Strax: ${item.title}. ${item.host.displayName}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTop}>
        {item.photoUrl ? (
          <Image
            source={item.photoUrl}
            accessibilityLabel={item.title}
            style={styles.thumbnail}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              styles.thumbnail,
              styles.placeholder,
              { backgroundColor: theme.colors.accentSoft },
            ]}
          >
            <StraxLogo size={28} />
          </View>
        )}
        <View style={styles.cardCopy}>
          <StraxCountdown item={item} now={now} />
          <Text numberOfLines={2} style={[styles.cardTitle, { color: theme.colors.text }]}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>
            {item.host.displayName} ·{' '}
            {item.venueMode === 'online' ? copy.online : item.locationText || copy.inPerson}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.textMuted} />
      </View>
      <Text numberOfLines={2} style={[styles.meta, { color: theme.colors.textMuted }]}>
        {item.description}
      </Text>
      <View style={styles.cardFacts}>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          {active && places !== null
            ? places
              ? copy.placesCount(places)
              : copy.full
            : copy.participantCount(item.participantCount)}
        </Text>
        <Text style={[styles.small, { color: theme.colors.accent }]}>
          {item.viewerState === 'host'
            ? copy.mine
            : item.viewerState === 'pending'
              ? copy.pending
              : item.viewerState === 'joined'
                ? copy.joined
                : item.joinMode === 'application'
                  ? copy.apply
                  : copy.open}
        </Text>
      </View>
    </Pressable>
  );
}

export function StraxBrowse() {
  const { theme, locale } = useApp();
  const copy = straxCopy(locale);
  const router = useRouter();
  const [section, setSection] = useState<'active' | 'mine' | 'notifications'>('active');
  const loader = useCallback(async () => {
    const [listed, owned, notifications] = await Promise.allSettled([
      straxApi.list(),
      straxApi.mine(),
      straxApi.notifications(),
    ]);
    if (listed.status === 'rejected') throw listed.reason;
    return {
      ...listed.value,
      mine: owned.status === 'fulfilled' ? owned.value : [],
      mineError: owned.status === 'rejected',
      notifications: notifications.status === 'fulfilled' ? notifications.value : [],
      notificationError: notifications.status === 'rejected',
    };
  }, []);
  const resource = useStraxResource(loader, 'browse');
  const items =
    section === 'mine'
      ? (resource.data?.mine ?? [])
      : (resource.data?.items ?? []).filter((item) => straxIsActive(item, resource.now));
  return (
    <View style={styles.browse}>
      <View style={styles.browseHeader}>
        <View style={styles.headingLine}>
          <StraxLogo size={30} />
          <View style={{ flex: 1 }}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{copy.tagline}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{copy.intro}</Text>
          </View>
        </View>
        <Button
          icon="add"
          label={copy.create}
          onPress={() => router.push('/hittingar/strax/create' as Href)}
        />
        <View style={styles.choices}>
          <ChoiceChip
            label={copy.active}
            selected={section === 'active'}
            onPress={() => setSection('active')}
          />
          <ChoiceChip
            label={copy.mine}
            selected={section === 'mine'}
            onPress={() => setSection('mine')}
          />
          <ChoiceChip
            label={copy.notifications}
            selected={section === 'notifications'}
            onPress={() => setSection('notifications')}
          />
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={resource.loading}
            onRefresh={() => void resource.reload()}
            tintColor={theme.colors.accent}
          />
        }
        contentContainerStyle={styles.browseList}
      >
        {(resource.error ||
          (section === 'mine' && resource.data?.mineError) ||
          (section === 'notifications' && resource.data?.notificationError)) && (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
              {copy.loadError}
            </Text>
            <Button label={copy.retry} variant="secondary" onPress={() => void resource.reload()} />
          </View>
        )}
        {resource.loading && !resource.data ? (
          <ActivityIndicator accessibilityLabel={copy.loading} color={theme.colors.accent} />
        ) : section === 'notifications' ? (
          <>
            {!resource.data?.notifications.length && (
              <EmptyState icon="notifications-outline" title={copy.noNotifications} />
            )}
            {resource.data?.notifications.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${copy.notificationKinds[item.kind]}: ${item.title}`}
                onPress={() => router.push(`/hittingar/strax/${item.activityId}` as Href)}
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.small, { color: theme.colors.accent }]}>
                  {copy.notificationKinds[item.kind]}
                </Text>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.small, { color: theme.colors.textMuted }]}>
                  {new Date(item.createdAt).toLocaleString(locale === 'is' ? 'is-IS' : 'en-GB', {
                    timeZone: 'Atlantic/Reykjavik',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </Text>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            {!items.length && (
              <EmptyState icon="flash-outline" title={copy.empty} body={copy.emptyHint} />
            )}
            {items.map((item) => (
              <StraxCard
                key={item.id}
                item={item}
                now={resource.now}
                onPress={() => router.push(`/hittingar/strax/${item.id}` as Href)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

export type ShareSelection = { allFriends: boolean; friendIds: string[]; groupIds: string[] };
export const emptyShareSelection: ShareSelection = {
  allFriends: false,
  friendIds: [],
  groupIds: [],
};
export function hasShareRecipients(value: StraxShareInput) {
  return !!(value.allFriends || value.friendIds?.length || value.groupIds?.length);
}
export function StraxSharePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ShareSelection;
  onChange: (next: ShareSelection) => void;
  disabled?: boolean;
}) {
  const { user, theme, locale } = useApp();
  const copy = straxCopy(locale);
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const revision = ++generation.current;
    setLoading(true);
    setError(false);
    const results = await Promise.allSettled([api.listFriends(), api.listGroups()]);
    if (revision !== generation.current) return;
    setFriends(
      results[0].status === 'fulfilled'
        ? results[0].value.filter((item) => item.status === 'accepted')
        : [],
    );
    setGroups(
      results[1].status === 'fulfilled'
        ? results[1].value.filter(
            (item) => item.membershipStatus !== 'invited' && item.status !== 'locked',
          )
        : [],
    );
    setError(results.some((result) => result.status === 'rejected'));
    setLoading(false);
  }, []);
  useEffect(() => {
    setFriends([]);
    setGroups([]);
    if (open) void load();
    return () => {
      generation.current++;
    };
  }, [load, open, user?.id]);
  const toggle = (field: 'friendIds' | 'groupIds', id: string) =>
    onChange({
      ...value,
      [field]: value[field].includes(id)
        ? value[field].filter((item) => item !== id)
        : [...value[field], id],
    });
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={copy.share}
        accessibilityState={{ expanded: open, disabled }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={[styles.pickerHeading, { borderColor: theme.colors.border }]}
      >
        <Ionicons name="paper-plane-outline" size={18} color={theme.colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{copy.share}</Text>
          <Text style={[styles.small, { color: theme.colors.textMuted }]}>
            {hasShareRecipients(value)
              ? `${value.allFriends ? copy.allFriends : copy.friendCount(value.friendIds.length)} · ${copy.groupCount(value.groupIds.length)}`
              : copy.shareNone}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>
      {open && (
        <View
          style={[
            styles.picker,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{copy.shareHint}</Text>
          {loading && <ActivityIndicator color={theme.colors.accent} />}
          {error && (
            <>
              <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                {copy.shareLoadError}
              </Text>
              <Button label={copy.retry} variant="secondary" onPress={() => void load()} />
            </>
          )}
          <StraxCheck
            label={copy.allFriends}
            checked={value.allFriends}
            disabled={disabled || loading || friends.length === 0}
            onPress={() => onChange({ ...value, allFriends: !value.allFriends, friendIds: [] })}
          />
          <Text style={[styles.label, { color: theme.colors.text }]}>{copy.friends}</Text>
          {!loading && !friends.length && (
            <Text style={{ color: theme.colors.textMuted }}>{copy.noFriends}</Text>
          )}
          <ScrollView nestedScrollEnabled style={styles.destinationList}>
            {friends.map((friend) => (
              <StraxCheck
                key={friend.profileId}
                label={friend.displayName}
                checked={value.allFriends || value.friendIds.includes(friend.profileId)}
                disabled={disabled || value.allFriends}
                onPress={() => toggle('friendIds', friend.profileId)}
              />
            ))}
          </ScrollView>
          <Text style={[styles.label, { color: theme.colors.text }]}>{copy.groups}</Text>
          {!loading && !groups.length && (
            <Text style={{ color: theme.colors.textMuted }}>{copy.noGroups}</Text>
          )}
          <ScrollView nestedScrollEnabled style={styles.destinationList}>
            {groups.map((group) => (
              <StraxCheck
                key={group.id}
                label={group.name}
                checked={value.groupIds.includes(group.id)}
                disabled={disabled}
                onPress={() => toggle('groupIds', group.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export function StraxCheck({
  label,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      style={[styles.check, disabled && { opacity: 0.55 }]}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? theme.colors.accent : theme.colors.textMuted}
      />
      <Text style={[styles.meta, { color: theme.colors.text, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

export type StraxPhoto = { uri: string; mimeType: string };
export function StraxPhotoPicker({
  photo,
  onChange,
  disabled = false,
}: {
  photo: StraxPhoto | null;
  onChange: (photo: StraxPhoto | null) => void;
  disabled?: boolean;
}) {
  const { theme, locale } = useApp();
  const copy = straxCopy(locale);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('permission');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        const mimeType = asset.mimeType ?? 'image/jpeg';
        if (
          (asset.fileSize ?? 0) > 10 * 1024 * 1024 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
        )
          throw new Error('invalid_photo');
        onChange({ uri: asset.uri, mimeType });
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 9 }}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{copy.photo}</Text>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{copy.photoHint}</Text>
      {photo && (
        <Image
          source={photo.uri}
          accessibilityLabel={copy.photo}
          style={styles.photoPreview}
          contentFit="cover"
        />
      )}
      {error && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {copy.photoPickError}
        </Text>
      )}
      <View style={styles.choices}>
        <Button
          icon="image-outline"
          label={copy.addPhoto}
          disabled={disabled}
          loading={busy}
          variant="secondary"
          onPress={() => void pick()}
        />
        {photo && (
          <Button
            label={copy.removePhoto}
            disabled={disabled}
            variant="ghost"
            onPress={() => onChange(null)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  counterLabel: { fontSize: 12, fontWeight: '800' },
  countBadge: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  browse: { flex: 1, minHeight: 0, maxWidth: 840, width: '100%', alignSelf: 'center' },
  browseHeader: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  headingLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  browseList: { padding: 16, gap: 12, flexGrow: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardCopy: { flex: 1, minWidth: 0, gap: 4 },
  thumbnail: { width: 58, height: 58, borderRadius: 9 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  cardFacts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 13, lineHeight: 19 },
  small: { fontSize: 11, lineHeight: 16 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  pickerHeading: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  picker: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 10 },
  destinationList: { maxHeight: 220 },
  check: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  photoPreview: { width: '100%', height: 180, borderRadius: 10 },
});
