import { View } from 'react-native';
import type { Showcase, ShowcaseApproval, ShowcasePickers } from '@rummal/shared';
import { Button, ChoiceChip } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { showcaseCopy } from './copy';
import { selectableAudiencePeople } from './model';
import { ShowcaseHeading, ShowcaseHint, showcaseStyles } from './components';

export type ShowcaseAudienceChoice = {
  audience: NonNullable<Showcase['audience']>;
  groupId?: string;
  personIds?: string[];
};
export function validAudienceChoice(choice: ShowcaseAudienceChoice | null): boolean {
  return Boolean(
    choice &&
      (choice.audience !== 'group' || choice.groupId) &&
      (choice.audience !== 'people' || choice.personIds?.length),
  );
}

export function audienceDescription(
  showcase: Pick<
    Showcase | ShowcaseApproval,
    'audience' | 'audienceGroupId' | 'audiencePersonIds' | 'audienceGroupName' | 'audiencePeople'
  >,
  locale: 'is' | 'en',
  pickers?: ShowcasePickers,
): string {
  const c = showcaseCopy(locale);
  if (!showcase.audience) return c.draft;
  if (showcase.audience === 'group')
    return `${c.audiences.group}: ${showcase.audienceGroupName || pickers?.groups.find((group) => group.id === showcase.audienceGroupId)?.name || c.group}`;
  if (showcase.audience === 'people') {
    const names = showcase.audiencePeople.length
      ? showcase.audiencePeople.map((person) => person.displayName)
      : showcase.audiencePersonIds.map(
          (id) =>
            pickers?.friends.find((person) => person.id === id)?.displayName ||
            pickers?.groups.flatMap((group) => group.members).find((person) => person.id === id)
              ?.displayName ||
            c.person,
        );
    return names.length ? `${c.audiences.people}: ${names.join(', ')}` : c.audiences.people;
  }
  return c.audiences[showcase.audience];
}

export function ShowcaseAudiencePicker({
  choice,
  onChange,
  pickers,
  busy,
  onConfirm,
  onCancel,
}: {
  choice: ShowcaseAudienceChoice | null;
  onChange: (choice: ShowcaseAudienceChoice) => void;
  pickers: ShowcasePickers;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { locale, user } = useApp();
  const c = showcaseCopy(locale);
  const people = selectableAudiencePeople(pickers, user?.id);
  const eligibleChoice =
    validAudienceChoice(choice) &&
    (choice?.audience !== 'group' || pickers.groups.some((group) => group.id === choice.groupId)) &&
    (choice?.audience !== 'people' ||
      (choice.personIds!.length <= 50 &&
        choice.personIds!.every((id) => people.some((person) => person.id === id))));
  return (
    <View style={showcaseStyles.section}>
      <ShowcaseHeading>{c.audience}</ShowcaseHeading>
      <View style={showcaseStyles.row}>
        {(['everyone', 'friends', 'no_one', 'group', 'people'] as const).map((audience) => (
          <ChoiceChip
            key={audience}
            label={c.audiences[audience]}
            selected={choice?.audience === audience}
            onPress={() => {
              if (!busy) onChange({ audience });
            }}
          />
        ))}
      </View>
      {choice?.audience === 'group' && (
        <View style={showcaseStyles.section}>
          <ShowcaseHint>{c.chooseAudienceGroup}</ShowcaseHint>
          <View style={showcaseStyles.row}>
            {pickers.groups.map((group) => (
              <ChoiceChip
                key={group.id}
                label={group.name}
                selected={choice.groupId === group.id}
                onPress={() => {
                  if (!busy) onChange({ audience: 'group', groupId: group.id });
                }}
              />
            ))}
          </View>
          {!pickers.groups.length && <ShowcaseHint>{c.noGroups}</ShowcaseHint>}
        </View>
      )}
      {choice?.audience === 'people' && (
        <View style={showcaseStyles.section}>
          <ShowcaseHint>
            {c.chooseAudiencePeople} ({choice.personIds?.length ?? 0}/50)
          </ShowcaseHint>
          <View style={showcaseStyles.row}>
            {people.map((person) => (
              <ChoiceChip
                key={person.id}
                label={person.displayName}
                selected={choice.personIds?.includes(person.id) ?? false}
                onPress={() => {
                  if (!busy)
                    onChange({
                      audience: 'people',
                      personIds: choice.personIds?.includes(person.id)
                        ? choice.personIds.filter((id) => id !== person.id)
                        : [...(choice.personIds ?? []), person.id],
                    });
                }}
              />
            ))}
          </View>
          {!people.length && <ShowcaseHint>{c.noFriends}</ShowcaseHint>}
        </View>
      )}
      <ShowcaseHint>{c.audienceHint}</ShowcaseHint>
      <Button
        label={c.publishConfirm}
        loading={busy}
        disabled={!eligibleChoice}
        onPress={onConfirm}
      />
      <Button label={c.cancel} variant="ghost" disabled={busy} onPress={onCancel} />
    </View>
  );
}
