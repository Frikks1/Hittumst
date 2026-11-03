import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Screen } from '@/components/ui';
import { Text, TextInput } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { socialFeedApi } from '@/services/socialFeed';
import { FeedHeading, FeedHint, feedCopy, feedStyles, useFeedSession } from './components';

export function FeedCompose({ communityId }: { communityId?: string }) {
  const { user } = useApp();
  return <ComposeSession key={`${user?.id}:${communityId}`} communityId={communityId} />;
}
function ComposeSession({ communityId }: { communityId?: string }) {
  const { locale, theme, user } = useApp();
  const c = feedCopy(locale);
  const router = useRouter();
  const [body, setBody] = useState('');
  const [picture, setPicture] = useState<{ uri: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [name, setName] = useState(c.global);
  const requestId = useRef(Crypto.randomUUID());
  const operation = useRef(false);
  const draftKey = `hittumst.feed-draft.v1.${user?.id}.${communityId ?? 'global'}`;
  const session = useFeedSession(() => {
    setBusy(operation.current);
    const generation = session.generation.current;
    if (communityId)
      void socialFeedApi
        .community(communityId)
        .then((item) => {
          if (session.current(generation)) setName(item.name);
        })
        .catch(() => {
          if (session.current(generation)) setError(true);
        });
  });
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(draftKey)
      .then((value) => {
        if (!active || !value) return;
        try {
          const saved = JSON.parse(value) as Record<string, unknown>;
          if (typeof saved.body === 'string' && saved.body.length <= 2000) setBody(saved.body);
          if (typeof saved.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(saved.requestId))
            requestId.current = saved.requestId;
          if (typeof saved.postedId === 'string') setPostedId(saved.postedId);
          if (saved.picture && typeof saved.picture === 'object') {
            const image = saved.picture as Record<string, unknown>;
            if (typeof image.uri === 'string' && typeof image.mimeType === 'string')
              setPicture({ uri: image.uri, mimeType: image.mimeType });
          }
        } catch {
          /* Invalid drafts are ignored. */
        }
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady) return;
    const timeout = setTimeout(() => {
      void AsyncStorage.setItem(
        draftKey,
        JSON.stringify({ body, picture, requestId: requestId.current, postedId }),
      ).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timeout);
  }, [body, picture, postedId, draftReady, draftKey]);
  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const request = session.generation.current;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (!session.current(request) || result.canceled) return;
    const asset = result.assets[0];
    if (
      !asset ||
      (asset.fileSize && asset.fileSize > 10485760) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType ?? 'image/jpeg')
    ) {
      setError(true);
      return;
    }
    setPicture({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  };
  const publish = async () => {
    if (operation.current || !session.active.current || !body.trim() || !draftReady) return;
    operation.current = true;
    const generation = session.generation.current;
    setBusy(true);
    setError(false);
    try {
      const id =
        postedId ??
        (
          await socialFeedApi.publish({
            requestId: requestId.current,
            communityId: communityId ?? null,
            body,
          })
        ).id;
      if (!session.current(generation)) return;
      setPostedId(id);
      await AsyncStorage.setItem(
        draftKey,
        JSON.stringify({ body, picture, requestId: requestId.current, postedId: id }),
      );
      if (picture) await socialFeedApi.uploadImage(id, picture.uri, picture.mimeType);
      if (!session.current(generation)) return;
      await AsyncStorage.removeItem(draftKey);
      router.replace(`/samfelag/post/${id}` as Href);
    } catch {
      if (session.current(generation)) setError(true);
    } finally {
      operation.current = false;
      if (session.active.current) setBusy(false);
    }
  };
  return (
    <Screen back>
      <View style={feedStyles.gap}>
        <FeedHeading>{c.compose}</FeedHeading>
        <FeedHint>{name}</FeedHint>
        {session.visible && (
          <>
            <TextInput
              accessibilityLabel={c.compose}
              placeholder={c.placeholder}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={2000}
              editable={!busy && !postedId && draftReady}
              value={body}
              onChangeText={(value) => {
                setBody(value);
                requestId.current = Crypto.randomUUID();
              }}
              style={[
                feedStyles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            />
            <Text style={{ color: theme.colors.textMuted, alignSelf: 'flex-end' }}>
              {body.length}/2000
            </Text>
            {picture && (
              <Image
                source={{ uri: picture.uri }}
                style={{ width: '100%', aspectRatio: 1.8, borderRadius: 12 }}
                contentFit="contain"
                cachePolicy="none"
              />
            )}
            <Button
              label={picture ? c.removePicture : c.picture}
              variant="secondary"
              disabled={busy || Boolean(postedId)}
              onPress={() => (picture ? setPicture(null) : void pick())}
            />
            {error && <FeedHint error>{postedId && picture ? c.uploadError : c.error}</FeedHint>}
            <Button
              label={postedId && picture ? c.retry : c.publish}
              loading={busy}
              disabled={!body.trim() || !draftReady}
              onPress={() => void publish()}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
