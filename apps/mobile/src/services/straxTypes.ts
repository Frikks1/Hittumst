import type { StraxBadges, StraxCreateInput, StraxDetail, StraxList, StraxNotification, StraxRosterEntry, StraxShareInput, StraxShareResult, StraxSummary } from '@rummal/shared';

export interface StraxApi {
  list(): Promise<StraxList>;
  summary(): Promise<StraxSummary>;
  badges(profileIds: string[]): Promise<StraxBadges>;
  get(id: string): Promise<StraxDetail>;
  mine(): Promise<StraxDetail[]>;
  create(input: StraxCreateInput, requestId?: string): Promise<StraxDetail>;
  participate(id: string, introduction?: string, acknowledged?: boolean): Promise<StraxDetail>;
  leave(id: string): Promise<StraxDetail>;
  decide(id: string, profileId: string, action: 'approve' | 'decline' | 'remove'): Promise<StraxDetail>;
  close(id: string): Promise<StraxDetail>;
  roster(id: string): Promise<StraxRosterEntry[]>;
  notifications(limit?: number): Promise<StraxNotification[]>;
  share(id: string, input: StraxShareInput): Promise<StraxShareResult>;
  uploadPhoto(id: string, uri: string, mimeType?: string): Promise<void>;
  report(id: string, notes: string): Promise<void>;
}
