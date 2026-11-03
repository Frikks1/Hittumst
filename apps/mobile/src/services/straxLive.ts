import { z } from 'zod';
import {
  straxBadgesSchema, straxCreateInputSchema, straxDetailSchema, straxListSchema, straxRosterEntrySchema,
  straxShareInputSchema, straxShareResultSchema, straxSummarySchema, straxNotificationSchema,
  type StraxCreateInput, type StraxDetail, type StraxShareInput,
} from '@rummal/shared';
import { supabase } from './supabase';
import { queueMediaUpload } from './mediaUpload';
import type { StraxApi } from './straxTypes';

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
const defaultRpc: Rpc = async (name, args) => {
  if (!supabase) throw new Error('strax_unavailable');
  const client = supabase as unknown as { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> };
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
};
type PhotoSigner = (items: StraxDetail[]) => Promise<StraxDetail[]>;
export async function signStraxPhotos(items: StraxDetail[]): Promise<StraxDetail[]> {
  if (!supabase) return items;
  const started = performance.now();
  const photos = items.filter(item => item.status === 'active' && item.photoStatus === 'approved' && item.photoPath && Date.parse(item.expiresAt) > Date.parse(item.serverNow));
  if (!photos.length) return items.map(item => { const { photoUrl: _staleUrl, ...text } = item; return text; });
  const urls = new Map<string, string>();
  try {
    const original = await supabase.auth.getSession();
    const session = original.data.session;
    if (!original.error && session) {
      for (let index = 0; index < photos.length; index += 40) {
        const selected = photos.slice(index, index + 40); const permitted = new Set(selected.map(item => item.id));
        const result = await supabase.functions.invoke('strax-media', { body: { activityIds: [...permitted] }, headers: { Authorization: `Bearer ${session.access_token}` } });
        if (result.error) continue;
        const parsed = z.object({ photos: z.array(z.object({ activityId: z.string(), url: z.url() })) }).parse(result.data);
        for (const photo of parsed.photos) if (permitted.has(photo.activityId)) urls.set(photo.activityId, photo.url);
      }
      const current = await supabase.auth.getSession();
      if (current.error || current.data.session?.user.id !== session.user.id) urls.clear();
    }
  } catch { /* Text remains available while optional photo signing is unavailable. */ }
  const elapsed = Math.max(0, Math.floor(performance.now() - started));
  return items.map(item => { const { photoUrl: _staleUrl, ...text } = item;
    const serverNow = elapsed ? new Date(Date.parse(item.serverNow) + elapsed).toISOString() : item.serverNow;
    return { ...text, serverNow, ...(item.status === 'active' && Date.parse(item.expiresAt) > Date.parse(serverNow) && urls.has(item.id) ? { photoUrl: urls.get(item.id) } : {}) };
  });
}

export class LiveStraxApi implements StraxApi {
  constructor(private rpc: Rpc = defaultRpc, private sign: PhotoSigner = signStraxPhotos) {}
  private async call(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const started = performance.now(); const value = await this.rpc(name, args);
    const elapsed = Math.max(0, Math.floor(performance.now() - started));
    const age = (entry: unknown): unknown => {
      if (Array.isArray(entry)) return entry.map(age);
      if (!entry || typeof entry !== 'object') return entry;
      const row = entry as Record<string, unknown>;
      return { ...row, ...(typeof row.serverNow === 'string' && elapsed ? { serverNow: new Date(Date.parse(row.serverNow) + elapsed).toISOString() } : {}), ...(Array.isArray(row.items) ? { items: row.items.map(age) } : {}) };
    };
    return age(value);
  }
  private async detail(value: unknown) { return (await this.sign([straxDetailSchema.parse(value)]))[0]!; }
  async list() { const value = straxListSchema.parse(await this.call('strax_discover')); const started = performance.now(); const items = await this.sign(value.items); return { ...value, items, serverNow: new Date(Date.parse(value.serverNow) + Math.max(0, Math.floor(performance.now() - started))).toISOString() }; }
  async summary() { return straxSummarySchema.parse(await this.call('strax_count')); }
  async badges(profileIds: string[]) { return straxBadgesSchema.parse(await this.call('strax_profile_badges', { p_profile_ids: [...new Set(profileIds)] })); }
  async get(id: string) { return this.detail(await this.call('strax_get', { p_id: id })); }
  async mine() { return this.sign(z.array(straxDetailSchema).parse(await this.call('strax_mine'))); }
  async create(input: StraxCreateInput, requestId?: string) {
    const parsed = straxCreateInputSchema.parse(input);
    return this.detail(await this.call('strax_create', { input: parsed, ...(requestId ? { p_request_id: z.uuid().parse(requestId) } : {}) }));
  }
  async participate(id: string, introduction = '', acknowledged = false) {
    const detail = await this.get(id);
    const note = z.string().trim().max(1000).parse(introduction);
    if (detail.requirements && !acknowledged) throw new Error('strax_requirements_acknowledgement_required');
    return this.detail(await this.call('strax_participate', { p_id: id, p_action: detail.joinMode === 'open' ? 'join' : 'apply', p_introduction: note, p_acknowledged: acknowledged }));
  }
  async leave(id: string) {
    const detail = await this.get(id);
    if (detail.viewerState === 'none') return detail; // Recover an acknowledged or unknown successful withdrawal.
    return this.detail(await this.call('strax_participate', { p_id: id, p_action: detail.viewerState === 'pending' ? 'withdraw' : 'leave', p_introduction: '', p_acknowledged: false }));
  }
  async decide(id: string, profileId: string, action: 'approve' | 'decline' | 'remove') {
    return this.detail(await this.call('strax_respond', { p_id: id, p_profile_id: profileId, p_action: z.enum(['approve', 'decline', 'remove']).parse(action) }));
  }
  async close(id: string) { return this.detail(await this.call('strax_close', { p_id: id })); }
  async roster(id: string) { return z.array(straxRosterEntrySchema).parse(await this.rpc('strax_roster', { p_id: id })); }
  async notifications(limit = 50) { return z.array(straxNotificationSchema).parse(await this.rpc('strax_notifications', { p_limit: Math.max(1, Math.min(100, Math.floor(limit))) })); }
  async share(id: string, input: StraxShareInput) {
    const parsed = straxShareInputSchema.parse(input);
    return straxShareResultSchema.parse(await this.rpc('strax_share', { p_id: id, p_all_friends: parsed.allFriends, p_friend_ids: [...new Set(parsed.friendIds)], p_group_ids: [...new Set(parsed.groupIds)] }));
  }
  async uploadPhoto(id: string, uri: string, mimeType = 'image/jpeg') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('invalid_media_type');
    await queueMediaUpload('strax', id, uri, 'image', mimeType);
  }
  async report(id: string, notes: string) {
    await this.rpc('strax_report', { p_id: id, p_category: 'other', p_details: z.string().trim().max(2000).parse(notes) });
  }
}
