import { useRef, useState } from 'react';
import { View, Switch } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import {
  showcaseTemplates,
  type Showcase,
  type ShowcasePickers,
  type ShowcaseTemplate,
} from '@rummal/shared';
import { Button, ChoiceChip, EmptyState, Screen } from '@/components/ui';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { showcaseApi } from '@/services/showcases';
import { showcaseCopy } from './copy';
import {
  ShowcaseCard,
  ShowcaseHeading,
  ShowcaseHint,
  ShowcasePanel,
  showcaseStyles,
  useShowcaseSession,
} from './components';
import { ShowcaseApprovals } from './Approvals';
import { AdvancedSection } from './AdvancedSection';
import {
  ShowcaseAudiencePicker,
  audienceDescription,
  type ShowcaseAudienceChoice,
} from './AudiencePicker';
import { moveItem } from './model';

const emptyPickers: ShowcasePickers = {
  events: [],
  friends: [],
  groups: [],
  media: [],
  requirementEvents: [],
  albums: [],
};
export function ShowcaseManager() {
  const { user } = useApp();
  return <ManagerSession key={user?.id} />;
}
function ManagerSession() {
  const { locale, theme } = useApp();
  const c = showcaseCopy(locale);
  const router = useRouter();
  const [items, setItems] = useState<Showcase[]>([]);
  const [pickers, setPickers] = useState<ShowcasePickers>(emptyPickers);
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<ShowcaseTemplate>('hittingar');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [choice, setChoice] = useState<ShowcaseAudienceChoice | null>(null);
  const operation = useRef(false);
  const loadVersion = useRef(0);
  const reload = async () => {
    const request = session.generation.current,
      version = ++loadVersion.current;
    setLoading(true);
    setError(false);
    try {
      const results = await Promise.allSettled([showcaseApi.listOwn(), showcaseApi.pickers()]);
      if (!session.current(request) || loadVersion.current !== version) return;
      const [list, choices] = results;
      setItems(list.status === 'fulfilled' ? list.value : []);
      setPickers(choices.status === 'fulfilled' ? choices.value : emptyPickers);
      setError(results.some((result) => result.status === 'rejected'));
    } catch {
      if (session.current(request) && loadVersion.current === version) {
        setItems([]);
        setPickers(emptyPickers);
        setError(true);
      }
    } finally {
      if (session.current(request) && loadVersion.current === version) setLoading(false);
    }
  };
  const session = useShowcaseSession(
    () => {
      setBusy(operation.current);
      setItems([]);
      setPickers(emptyPickers);
      void reload();
    },
    () => {
      setItems([]);
      setPickers(emptyPickers);
    },
  );
  const run = async (task: (request: number) => Promise<void>) => {
    if (operation.current || !session.active.current) return;
    operation.current = true;
    const request = session.generation.current;
    setBusy(true);
    setError(false);
    try {
      await task(request);
    } catch {
      if (session.current(request)) setError(true);
    } finally {
      operation.current = false;
      if (session.active.current) setBusy(false);
    }
  };
  const create = () =>
    run(async (request) => {
      const next = await showcaseApi.save({
        id: null,
        expectedRevision: 0,
        template,
        title: c.templates[template],
        introduction: '',
        layout: 'list',
        coverMediaId: null,
        entries: [],
      });
      if (session.current(request)) {
        setCreating(false);
        router.push(`/showcases/${next.id}?edit=1` as Href);
      }
    });
  const reorder = (index: number, direction: -1 | 1) =>
    run(async (request) => {
      const next = moveItem(items, index, direction);
      await showcaseApi.reorder(next.map((item) => item.id));
      if (session.current(request)) {
        setItems(next);
        await reload();
      }
    });
  const publishAudience = (item: Showcase) =>
    run(async (request) => {
      if (!choice) return;
      await showcaseApi.publish(item.id, choice.audience, item.revision, {
        groupId: choice.groupId,
        personIds: choice.personIds,
      });
      if (session.current(request)) {
        setAudienceId(null);
        setChoice(null);
        await reload();
      }
    });
  const setMemberVisibility = (groupId: string, visible: boolean) =>
    run(async (request) => {
      await showcaseApi.setGroupMemberVisibility(groupId, visible);
      if (session.current(request)) await reload();
    });
  return (
    <Screen back title={c.manage}>
      <View style={showcaseStyles.page}>
        <Button
          label={c.create}
          icon="add-circle-outline"
          disabled={busy}
          onPress={() => setCreating((value) => !value)}
        />
        {creating && (
          <ShowcasePanel>
            <ShowcaseHeading>{c.chooseTemplate}</ShowcaseHeading>
            <ShowcaseHint>{c.initialStory}</ShowcaseHint>
            <View style={showcaseStyles.row}>
              {showcaseTemplates.map((value) => (
                <ChoiceChip
                  key={value}
                  label={c.templates[value]}
                  selected={template === value}
                  onPress={() => {
                    if (!busy) setTemplate(value);
                  }}
                />
              ))}
            </View>
            <Button label={c.create} loading={busy} onPress={() => void create()} />
          </ShowcasePanel>
        )}
        {items.length > 1 && (
          <View style={showcaseStyles.row}>
            <Text style={{ color: theme.colors.text, flex: 1 }}>{c.reorder}</Text>
            <Switch
              accessibilityLabel={c.reorder}
              disabled={busy}
              value={reordering}
              onValueChange={setReordering}
              trackColor={{ true: theme.colors.accent }}
            />
          </View>
        )}
        {loading ? (
          <ShowcaseHint>{c.loading}</ShowcaseHint>
        ) : (
          !items.length &&
          !error && <EmptyState icon="albums-outline" title={c.empty} body={c.emptyHint} />
        )}
        {session.visible &&
          items.map((item, index) => (
            <View key={item.id} style={showcaseStyles.section}>
              <ShowcaseCard showcase={item} owner />
              <View style={[showcaseStyles.row, { paddingHorizontal: 10 }]}>
                <View style={{ flex: 1 }}>
                  <ShowcaseHint>{audienceDescription(item, locale, pickers)}</ShowcaseHint>
                </View>
                <Button
                  label={c.changeAudience}
                  variant="ghost"
                  disabled={busy || item.entries.length === 0}
                  onPress={() => {
                    setAudienceId(item.id);
                    setChoice(null);
                  }}
                />
              </View>
              {audienceId === item.id && (
                <ShowcasePanel>
                  <ShowcaseAudiencePicker
                    choice={choice}
                    onChange={setChoice}
                    pickers={pickers}
                    busy={busy}
                    onConfirm={() => void publishAudience(item)}
                    onCancel={() => setAudienceId(null)}
                  />
                </ShowcasePanel>
              )}
              {reordering && (
                <View style={showcaseStyles.split}>
                  <View style={showcaseStyles.flex}>
                    <Button
                      label={c.moveUp}
                      variant="ghost"
                      icon="arrow-up-outline"
                      disabled={busy || index === 0}
                      onPress={() => void reorder(index, -1)}
                    />
                  </View>
                  <View style={showcaseStyles.flex}>
                    <Button
                      label={c.moveDown}
                      variant="ghost"
                      icon="arrow-down-outline"
                      disabled={busy || index === items.length - 1}
                      onPress={() => void reorder(index, 1)}
                    />
                  </View>
                </View>
              )}
            </View>
          ))}
        {error && (
          <>
            <ShowcaseHint alert>{c.failed}</ShowcaseHint>
            <Button
              label={c.retry}
              variant="secondary"
              disabled={busy}
              onPress={() => void reload()}
            />
          </>
        )}
        <ShowcaseApprovals />
        <AdvancedSection title={c.advanced} disabled={busy}>
          <ShowcasePanel>
            <ShowcaseHeading>{c.groupVisibility}</ShowcaseHeading>
            <ShowcaseHint>{c.groupVisibilityHint}</ShowcaseHint>
            {pickers.groups.map((group) => (
              <View key={group.id} style={showcaseStyles.row}>
                <Text style={{ color: theme.colors.text, flex: 1 }}>{group.name}</Text>
                <ChoiceChip
                  label={group.memberVisible ? c.memberShown : c.memberHidden}
                  selected={group.memberVisible}
                  onPress={() => {
                    if (!busy) void setMemberVisibility(group.id, !group.memberVisible);
                  }}
                />
              </View>
            ))}
            {!pickers.groups.length && <ShowcaseHint>{c.noGroups}</ShowcaseHint>}
          </ShowcasePanel>
        </AdvancedSection>
      </View>
    </Screen>
  );
}
