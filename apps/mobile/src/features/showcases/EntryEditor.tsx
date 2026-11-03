import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { ShowcaseEntry, ShowcasePickers, ShowcaseRequirements } from '@rummal/shared';
import { Button, ChoiceChip, Field } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import type { PendingEventMedia } from '@/features/hittingar/EventMedia';
import { showcaseCopy } from './copy';
import { AdvancedSection } from './AdvancedSection';
import { FriendMeetups } from './FriendMeetups';
import {
  ShowcaseHeading,
  ShowcaseHint,
  ShowcaseMediaView,
  ShowcasePanel,
  showcaseStyles,
} from './components';

export function ShowcaseEntryEditor({
  entry,
  pickers,
  index,
  last,
  busy,
  coverMediaId,
  onChange,
  onMove,
  onRemove,
  onCover,
  onUpload,
}: {
  entry: ShowcaseEntry;
  pickers: ShowcasePickers;
  index: number;
  last: boolean;
  busy: boolean;
  coverMediaId: string | null;
  onChange: (patch: Partial<ShowcaseEntry>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onCover: (id: string | null) => void;
  onUpload: (media: PendingEventMedia, caption: string) => Promise<boolean>;
}) {
  const { locale } = useApp();
  const c = showcaseCopy(locale);
  const [media, setMedia] = useState<PendingEventMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [consent, setConsent] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const operation = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const matches = (value: string) =>
    !query.trim() || value.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim());
  const selectedGroup = pickers.groups.find((group) => group.id === entry.groupId);
  const chooseEvent = (event: ShowcasePickers['events'][number]) => {
    if (busy) return;
    const ids = entry.meetupIds.includes(event.id)
      ? entry.meetupIds.filter((id) => id !== event.id)
      : [...entry.meetupIds, event.id];
    onChange({
      meetupIds: ids,
      meetups: pickers.events
        .filter((item) => ids.includes(item.id))
        .map((item) => ({ id: item.id, title: item.title })),
      ...(entry.kind === 'event' && !entry.title.trim() ? { title: event.title.slice(0, 80) } : {}),
    });
  };
  const eventChoices = (
    <View style={showcaseStyles.section}>
      <ShowcaseHeading>{c.events}</ShowcaseHeading>
      {!pickers.events.length && <ShowcaseHint>{c.noEvents}</ShowcaseHint>}
      <View style={showcaseStyles.row}>
        {pickers.events
          .filter((event) => matches(event.title))
          .map((event) => (
            <ChoiceChip
              key={event.id}
              label={`${event.title}${event.private ? ` · ${c.privateEventShort}` : ''}`}
              selected={entry.meetupIds.includes(event.id)}
              onPress={() => chooseEvent(event)}
            />
          ))}
      </View>
    </View>
  );
  const changeRequirements = (patch: Partial<ShowcaseRequirements>) => {
    const requirements = { ...entry.requirements, ...patch };
    onChange({
      requirements,
      requirementMeetups: pickers.requirementEvents
        .filter((event) => event.id === requirements.meetupId)
        .map((event) => ({ id: event.id, title: event.title })),
    });
  };
  const pickMedia = async () => {
    if (busy || operation.current) return;
    operation.current = true;
    setPicking(true);
    setMediaError(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
      });
      if (!active.current || result.canceled) return;
      const asset = result.assets[0];
      if (
        !asset ||
        !['image', 'video'].includes(asset.type ?? '') ||
        (asset.fileSize ?? 0) > 50 * 1024 * 1024
      )
        throw new Error('invalid_showcase_media');
      const kind = asset.type === 'video' ? ('video' as const) : ('photo' as const);
      setMedia({
        uri: asset.uri,
        kind,
        mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      });
      setConsent(false);
    } catch {
      if (active.current) setMediaError(true);
    } finally {
      operation.current = false;
      if (active.current) setPicking(false);
    }
  };
  const upload = async () => {
    if (!media || !consent || busy || operation.current) return;
    operation.current = true;
    try {
      if ((await onUpload(media, caption.trim())) && active.current) {
        setMedia(null);
        setCaption('');
        setConsent(false);
      }
    } finally {
      operation.current = false;
    }
  };
  const toggleSource = (source: ShowcasePickers['media'][number]) => {
    if (busy) return;
    const sourceUploadId = source.sourceUploadId ?? source.id;
    const existing = entry.media.find((item) => item.sourceUploadId === sourceUploadId);
    if (existing?.id === coverMediaId) onCover(null);
    onChange({
      media: existing
        ? entry.media.filter((item) => item.id !== existing.id)
        : [...entry.media, { ...source, id: Crypto.randomUUID(), sourceUploadId }],
    });
  };
  const reviewSource = pickers.events.find(
    (event) => entry.meetupIds.includes(event.id) && event.ownReview,
  );
  return (
    <ShowcasePanel>
      <ShowcaseHeading>
        {index + 1}. {entry.title || c[entry.kind]}
      </ShowcaseHeading>
      {entry.approvalStatus !== 'draft' && <ShowcaseHint>{c[entry.approvalStatus]}</ShowcaseHint>}
      <Field
        label={c.entryTitle}
        value={entry.title}
        maxLength={80}
        editable={!busy}
        onChangeText={(title) => onChange({ title })}
      />
      <Field
        label={c.body}
        value={entry.body}
        maxLength={2000}
        multiline
        editable={!busy}
        onChangeText={(body) => onChange({ body })}
      />
      {entry.kind === 'person' && (
        <View style={showcaseStyles.section}>
          <ShowcaseHeading>{c.friends}</ShowcaseHeading>
          {!pickers.friends.length && <ShowcaseHint>{c.noFriends}</ShowcaseHint>}
          <View style={showcaseStyles.row}>
            {pickers.friends
              .filter((friend) => matches(friend.displayName))
              .map((friend) => (
                <ChoiceChip
                  key={friend.id}
                  label={friend.displayName}
                  selected={entry.personId === friend.id}
                  onPress={() => {
                    if (!busy && entry.personId !== friend.id)
                      onChange({
                        personId: friend.id,
                        meetupIds: [],
                        meetups: [],
                        showCount: false,
                        ...(!entry.title ? { title: friend.displayName } : {}),
                      });
                  }}
                />
              ))}
          </View>
          <ShowcaseHint>{c.personConsentShort}</ShowcaseHint>
        </View>
      )}
      {entry.kind === 'group' && (
        <View style={showcaseStyles.section}>
          <ShowcaseHeading>{c.groups}</ShowcaseHeading>
          {!pickers.groups.length && <ShowcaseHint>{c.noGroups}</ShowcaseHint>}
          <View style={showcaseStyles.row}>
            {pickers.groups
              .filter((group) => matches(group.name))
              .map((group) => (
                <ChoiceChip
                  key={group.id}
                  label={group.name}
                  selected={entry.groupId === group.id}
                  onPress={() => {
                    if (!busy)
                      onChange({
                        groupId: group.id,
                        groupName: group.name,
                        groupMembers: entry.showMembers ? group.members : [],
                        ...(!entry.title ? { title: group.name } : {}),
                      });
                  }}
                />
              ))}
          </View>
        </View>
      )}
      {entry.kind === 'event' && eventChoices}
      {entry.media.map((item) => (
        <ShowcaseMediaView key={item.id} media={item} />
      ))}
      {media && (
        <View style={showcaseStyles.section}>
          <ShowcaseMediaView
            media={{ id: entry.id, kind: media.kind, url: media.uri, caption: '' }}
          />
          <ChoiceChip
            label={c.mediaConsent}
            selected={consent}
            onPress={() => {
              if (!busy) setConsent((value) => !value);
            }}
          />
          <Button label={c.upload} disabled={!consent || busy} onPress={() => void upload()} />
          <Button label={c.cancel} variant="ghost" disabled={busy} onPress={() => setMedia(null)} />
        </View>
      )}
      {mediaError && <ShowcaseHint alert>{c.mediaSize}</ShowcaseHint>}
      <Button
        label={c.addMedia}
        variant="secondary"
        icon="images-outline"
        disabled={busy || entry.media.length >= 12}
        loading={picking}
        onPress={() => void pickMedia()}
      />
      {!!entry.review.trim() && !entry.reviewIdentified && (
        <ChoiceChip
          label={c.identifyReview}
          selected={false}
          onPress={() => {
            if (!busy) onChange({ reviewIdentified: true });
          }}
        />
      )}
      <AdvancedSection title={c.advanced} disabled={busy}>
        <View style={showcaseStyles.row}>
          {(['story', 'event', 'person', 'group'] as const).map((kind) => (
            <ChoiceChip
              key={kind}
              label={c[kind]}
              selected={entry.kind === kind}
              onPress={() => {
                if (!busy && kind !== entry.kind)
                  onChange({
                    kind,
                    personId: undefined,
                    groupId: undefined,
                    groupName: undefined,
                    groupMembers: [],
                    showMembers: false,
                    meetupIds: [],
                    meetups: [],
                    rating: null,
                    review: '',
                    reviewIdentified: false,
                    showCount: false,
                    requirements: undefined,
                  });
              }}
            />
          ))}
        </View>
        <Field
          label={c.searchChoices}
          value={query}
          onChangeText={setQuery}
          editable={!busy}
          maxLength={100}
        />
        {entry.kind === 'person' && (
          <FriendMeetups
            key={entry.personId ?? 'none'}
            entry={entry}
            busy={busy}
            query={query}
            onChange={onChange}
          />
        )}
        {entry.kind !== 'person' && entry.kind !== 'event' && eventChoices}
        {(entry.kind === 'event' || entry.kind === 'person') && (
          <View style={showcaseStyles.section}>
            <ChoiceChip
              label={c.showCount}
              selected={entry.showCount}
              onPress={() => {
                if (!busy) onChange({ showCount: !entry.showCount });
              }}
            />
            <ShowcaseHint>{c.countHint}</ShowcaseHint>
          </View>
        )}
        {entry.kind === 'event' && (
          <View style={showcaseStyles.section}>
            <ShowcaseHeading>{c.rating}</ShowcaseHeading>
            <View style={showcaseStyles.row}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <ChoiceChip
                  key={rating}
                  label={`${rating} ★`}
                  selected={entry.rating === rating}
                  onPress={() => {
                    if (!busy) onChange({ rating });
                  }}
                />
              ))}
              <ChoiceChip
                label={c.clearRating}
                selected={entry.rating === null}
                onPress={() => {
                  if (!busy) onChange({ rating: null });
                }}
              />
            </View>
            <Field
              label={c.review}
              value={entry.review}
              onChangeText={(review) => onChange({ review, reviewIdentified: false })}
              multiline
              maxLength={2000}
              editable={!busy}
            />
            {reviewSource && (
              <Button
                label={c.importReview}
                disabled={busy}
                variant="ghost"
                onPress={() =>
                  onChange({ review: reviewSource.ownReview, reviewIdentified: false })
                }
              />
            )}
            {!!entry.review.trim() && (
              <ChoiceChip
                label={c.identifyReview}
                selected={entry.reviewIdentified}
                onPress={() => {
                  if (!busy) onChange({ reviewIdentified: !entry.reviewIdentified });
                }}
              />
            )}
            <ShowcaseHint>{c.reviewHint}</ShowcaseHint>
          </View>
        )}
        {entry.kind === 'story' && (
          <View style={showcaseStyles.section}>
            <ShowcaseHeading>{c.albums}</ShowcaseHeading>
            <ShowcaseHint>{c.albumHint}</ShowcaseHint>
            <View style={showcaseStyles.row}>
              {pickers.albums.map((album) => (
                <ChoiceChip
                  key={album.id}
                  label={album.title}
                  selected={entry.albumIds.includes(album.id)}
                  onPress={() => {
                    if (busy || (!entry.albumIds.includes(album.id) && entry.albumIds.length >= 12))
                      return;
                    const ids = entry.albumIds.includes(album.id)
                      ? entry.albumIds.filter((id) => id !== album.id)
                      : [...entry.albumIds, album.id];
                    onChange({
                      albumIds: ids,
                      albums: pickers.albums.filter((item) => ids.includes(item.id)),
                    });
                  }}
                />
              ))}
            </View>
            {!pickers.albums.length && <ShowcaseHint>{c.noAlbums}</ShowcaseHint>}
          </View>
        )}
        {entry.kind === 'group' && (
          <View style={showcaseStyles.section}>
            <Field
              label={c.groupName}
              value={entry.groupName ?? ''}
              onChangeText={(groupName) => onChange({ groupName })}
              maxLength={80}
              editable={!busy}
            />
            <ChoiceChip
              label={c.showMembers}
              selected={entry.showMembers}
              onPress={() => {
                if (!busy)
                  onChange({
                    showMembers: !entry.showMembers,
                    groupMembers: !entry.showMembers ? (selectedGroup?.members ?? []) : [],
                  });
              }}
            />
            <ShowcaseHint>{c.groupMembersHint}</ShowcaseHint>
            <ShowcaseHeading>
              {c.requirements} {entry.groupName || entry.title}
            </ShowcaseHeading>
            <ShowcaseHint>{c.requirementsHint}</ShowcaseHint>
            <View style={showcaseStyles.split}>
              <View style={showcaseStyles.flex}>
                <Field
                  label={c.minAge}
                  value={entry.requirements?.minAge?.toString() ?? ''}
                  keyboardType="numeric"
                  editable={!busy}
                  maxLength={3}
                  onChangeText={(value) =>
                    changeRequirements({
                      minAge: value ? Number(value.replace(/[^0-9]/g, '')) : undefined,
                    })
                  }
                />
              </View>
              <View style={showcaseStyles.flex}>
                <Field
                  label={c.maxAge}
                  value={entry.requirements?.maxAge?.toString() ?? ''}
                  keyboardType="numeric"
                  editable={!busy}
                  maxLength={3}
                  onChangeText={(value) =>
                    changeRequirements({
                      maxAge: value ? Number(value.replace(/[^0-9]/g, '')) : undefined,
                    })
                  }
                />
              </View>
            </View>
            <Field
              label={c.memberType}
              value={entry.requirements?.memberType ?? ''}
              maxLength={120}
              editable={!busy}
              onChangeText={(memberType) =>
                changeRequirements({ memberType: memberType || undefined })
              }
            />
            <Field
              label={c.requirementsText}
              value={entry.requirements?.text ?? ''}
              maxLength={2000}
              multiline
              editable={!busy}
              onChangeText={(text) => changeRequirements({ text })}
            />
            <ShowcaseHeading>{c.requiredMeetup}</ShowcaseHeading>
            <View style={showcaseStyles.row}>
              <ChoiceChip
                label={c.none}
                selected={!entry.requirements?.meetupId}
                onPress={() => {
                  if (!busy) changeRequirements({ meetupId: undefined });
                }}
              />
              {pickers.requirementEvents
                .filter((event) => matches(event.title))
                .map((event) => (
                  <ChoiceChip
                    key={event.id}
                    label={event.title}
                    selected={entry.requirements?.meetupId === event.id}
                    onPress={() => {
                      if (!busy) changeRequirements({ meetupId: event.id });
                    }}
                  />
                ))}
            </View>
          </View>
        )}
        {media && (
          <Field
            label={c.caption}
            value={caption}
            onChangeText={setCaption}
            maxLength={2000}
            multiline
            editable={!busy}
          />
        )}
        {entry.media.map((item) => (
          <View key={item.id} style={showcaseStyles.section}>
            <Field
              label={c.caption}
              value={item.caption}
              onChangeText={(caption) =>
                onChange({
                  media: entry.media.map((media) =>
                    media.id === item.id ? { ...media, caption } : media,
                  ),
                })
              }
              maxLength={2000}
              multiline
              editable={!busy}
            />
            {item.url && item.status !== 'pending' && item.status !== 'rejected' && (
              <ChoiceChip
                label={coverMediaId === item.id ? c.coverSelected : c.useCover}
                selected={coverMediaId === item.id}
                onPress={() => {
                  if (!busy) onCover(coverMediaId === item.id ? null : item.id);
                }}
              />
            )}
            <Button
              label={c.remove}
              disabled={busy}
              variant="ghost"
              onPress={() => {
                if (coverMediaId === item.id) onCover(null);
                onChange({ media: entry.media.filter((media) => media.id !== item.id) });
              }}
            />
          </View>
        ))}
        {pickers.media.length > 0 && (
          <Button
            label={c.sourceMedia}
            disabled={busy}
            variant="ghost"
            onPress={() => setSourceOpen((value) => !value)}
          />
        )}
        {sourceOpen && (
          <View style={showcaseStyles.section}>
            <ShowcaseHint>{c.reuseHint}</ShowcaseHint>
            {pickers.media
              .filter((item) => !item.meetupId || entry.meetupIds.includes(item.meetupId))
              .map((item, index) => (
                <View key={item.id} style={showcaseStyles.section}>
                  <ShowcaseMediaView media={item} />
                  <ChoiceChip
                    label={item.caption || `${c.media} ${index + 1}`}
                    selected={entry.media.some(
                      (media) => media.sourceUploadId === (item.sourceUploadId ?? item.id),
                    )}
                    onPress={() => {
                      if (
                        entry.media.length < 12 ||
                        entry.media.some(
                          (media) => media.sourceUploadId === (item.sourceUploadId ?? item.id),
                        )
                      )
                        toggleSource(item);
                    }}
                  />
                </View>
              ))}
          </View>
        )}
        <View style={showcaseStyles.split}>
          <View style={showcaseStyles.flex}>
            <Button
              label={c.moveUp}
              variant="ghost"
              disabled={busy || index === 0}
              onPress={() => onMove(-1)}
            />
          </View>
          <View style={showcaseStyles.flex}>
            <Button
              label={c.moveDown}
              variant="ghost"
              disabled={busy || last}
              onPress={() => onMove(1)}
            />
          </View>
        </View>
        <Button
          label={c.removeEntry}
          variant="ghost"
          disabled={busy}
          icon="trash-outline"
          onPress={onRemove}
        />
      </AdvancedSection>
    </ShowcasePanel>
  );
}
