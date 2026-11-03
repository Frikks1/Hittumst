import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { ShowcaseApproval, ShowcaseApprovalAction } from '@rummal/shared';
import { Button } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { showcaseApi } from '@/services/showcases';
import { showcaseCopy } from './copy';
import { AdvancedSection } from './AdvancedSection';
import { audienceDescription } from './AudiencePicker';
import {
  ShowcaseEntryView,
  ShowcaseHeading,
  ShowcaseHint,
  ShowcasePanel,
  showcaseStyles,
  useShowcaseSession,
} from './components';

export function ShowcaseApprovals() {
  const { user } = useApp();
  return <ApprovalSession key={user?.id} />;
}
function ApprovalSession() {
  const { locale } = useApp();
  const c = showcaseCopy(locale);
  const [items, setItems] = useState<ShowcaseApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef(false);
  const loadVersion = useRef(0);
  const reload = async () => {
    const version = ++loadVersion.current;
    const request = session.generation.current;
    setLoading(true);
    setError(false);
    try {
      const next = await showcaseApi.listApprovals();
      if (session.current(request) && version === loadVersion.current) setItems(next);
    } catch {
      if (session.current(request) && version === loadVersion.current) {
        setItems([]);
        setError(true);
      }
    } finally {
      if (session.current(request) && version === loadVersion.current) setLoading(false);
    }
  };
  const session = useShowcaseSession(
    () => {
      setBusy(operation.current);
      setItems([]);
      setNotice('');
      void reload();
    },
    () => setItems([]),
  );
  const respond = async (id: string, action: ShowcaseApprovalAction) => {
    if (operation.current || !session.active.current) return;
    operation.current = true;
    const request = session.generation.current;
    setBusy(true);
    setError(false);
    setNotice('');
    try {
      await showcaseApi.respondApproval(id, action);
      if (session.current(request)) {
        setNotice(c.approvalChanged);
        await reload();
      }
    } catch {
      if (session.current(request)) setError(true);
    } finally {
      operation.current = false;
      if (session.active.current) setBusy(false);
    }
  };
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  return (
    <ShowcasePanel>
      <AdvancedSection
        title={c.approvals}
        summary={
          loading ? c.loading : pendingCount ? `${pendingCount} ${c.permissionsWaiting}` : undefined
        }
      >
        <ShowcaseHint>{c.approvalsHint}</ShowcaseHint>
        {notice && <ShowcaseHint>{notice}</ShowcaseHint>}
        {session.visible &&
          items.map((item) => (
            <View key={item.id} style={showcaseStyles.section}>
              <ShowcaseHeading>{item.showcaseTitle}</ShowcaseHeading>
              <ShowcaseHint>
                {c.roles[item.role]} · {c.revision} {item.revision}
              </ShowcaseHint>
              {item.countOnly && <ShowcaseHint>{c.countOnly}</ShowcaseHint>}
              <ShowcaseHint>
                {c.audience}: {audienceDescription(item, locale)} · {c[item.status]}
              </ShowcaseHint>
              <ShowcaseEntryView entry={item.snapshot} />
              {item.status === 'pending' && (
                <View style={showcaseStyles.split}>
                  <View style={showcaseStyles.flex}>
                    <Button
                      label={c.approve}
                      loading={busy}
                      onPress={() => void respond(item.id, 'approve')}
                    />
                  </View>
                  <View style={showcaseStyles.flex}>
                    <Button
                      label={c.decline}
                      disabled={busy}
                      variant="secondary"
                      onPress={() => void respond(item.id, 'decline')}
                    />
                  </View>
                </View>
              )}
              {item.status === 'approved' && (
                <Button
                  label={c.revoke}
                  variant="secondary"
                  loading={busy}
                  onPress={() => void respond(item.id, 'revoke')}
                />
              )}
            </View>
          ))}
        {loading ? (
          <ShowcaseHint>{c.loading}</ShowcaseHint>
        ) : (
          !items.length && !error && <ShowcaseHint>{c.noApprovals}</ShowcaseHint>
        )}
        {error && <ShowcaseHint alert>{c.failed}</ShowcaseHint>}
        <Button
          label={error ? c.retry : c.refresh}
          variant="ghost"
          disabled={busy}
          onPress={() => void reload()}
        />
      </AdvancedSection>
    </ShowcasePanel>
  );
}
