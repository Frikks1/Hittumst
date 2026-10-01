import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { groupMediaSchema, trainDetailSchema, trainPoolSchema, trainSchema, trainSettingsSchema, type TrainDetail, type TrainSettings } from '@rummal/shared';
import { communityRpc } from './communityLive';
import { runtimeEnv } from './env';
import { api } from './index';
import { supabase } from './supabase';
import { queueMediaUpload } from './mediaUpload';

const demo = new Map<string, TrainDetail>();
/** Read-only demo projection; wallet state stays in the same ledger as other commerce. */
export function demoTrainFinanceContext(id: string) {
  const state = demo.get(id);
  if (!state) throw new Error('train_unavailable');
  return { train: { id, role: state.train.role, public: state.train.visibility === 'public' }, meetupIds: state.plans.filter(plan => plan.going.includes('demo-me')).map(plan => plan.meetupId) };
}
export async function trainCommand(action: string, id: string | null = null, input: Record<string, unknown> = {}, scope: { accountId?: string; isCurrent?: () => boolean } = {}): Promise<unknown> {
  if (action === 'pool_deposit' && id) return api.walletCommand({ action: 'train_pool_deposit', trainId: id, amount: Number(input.amount), requestId: String(input.requestId) });
  if (action === 'pool_settings' && id) return api.walletCommand({ action: 'train_pool_settings', trainId: id, enabled: input.enabled === true, amountPerEvent: Number(input.amountPerEvent), monthlyCap: Number(input.monthlyCap), expectedHostBps: 2500, requestId: String(input.requestId) });
  if (!runtimeEnv.isDemo) {
    if (action !== 'location') return communityRpc('train_command', { action, group_id: id, input });
    const session = await supabase!.auth.getSession();
    const owner = session.data.session;
    if (session.error || !owner || (scope.accountId && owner.user.id !== scope.accountId) || scope.isCurrent?.() === false) throw new Error('account_changed');
    const client = supabase as unknown as { rpc(name: string, args: Record<string, unknown>): { setHeader(name: string, value: string): PromiseLike<{ data: unknown; error: { message: string } | null }> } };
    // A location fix belongs to the account that explicitly shared it, even if
    // Supabase refreshes or replaces the session before its request is sent.
    const result = await client.rpc('train_command', { action, group_id: id, input }).setHeader('Authorization', `Bearer ${owner.access_token}`);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  if (action === 'list') return [...demo.values()].map(value => value.train);
  if (action === 'create') {
    const settings = trainSettingsSchema.parse(input);
    const groupId = await api.createGroup(settings.name, settings.bio);
    demo.set(groupId, trainDetailSchema.parse({ train: { ...settings, id: groupId, role: 'owner', membershipStatus: 'active', status: 'active', memberCount: 1 }, plans: [], locations: [], pool: { enabled: false, amountPerEvent: 0, monthlyCap: 0, balance: 0, sandbox: true, allocations: [] } }));
    return groupId;
  }
  const state = id ? demo.get(id) : undefined;
  if (!state) throw new Error('train_unavailable');
  if (action === 'get') return structuredClone(state);
  if (action === 'update') state.train = { ...state.train, ...trainSettingsSchema.parse(input) };
  else if (action === 'recommend') {
    const event = await api.getMeetup(String(input.meetupId));
    if (!state.plans.some(p => p.meetupId === input.meetupId)) state.plans.push({ meetupId: event.id, title: event.title, note: String(input.note ?? ''), recommendedBy: 'demo-me', going: [], createdAt: new Date().toISOString() });
  } else if (action === 'going') {
    const plan = state.plans.find(p => p.meetupId === input.meetupId);
    if (!plan) throw new Error('plan_unavailable');
    plan.going = input.going ? [...new Set([...plan.going, 'demo-me'])] : plan.going.filter(x => x !== 'demo-me');
  } else if (action === 'stop_location') state.locations = [];
  else if (action === 'location') state.locations = [{ profileId: 'demo-me', displayName: 'You', latitude: Number(input.latitude), longitude: Number(input.longitude), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + Number(input.minutes) * 60000).toISOString() }];
  else throw new Error('unknown_train_action');
  return {};
}
export async function listTrains() { return z.array(trainSchema).parse(await trainCommand('list')); }
export async function getTrain(id: string) {
  const detail = trainDetailSchema.parse(await trainCommand('get', id));
  try {
    detail.pool = trainPoolSchema.parse(await api.walletCommand({ action: 'train_pool_info', trainId: id, requestId: Crypto.randomUUID() }));
  } catch {
    // Social features stay available during a commerce outage. Never display
    // the superseded test-unit balance as though it were a funded wallet pool.
    detail.pool = trainPoolSchema.parse({ available: false, enabled: false, amountPerEvent: 0, monthlyCap: 0, balance: 0, sandbox: true, allocations: [] });
  }
  return detail;
}
export async function createTrain(settings: TrainSettings) { return z.string().parse(await trainCommand('create', null, trainSettingsSchema.parse(settings))); }
export async function listGroupMedia(groupId: string) {
  if (runtimeEnv.isDemo) return [];
  const items = z.array(groupMediaSchema).parse(await communityRpc('group_media_list', { group_id: groupId }));
  if (!items.length) return items;
  const result = await supabase!.storage.from('message-images').createSignedUrls(items.map(item => item.path), 60);
  if (result.error) throw result.error;
  return items.map(item => ({ ...item, url: result.data.find(row => row.path === item.path)?.signedUrl ?? undefined }));
}
export type CameraRecipient = { id: string; name: string; type: 'group' | 'person' };
export async function sendCameraMedia(recipient: CameraRecipient, asset: { uri: string; type?: string | null; mimeType?: string | null; fileName?: string | null; duration?: number | null }, cover = false, isCurrent: () => boolean = () => true) {
  if (runtimeEnv.isDemo) throw new Error('media_requires_connected_backend');
  const session = await supabase!.auth.getSession();
  const accountId = session.data.session?.user.id;
  if (session.error || !accountId || !isCurrent()) throw new Error('authentication_required');
  if (asset.type === 'video' && asset.duration && asset.duration > 60000) throw new Error('media_duration_exceeded');
  const gif = asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.fileName ?? '');
  const kind = gif || asset.type === 'video' ? 'video' : 'image';
  const targetId = recipient.type === 'group' ? recipient.id : await api.startConversation(recipient.id);
  if (!isCurrent()) throw new Error('authentication_required');
  return queueMediaUpload(recipient.type === 'group' ? 'group' : kind === 'video' ? 'message_video' : 'message', targetId, asset.uri, kind, gif ? 'image/gif' : asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'), [], { cover, requestId: Crypto.randomUUID() }, { accountId, isCurrent });
}
