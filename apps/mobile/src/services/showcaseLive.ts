import { z } from 'zod';
import {
  showcaseSchema, showcaseSaveInputSchema, showcaseAudienceSchema, showcasePickersSchema,
  showcaseApprovalSchema, showcaseApprovalActionSchema, showcaseMediaSchema, showcaseMediaKindSchema,
  showcaseCaptionSchema, showcaseUploadReservationSchema, type Showcase, type ShowcaseMedia,
  type ShowcaseSaveInput, type ShowcaseApprovalAction, type ShowcaseAudience, type ShowcaseAudienceScope, validateShowcaseAudienceScope,
} from '@rummal/shared';
import { communityRpc, type CommunityRpc } from './communityLive';
import { supabase } from './supabase';
import { validateMemoryMedia } from './memoryWallTypes';
import type { ShowcaseApi } from './showcaseTypes';

export type ShowcaseTransport = {
  sign(media: ShowcaseMedia[]): Promise<ShowcaseMedia[]>;
  read(uri: string): Promise<ArrayBuffer>;
  upload(bucket: string, path: string, payload: ArrayBuffer, mimeType: string): Promise<void>;
};
const transport: ShowcaseTransport = {
  async sign(media) {
    const urls = new Map<string, string>();
    const approved = media.filter(item => item.status === undefined || item.status === 'approved');
    const buckets = [...new Set(approved.flatMap(item => item.bucket ? [item.bucket] : []))];
    if (supabase) for (const bucket of buckets) {
      const paths = [...new Set(approved.filter(item => item.bucket === bucket).flatMap(item => [item.storagePath, item.posterPath].filter((path): path is string => Boolean(path))))];
      if (!paths.length) continue;
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 300);
      if (!error) for (const row of data ?? []) if (!row.error && row.path && row.signedUrl) urls.set(`${bucket}:${row.path}`, row.signedUrl);
    }
    // RPC URLs are never trusted. Storage checks each current scoped grant again.
    return media.map(item => ({ ...item, url: (item.status === undefined || item.status === 'approved') && item.bucket && item.storagePath ? urls.get(`${item.bucket}:${item.storagePath}`) : undefined,
      posterUrl: (item.status === undefined || item.status === 'approved') && item.bucket && item.posterPath ? urls.get(`${item.bucket}:${item.posterPath}`) : undefined }));
  },
  async read(uri) { const response = await fetch(uri); if (!response.ok) throw new Error('media_read_failed'); return response.arrayBuffer(); },
  async upload(bucket, path, payload, mimeType) {
    if (!supabase) throw new Error('showcases_unavailable');
    const { error } = await supabase.storage.from(bucket).upload(path, payload, { contentType: mimeType, upsert: false, cacheControl: '0' });
    if (error) throw new Error(error.message);
  },
};
const id = (value: string) => z.uuid().parse(value);
const revision = (value: number) => z.number().int().min(1).parse(value);

export class LiveShowcaseApi implements ShowcaseApi {
  constructor(private readonly rpc: CommunityRpc = communityRpc, private readonly media: ShowcaseTransport = transport) {}
  private async signed(showcase: Showcase): Promise<Showcase> {
    const originals = showcase.entries.flatMap(entry => entry.media);
    const signed = z.array(showcaseMediaSchema).parse(await this.media.sign(originals));
    const byId = new Map(signed.map(item => [item.id, item]));
    return { ...showcase, entries: showcase.entries.map(entry => ({ ...entry, media: entry.media.map(item => ({
      ...item, url: byId.get(item.id)?.url, posterUrl: byId.get(item.id)?.posterUrl,
    })) })) };
  }
  private async one(raw: unknown, expectedId?: string) {
    const value = showcaseSchema.parse(raw);
    if (expectedId && value.id !== expectedId) throw new Error('invalid_showcase_response');
    return this.signed(value);
  }
  async listOwn() { return Promise.all(z.array(showcaseSchema).parse(await this.rpc('showcase_list_own')).map(value => this.signed(value))); }
  async listProfile(ownerId: string) {
    const values = z.array(showcaseSchema).parse(await this.rpc('showcase_list_profile', { p_owner_id: id(ownerId) }));
    if (values.some(value => value.ownerId !== ownerId || value.status !== 'published' || !value.audience || value.audience === 'no_one')) throw new Error('invalid_showcase_response');
    return Promise.all(values.map(value => this.signed(value)));
  }
  async get(showcaseId: string) { return this.one(await this.rpc('showcase_get', { p_id: id(showcaseId) }), showcaseId); }
  async save(input: ShowcaseSaveInput) {
    const parsed = showcaseSaveInputSchema.parse(input);
    for (const entry of parsed.entries) {
      if (entry.personId) id(entry.personId); if (entry.groupId) id(entry.groupId);
      entry.meetupIds.forEach(id);
      entry.albumIds.forEach(id);
      if (entry.requirements?.meetupId) id(entry.requirements.meetupId);
    }
    return this.one(await this.rpc('showcase_save', {
      p_id: parsed.id, p_expected_revision: parsed.expectedRevision, p_template: parsed.template,
      p_title: parsed.title, p_introduction: parsed.introduction, p_layout: parsed.layout,
      p_cover_media_id: parsed.coverMediaId, p_entries: parsed.entries,
    }), parsed.id ?? undefined);
  }
  async publish(showcaseId: string, audience: ShowcaseAudience, expectedRevision: number, scope: ShowcaseAudienceScope = {}) {
    const parsedAudience = showcaseAudienceSchema.parse(audience);
    const selected = validateShowcaseAudienceScope(parsedAudience, scope);
    if (selected.groupId) id(selected.groupId); selected.personIds.forEach(id);
    return this.one(await this.rpc('showcase_publish', { p_id: id(showcaseId), p_audience: parsedAudience, p_expected_revision: revision(expectedRevision),
      p_group_id: selected.groupId ?? null, p_person_ids: selected.personIds }), showcaseId);
  }
  async unpublish(showcaseId: string) { return this.one(await this.rpc('showcase_unpublish', { p_id: id(showcaseId) }), showcaseId); }
  async remove(showcaseId: string) { await this.rpc('showcase_delete', { p_id: id(showcaseId) }); }
  async reorder(ids: string[]) {
    const parsed = z.array(z.uuid()).max(50).parse(ids);
    if (new Set(parsed).size !== parsed.length) throw new Error('invalid_showcase_order');
    await this.rpc('showcase_reorder', { p_ids: parsed });
  }
  async pickers(personId?: string) {
    const value = showcasePickersSchema.parse(await this.rpc('showcase_pickers', { p_person_id: personId ? id(personId) : null }));
    const signed = await this.media.sign(value.media); const byId = new Map(signed.map(item => [item.id, item]));
    return { ...value, media: value.media.map(item => ({ ...item, url: byId.get(item.id)?.url, posterUrl: byId.get(item.id)?.posterUrl })) };
  }
  async setGroupMemberVisibility(groupId: string, visible: boolean) {
    await this.rpc('showcase_set_group_member_visibility', { p_group_id: id(groupId), p_visible: z.boolean().parse(visible) });
  }
  async listApprovals() {
    const approvals = z.array(showcaseApprovalSchema).parse(await this.rpc('showcase_list_approvals'));
    return Promise.all(approvals.map(async approval => {
      const media = await this.media.sign(approval.snapshot.media);
      return { ...approval, snapshot: { ...approval.snapshot, media } };
    }));
  }
  async respondApproval(approvalId: string, action: ShowcaseApprovalAction) {
    await this.rpc('showcase_respond_approval', { p_id: id(approvalId), p_action: showcaseApprovalActionSchema.parse(action) });
  }
  async upload(showcaseId: string, entryId: string, uri: string, kind: 'photo' | 'video', mimeType: string, caption: string) {
    id(showcaseId); id(entryId); const parsedKind = showcaseMediaKindSchema.parse(kind); const body = showcaseCaptionSchema.parse(caption);
    validateMemoryMedia(parsedKind, mimeType); const payload = await this.media.read(uri); validateMemoryMedia(parsedKind, mimeType, payload.byteLength);
    const reservation = showcaseUploadReservationSchema.parse(await this.rpc('showcase_reserve_media', { p_showcase_id: showcaseId, p_entry_id: entryId, p_kind: parsedKind, p_caption: body }));
    try { await this.media.upload(reservation.bucket, reservation.path, payload, mimeType); }
    catch (error) { await this.rpc('cancel_media_upload', { upload_id: reservation.id }).catch(() => undefined); throw error; }
  }
  async report(showcaseId: string, entryId?: string, notes = '') {
    await this.rpc('showcase_report', { p_showcase_id: id(showcaseId), p_entry_id: entryId ? id(entryId) : null, p_notes: z.string().trim().max(2000).parse(notes) });
  }
}
