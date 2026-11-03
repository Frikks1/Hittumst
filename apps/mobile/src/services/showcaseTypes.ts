import type { Showcase, ShowcaseApproval, ShowcaseApprovalAction, ShowcaseSaveInput, ShowcasePickers, ShowcaseAudience, ShowcaseAudienceScope } from '@rummal/shared';

export interface ShowcaseApi {
  listOwn(): Promise<Showcase[]>;
  listProfile(ownerId: string): Promise<Showcase[]>;
  get(id: string): Promise<Showcase>;
  save(input: ShowcaseSaveInput): Promise<Showcase>;
  publish(id: string, audience: ShowcaseAudience, expectedRevision: number, scope?: ShowcaseAudienceScope): Promise<Showcase>;
  unpublish(id: string): Promise<Showcase>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  pickers(personId?: string): Promise<ShowcasePickers>;
  setGroupMemberVisibility(groupId: string, visible: boolean): Promise<void>;
  listApprovals(): Promise<ShowcaseApproval[]>;
  respondApproval(id: string, action: ShowcaseApprovalAction): Promise<void>;
  upload(showcaseId: string, entryId: string, uri: string, kind: 'photo' | 'video', mimeType: string, caption: string): Promise<void>;
  report(showcaseId: string, entryId?: string, notes?: string): Promise<void>;
}
