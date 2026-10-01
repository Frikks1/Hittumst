import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { allocateTrainPool, groupMediaSchema, trainDetailSchema, trainSchema, trainSettingsSchema, type TrainDetail, type TrainSettings } from '@rummal/shared';
import { communityRpc } from './communityLive';
import { runtimeEnv } from './env';
import { api } from './index';
import { supabase } from './supabase';
import { queueMediaUpload } from './mediaUpload';

const demo = new Map<string, TrainDetail>();
export async function trainCommand(action: string, id: string | null = null, input: Record<string, unknown> = {}): Promise<unknown> {
  if (!runtimeEnv.isDemo) return communityRpc('train_command', { action, group_id: id, input });
  if (action === 'list') return [...demo.values()].map(value => value.train);
  if (action === 'create') {
    const settings = trainSettingsSchema.parse(input);
    const groupId = await api.createGroup(settings.name, settings.bio);
    demo.set(groupId, { train: { ...settings, id: groupId, role: 'owner', membershipStatus: 'active', status: 'active', memberCount: 1 }, plans: [], locations: [], pool: { enabled: false, amountPerEvent: 0, monthlyCap: 0, balance: 0, sandbox: true, allocations: [] } });
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
  else if (action === 'pool_settings') state.pool = { ...state.pool, enabled: input.enabled === true, amountPerEvent: Number(input.amountPerEvent), monthlyCap: Number(input.monthlyCap) };
  else if (action === 'pool_deposit') state.pool.balance += Number(input.amount);
  else throw new Error('unknown_train_action');
  for (const plan of state.plans.filter(p => p.going.length > 0)) state.pool = allocateTrainPool(state.pool, plan.meetupId, state.pool.allocations.reduce((sum, a) => sum + a.amount, 0));
  return {};
}
export async function listTrains() { return z.array(trainSchema).parse(await trainCommand('list')); }
export async function getTrain(id: string) { return trainDetailSchema.parse(await trainCommand('get', id)); }
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
export async function sendCameraMedia(recipient: CameraRecipient, asset: { uri: string; type?: string | null; mimeType?: string | null }, cover = false) {
  if (runtimeEnv.isDemo) throw new Error('media_requires_connected_backend');
  const gif = asset.mimeType === 'image/gif';
  const kind = gif || asset.type === 'video' ? 'video' : 'image';
  const targetId = recipient.type === 'group' ? recipient.id : await api.startConversation(recipient.id);
  return queueMediaUpload(recipient.type === 'group' ? 'group' : kind === 'video' ? 'message_video' : 'message', targetId, asset.uri, kind, asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'), [], { cover, requestId: Crypto.randomUUID() });
}
