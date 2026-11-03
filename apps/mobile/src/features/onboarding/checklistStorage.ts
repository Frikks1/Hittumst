import AsyncStorage from '@react-native-async-storage/async-storage';
export type ChecklistStatus = { active: boolean; dismissed: boolean; conversationStarted: boolean };
export const emptyChecklist = (): ChecklistStatus => ({ active: false, dismissed: false, conversationStarted: false });
const keyFor = (accountId: string) => `rummal.onboarding-checklist.v1.${accountId}`;
const writes = new Map<string, Promise<unknown>>();
export async function getOnboardingChecklist(accountId: string): Promise<ChecklistStatus> {
  await writes.get(accountId)?.catch(() => undefined);
  return read(accountId);
}
async function read(accountId: string): Promise<ChecklistStatus> {
  const raw = await AsyncStorage.getItem(keyFor(accountId));
  try {
    const value = raw ? JSON.parse(raw) : {};
    return { active: value?.active === true, dismissed: value?.dismissed === true, conversationStarted: value?.conversationStarted === true };
  } catch { return emptyChecklist(); }
}
function update(accountId: string, patch: Partial<ChecklistStatus>): Promise<void> {
  const operation = (writes.get(accountId) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const current = await read(accountId);
    await AsyncStorage.setItem(keyFor(accountId), JSON.stringify({ ...current, ...patch }));
  });
  writes.set(accountId, operation);
  void operation.finally(() => { if (writes.get(accountId) === operation) writes.delete(accountId); }).catch(() => undefined);
  return operation;
}
export const startOnboardingChecklist = (accountId: string) => update(accountId, { active: true, dismissed: false });
export const dismissOnboardingChecklist = (accountId: string) => update(accountId, { dismissed: true });
export const markFirstConversationStarted = (accountId: string) => update(accountId, { conversationStarted: true });
