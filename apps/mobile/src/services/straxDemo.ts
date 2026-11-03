import * as Crypto from 'expo-crypto';
import {
  STRAX_LIFETIME_MS, straxCreateInputSchema, straxDetailSchema, straxShareInputSchema, straxIsActive,
  type StraxCreate, type StraxCreateInput, type StraxDetail, type StraxMessageReference, type StraxNotification, type StraxRosterEntry, type StraxShareInput, type StraxShareResult,
} from '@rummal/shared';
import type { RummalApi } from './types';
import type { StraxApi } from './straxTypes';

export type DemoStraxSource = Pick<RummalApi, 'getOwnProfile'> & Partial<Pick<RummalApi, 'listBlocked' | 'listFriends' | 'listGroups' | 'sendGroupMessage'>> & {
  setDemoGroupStraxReference?: (messageId: string, reference: StraxMessageReference) => void;
  canViewDemoStraxHost?: (profileId: string) => boolean;
};
type Activity = StraxCreate & { id: string; host: StraxDetail['host']; createdAt: string; expiresAt: string; closed: boolean; photoPath: string | null; photoStatus: StraxDetail['photoStatus']; photoUrl?: string };
const clone = <T,>(value: T): T => structuredClone(value);
const iso = (value: number) => new Date(value).toISOString();
const singleton = new WeakMap<DemoStraxSource, DemoStraxApi>();
export function getDemoStraxApi(source: DemoStraxSource): DemoStraxApi {
  let result = singleton.get(source);
  if (!result) { result = new DemoStraxApi(source); singleton.set(source, result); }
  return result;
}

export class DemoStraxApi implements StraxApi {
  readonly activities = new Map<string, Activity>();
  readonly participants = new Map<string, Map<string, StraxRosterEntry>>();
  readonly reports: { activityId: string; reporterId: string; notes: string }[] = [];
  private delivered = new Set<string>();
  private deliveryMessageIds = new Map<string, string>();
  private requests = new Map<string, { id: string; input: string }>();
  private notices = new Map<string, StraxNotification[]>();
  constructor(private source: DemoStraxSource, private now: () => number = Date.now, seed = true) {
    if (seed) this.seed();
  }
  revokeBlock(a: string, b: string) {
    for (const item of this.activities.values()) {
      const affected = item.host.id === a ? b : item.host.id === b ? a : null;
      const row = affected ? this.participants.get(item.id)?.get(affected) : null;
      if (row && ['joined', 'pending'].includes(row.status)) { row.status = 'removed'; row.introduction = ''; row.updatedAt = iso(this.now()); }
    }
  }
  private seed() {
    const entries = [
      ['p-bjarni', 'Bjarni', 'Kaffi og spjall núna?', 'Ég er á kaffihúsi í miðbænum. Komdu í stutt spjall.', 'Miðbær Reykjavíkur', 'open', 3, 45, 'in_person'],
      ['p-elias', 'Elías', 'Vantar einn í leikjapartý', 'Við erum þrír á netinu. Sendu stutta umsókn og taktu þátt.', 'Á netinu · sendu mér skilaboð', 'application', 1, 170, 'online'],
      ['p-noa', 'Nóa', 'Stuttur göngutúr við sjóinn', 'Komdu með í rólegan göngutúr og fáðu ferskt loft.', 'Ægisíða', 'open', 4, 20, 'in_person'],
      ['p-salka', 'Salka', 'Einn drykkur eftir vinnu', 'Leitum að félaga í einn drykk og spjall.', 'Reykjavík', 'application', 1, 80, 'in_person'],
      ['p-kari', 'Kári', 'Gamalt leikjapartý', 'Þetta dæmi er útrunnið og hverfur úr listanum.', 'Á netinu', 'open', 2, 250, 'online'],
    ] as const;
    entries.forEach((entry, index) => {
      const [hostId, name, title, description, location, joinMode, capacity, minutes, venueMode] = entry;
      const id = `81000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const created = this.now() - minutes * 60_000;
      this.activities.set(id, { id, host: { id: hostId, displayName: name }, title, description, locationText: location, address: null,
        requirements: index === 1 ? 'Þú þarft að eiga leikinn og vera með hljóðnema.' : index === 3 ? 'Þátttakendur þurfa að uppfylla aldursskilyrði staðarins.' : null,
        joinMode, venueMode, spacesNeeded: capacity, createdAt: iso(created), expiresAt: iso(created + STRAX_LIFETIME_MS), closed: false, photoPath: null, photoStatus: 'none' });
      this.participants.set(id, new Map());
    });
    const full = this.participants.get('81000000-0000-4000-8000-000000000004')!;
    full.set('p-dagur', { profileId: 'p-dagur', displayName: 'Dagur', status: 'joined', introduction: 'Kem með.', createdAt: iso(this.now()), updatedAt: iso(this.now()) });
  }
  private async context() {
    const [viewer, blocked] = await Promise.all([this.source.getOwnProfile(), this.source.listBlocked?.() ?? Promise.resolve([])]);
    for (const person of blocked) this.revokeBlock(viewer.id, person.id);
    return { viewer, blocked: new Set(blocked.map(person => person.id)) };
  }
  private notify(item: Activity, recipient: string, kind: StraxNotification['kind']) {
    const row: StraxNotification = { id: Crypto.randomUUID(), activityId: item.id, title: item.title, kind, createdAt: iso(this.now()), readAt: null };
    this.notices.set(recipient, [row, ...(this.notices.get(recipient) ?? [])]);
  }
  private snapshot(item: Activity, viewerId: string): StraxDetail {
    const participant = this.participants.get(item.id)?.get(viewerId);
    const host = item.host.id === viewerId;
    const status = item.closed ? 'closed' as const : Date.parse(item.expiresAt) <= this.now() ? 'expired' as const : 'active' as const;
    const viewerState = host ? 'host' : participant?.status === 'joined' ? 'joined' : participant?.status === 'pending' ? 'pending' : participant && ['declined', 'removed'].includes(participant.status) ? 'declined' : 'none';
    const participantCount = [...(this.participants.get(item.id)?.values() ?? [])].filter(person => person.status === 'joined').length;
    const room = item.spacesNeeded === null || participantCount < item.spacesNeeded;
    const candidate = status === 'active' && !host && viewerState === 'none';
    return straxDetailSchema.parse({ ...item, ...(status !== 'active' ? { photoPath: null, photoStatus: 'none', photoUrl: undefined } : {}), status, participantCount, viewerState, serverNow: iso(this.now()),
      viewerCapabilities: { canJoin: candidate && item.joinMode === 'open' && room, canApply: candidate && item.joinMode === 'application' && room,
        canLeave: status === 'active' && viewerState === 'joined', canWithdraw: status === 'active' && viewerState === 'pending', canManage: host && status === 'active' } });
  }
  private async authorized(id: string, hostOnly = false, activeOnly = false) {
    const context = await this.context(); const item = this.activities.get(id);
    if (!item || context.blocked.has(item.host.id)) throw new Error('strax_unavailable');
    if (this.source.canViewDemoStraxHost?.(item.host.id) === false) throw new Error('strax_unavailable');
    if ((item.closed || Date.parse(item.expiresAt) <= this.now()) && item.host.id !== context.viewer.id && !this.participants.get(id)?.has(context.viewer.id)) throw new Error('strax_unavailable');
    if (hostOnly && item.host.id !== context.viewer.id) throw new Error('strax_host_required');
    if (activeOnly && (item.closed || Date.parse(item.expiresAt) <= this.now())) throw new Error('strax_expired');
    return { ...context, item };
  }
  async list() {
    const { viewer, blocked } = await this.context();
    const items = [...this.activities.values()].filter(item => !blocked.has(item.host.id) && this.source.canViewDemoStraxHost?.(item.host.id) !== false).map(item => this.snapshot(item, viewer.id))
      .filter(item => straxIsActive(item, this.now())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { items: clone(items), serverNow: iso(this.now()) };
  }
  async summary() {
    const { items, serverNow } = await this.list();
    return { count: items.length, nextExpiryAt: items.length ? iso(Math.min(...items.map(item => Date.parse(item.expiresAt)))) : null, serverNow };
  }
  async badges(profileIds: string[]) {
    const { items, serverNow } = await this.list(); const selected = new Set(profileIds);
    return { items: items.filter(item => selected.has(item.host.id)).map(item => ({ profileId: item.host.id, activityId: item.id, title: item.title, expiresAt: item.expiresAt })), serverNow };
  }
  async get(id: string) { const { item, viewer } = await this.authorized(id); return clone(this.snapshot(item, viewer.id)); }
  async mine() {
    const { viewer, blocked } = await this.context();
    return [...this.activities.values()].filter(item => !blocked.has(item.host.id) && item.host.id === viewer.id)
      .map(item => clone(this.snapshot(item, viewer.id)));
  }
  async create(input: StraxCreateInput, requestId?: string) {
    const parsed = straxCreateInputSchema.parse(input); const { viewer } = await this.context();
    const key = requestId ? `${viewer.id}:${requestId}` : null; const fingerprint = JSON.stringify(parsed);
    const existing = key ? this.requests.get(key) : undefined;
    if (existing) { if (existing.input !== fingerprint) throw new Error('strax_request_conflict'); return this.get(existing.id); }
    if (viewer.isHidden === true || this.source.canViewDemoStraxHost?.(viewer.id) === false) throw new Error('strax_host_unavailable');
    if ([...this.activities.values()].some(item => item.host.id === viewer.id && !item.closed && Date.parse(item.expiresAt) > this.now())) throw new Error('strax_active_limit');
    const id = Crypto.randomUUID(); const created = this.now();
    this.activities.set(id, { ...parsed, id, host: { id: viewer.id, displayName: viewer.displayName }, createdAt: iso(created), expiresAt: iso(created + STRAX_LIFETIME_MS), closed: false, photoPath: null, photoStatus: 'none' });
    this.participants.set(id, new Map()); if (key) this.requests.set(key, { id, input: fingerprint });
    return this.get(id);
  }
  async participate(id: string, introduction = '', acknowledged = false) {
    const { item, viewer } = await this.authorized(id, false, true);
    if (item.host.id === viewer.id) throw new Error('strax_host_cannot_join');
    const state = this.snapshot(item, viewer.id); const rows = this.participants.get(id)!;
    if (state.viewerState === 'joined' || state.viewerState === 'pending') return state;
    if (state.viewerState === 'declined') throw new Error('strax_participation_unavailable');
    if (item.requirements && !acknowledged) throw new Error('strax_requirements_acknowledgement_required');
    if (item.spacesNeeded !== null && state.participantCount >= item.spacesNeeded) throw new Error('strax_full');
    const note = introduction.trim();
    if (note.length > 1000) throw new Error('strax_introduction_too_long');
    rows.set(viewer.id, { profileId: viewer.id, displayName: viewer.displayName, introduction: note, status: item.joinMode === 'open' ? 'joined' : 'pending', createdAt: iso(this.now()), updatedAt: iso(this.now()) });
    this.notify(item, item.host.id, item.joinMode === 'open' ? 'joined' : 'application_received');
    return this.get(id);
  }
  async leave(id: string) {
    const { viewer } = await this.authorized(id, false, true); const own = this.participants.get(id)?.get(viewer.id);
    if (own && ['left', 'withdrawn'].includes(own.status)) return this.get(id);
    if (!own || !['pending', 'joined'].includes(own.status)) throw new Error('strax_participation_unavailable');
    own.status = own.status === 'pending' ? 'withdrawn' : 'left'; own.updatedAt = iso(this.now()); return this.get(id);
  }
  async decide(id: string, profileId: string, action: 'approve' | 'decline' | 'remove') {
    const { item, blocked } = await this.authorized(id, true, true); const row = this.participants.get(id)?.get(profileId);
    if (!row || blocked.has(profileId)) throw new Error('strax_participation_unavailable');
    const nextStatus = action === 'approve' ? 'joined' : action === 'decline' ? 'declined' : 'removed';
    if (row.status === nextStatus) return this.get(id);
    if (action === 'approve') {
      if (row.status !== 'pending') throw new Error('strax_application_unavailable');
      const count = [...this.participants.get(id)!.values()].filter(person => person.status === 'joined').length;
      if (item.spacesNeeded !== null && count >= item.spacesNeeded) throw new Error('strax_full');
      row.status = 'joined';
    } else if (action === 'decline') { if (row.status !== 'pending') throw new Error('strax_application_unavailable'); row.status = 'declined'; }
    else { if (row.status !== 'joined') throw new Error('strax_participation_unavailable'); row.status = 'removed'; }
    row.updatedAt = iso(this.now()); this.notify(item, profileId, action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'removed'); return this.get(id);
  }
  async close(id: string) { const { item } = await this.authorized(id, true); if (item.closed) return this.get(id); if (Date.parse(item.expiresAt) <= this.now()) throw new Error('strax_expired'); item.closed = true; for (const row of this.participants.get(id)?.values() ?? []) if (['joined', 'pending'].includes(row.status)) this.notify(item, row.profileId, 'closed'); return this.get(id); }
  async roster(id: string) { const { blocked } = await this.authorized(id, true); return clone([...(this.participants.get(id)?.values() ?? [])].filter(row => !blocked.has(row.profileId))); }
  async notifications(limit = 50) { const { viewer, blocked } = await this.context(); return clone((this.notices.get(viewer.id) ?? []).filter(row => { const item = this.activities.get(row.activityId); return item && !blocked.has(item.host.id) && Date.parse(item.expiresAt) > this.now(); }).slice(0, Math.max(1, Math.min(100, Math.floor(limit))))); }
  async share(id: string, input: StraxShareInput): Promise<StraxShareResult> {
    const { item, blocked } = await this.authorized(id, true, true); const parsed = straxShareInputSchema.parse(input);
    const [friends, groups] = await Promise.all([this.source.listFriends?.() ?? Promise.resolve([]), this.source.listGroups?.() ?? Promise.resolve([])]);
    const accepted = new Set(friends.filter(friend => friend.status === 'accepted').map(friend => friend.profileId));
    const friendIds = new Set([...parsed.friendIds, ...(parsed.allFriends ? [...accepted] : [])]);
    const result: StraxShareResult = { sent: [], failed: [] };
    for (const [type, ids] of [['friend', [...friendIds]], ['group', [...new Set(parsed.groupIds)]]] as const) {
      for (const target of ids) {
        const key = `${id}:${type}:${target}`;
        if (this.delivered.has(key)) { result.sent.push({ type, id: target }); continue; }
        const group = groups.find(group => group.id === target);
        const allowed = type === 'friend' ? accepted.has(target) && !blocked.has(target) : group && group.membershipStatus !== 'invited' && group.status !== 'locked';
        if (!allowed) { result.failed.push({ type, id: target, reason: type === 'friend' ? 'friend_unavailable' : 'group_unavailable' }); continue; }
        try {
          if (type === 'group' && this.source.sendGroupMessage) {
            let messageId = this.deliveryMessageIds.get(key);
            if (!messageId) { messageId = Crypto.randomUUID(); this.deliveryMessageIds.set(key, messageId); }
            const message = await this.source.sendGroupMessage(target, `Strax · ${item.title}`, messageId);
            message.strax = { id, title: item.title, expiresAt: item.expiresAt };
            this.source.setDemoGroupStraxReference?.(message.id, message.strax);
          }
          if (type === 'friend') this.notify(item, target, 'invited');
          this.delivered.add(key); result.sent.push({ type, id: target });
        } catch { result.failed.push({ type, id: target, reason: 'share_failed' }); }
      }
    }
    return result;
  }
  async uploadPhoto(id: string, uri: string, mimeType = 'image/jpeg') {
    const { item } = await this.authorized(id, true, true);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('invalid_media_type');
    if (item.photoStatus !== 'none' && item.photoStatus !== 'rejected') throw new Error('strax_photo_limit');
    item.photoPath = `${id}/${Crypto.randomUUID()}.jpg`; item.photoStatus = 'approved'; item.photoUrl = uri;
  }
  async report(id: string, notes: string) { const { viewer } = await this.authorized(id); if (notes.length > 2000) throw new Error('invalid_report'); this.reports.push({ activityId: id, reporterId: viewer.id, notes: notes.trim() }); }
}
