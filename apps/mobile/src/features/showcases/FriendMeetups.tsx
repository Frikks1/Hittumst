import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { ShowcaseEntry, ShowcasePickers } from '@rummal/shared';
import { Button, ChoiceChip } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { showcaseApi } from '@/services/showcases';
import { showcaseCopy } from './copy';
import { ShowcaseHeading, ShowcaseHint, showcaseStyles } from './components';
import { selectedSharedMeetupMode } from './model';

export function FriendMeetups({
  entry,
  busy,
  onChange,
  query = '',
}: {
  entry: ShowcaseEntry;
  busy: boolean;
  query?: string;
  onChange: (patch: Partial<ShowcaseEntry>) => void;
}) {
  const { locale, user } = useApp();
  const c = showcaseCopy(locale);
  const [events, setEvents] = useState<ShowcasePickers['events']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<'none' | 'all' | 'choose'>(
    entry.meetupIds.length ? 'choose' : 'none',
  );
  const generation = useRef(0);
  const selections = useRef(entry.meetupIds);
  selections.current = entry.meetupIds;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else setAttempt((value) => value + 1);
      return () => {
        ++generation.current;
        setEvents([]);
      };
    }, [entry.personId, user?.id]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAttempt((value) => value + 1);
      else {
        ++generation.current;
        setEvents([]);
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    let active = true;
    setEvents([]);
    setError(false);
    setLoading(Boolean(entry.personId));
    if (entry.personId)
      void showcaseApi
        .pickers(entry.personId)
        .then((next) => {
          if (!active || generation.current !== request) return;
          setEvents(next.events);
          setMode(
            selectedSharedMeetupMode(
              selections.current,
              next.events.map((event) => event.id),
            ),
          );
        })
        .catch(() => {
          if (active && generation.current === request) setError(true);
        })
        .finally(() => {
          if (active && generation.current === request) setLoading(false);
        });
    return () => {
      active = false;
      ++generation.current;
    };
  }, [entry.personId, user?.id, attempt]);
  const select = (ids: string[]) =>
    onChange({
      meetupIds: ids,
      meetups: events
        .filter((event) => ids.includes(event.id))
        .map((event) => ({ id: event.id, title: event.title })),
    });
  return (
    <View style={showcaseStyles.section}>
      <ShowcaseHeading>{c.sharedMeetups}</ShowcaseHeading>
      <View style={showcaseStyles.row}>
        {(['none', 'all', 'choose'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={c.sharedModes[value]}
            selected={mode === value}
            onPress={() => {
              if (busy || loading || !entry.personId || (value !== 'none' && error)) return;
              setMode(value);
              if (value === 'none') select([]);
              else if (value === 'all') select(events.map((event) => event.id));
            }}
          />
        ))}
      </View>
      {loading && <ShowcaseHint>{c.loading}</ShowcaseHint>}
      {error && (
        <>
          <ShowcaseHint alert>{c.sharedFailed}</ShowcaseHint>
          <Button
            label={c.retry}
            variant="ghost"
            onPress={() => setAttempt((value) => value + 1)}
          />
        </>
      )}
      {!loading && !error && entry.personId && !events.length && (
        <ShowcaseHint>{c.noSharedMeetups}</ShowcaseHint>
      )}
      {mode === 'all' && <ShowcaseHint>{c.sharedAllHint}</ShowcaseHint>}
      {mode === 'choose' && !error && (
        <View style={showcaseStyles.row}>
          {events
            .filter(
              (event) =>
                !query.trim() ||
                event.title.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
            )
            .map((event) => (
              <ChoiceChip
                key={event.id}
                label={event.title}
                selected={entry.meetupIds.includes(event.id)}
                onPress={() => {
                  if (!busy)
                    select(
                      entry.meetupIds.includes(event.id)
                        ? entry.meetupIds.filter((id) => id !== event.id)
                        : [...entry.meetupIds, event.id],
                    );
                }}
              />
            ))}
        </View>
      )}
      {!loading &&
        !error &&
        entry.meetupIds.some((id) => !events.some((event) => event.id === id)) && (
          <ShowcaseHint alert>{c.sharedUnavailable}</ShowcaseHint>
        )}
    </View>
  );
}
