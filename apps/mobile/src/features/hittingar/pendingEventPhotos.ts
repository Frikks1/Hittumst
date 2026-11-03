import type { MeetupMediaUpload } from '@/services/types';

export const MAX_CREATION_PHOTOS = 3;
export const MAX_EVENT_MEDIA_BYTES = 50 * 1024 * 1024;

export type PendingEventMedia = {
  uri: string;
  kind: 'photo' | 'video';
  mimeType: string;
  isCover?: boolean;
};

type SelectedPhoto = { uri: string; type?: string | null; mimeType?: string | null; fileSize?: number };

export function pendingCreationUploads(approvedIds: readonly string[], uploads: readonly MeetupMediaUpload[]): MeetupMediaUpload[] {
  const seen = new Set(approvedIds);
  return uploads.filter(upload => {
    if (!['reserved', 'processing', 'appealed'].includes(upload.status) || seen.has(upload.id)) return false;
    seen.add(upload.id);
    return true;
  });
}

export function appendCreationPhotos(
  pending: readonly PendingEventMedia[],
  savedCount: number,
  selected: readonly SelectedPhoto[],
  hasSavedCover = false,
): PendingEventMedia[] {
  const limit = Math.max(0, MAX_CREATION_PHOTOS - savedCount);
  const current = pending.filter(item => item.kind === 'photo').slice(0, limit);
  const photos = selected.filter(asset => asset.type !== 'video').slice(0, limit - current.length);
  if (photos.some(asset => (asset.fileSize ?? 0) > MAX_EVENT_MEDIA_BYTES)) throw new Error('media_size');
  const next: PendingEventMedia[] = [
    ...current,
    ...photos.map(asset => ({ uri: asset.uri, kind: 'photo' as const, mimeType: asset.mimeType ?? 'image/jpeg' })),
  ];
  const firstNewIndex = current.length;
  if (!hasSavedCover && !next.some(item => item.isCover) && next[firstNewIndex]) {
    next[firstNewIndex] = { ...next[firstNewIndex], isCover: true };
  }
  return next;
}
