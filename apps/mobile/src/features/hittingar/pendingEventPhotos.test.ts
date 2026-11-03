import { describe, expect, it } from 'vitest';
import { appendCreationPhotos, MAX_EVENT_MEDIA_BYTES, pendingCreationUploads, type PendingEventMedia } from './pendingEventPhotos';
import type { MeetupMediaUpload } from '@/services/types';

const photo = (uri: string): PendingEventMedia => ({ uri, kind: 'photo', mimeType: 'image/jpeg' });

describe('Hittingur creation photo selection', () => {
  it('enforces the shared three-photo limit even if the picker returns extra assets', () => {
    const items = appendCreationPhotos([photo('pending')], 1, [
      { uri: 'first' }, { uri: 'second' }, { uri: 'third' },
    ]);
    expect(items.map(item => item.uri)).toEqual(['pending', 'first']);
    expect(items[1]?.isCover).toBe(true);
    expect(appendCreationPhotos(items, 1, [{ uri: 'overflow' }])).toEqual(items);
  });

  it('accepts only photos and automatically selects the first photo as the cover', () => {
    expect(appendCreationPhotos([], 0, [{ uri: 'video', type: 'video' }, { uri: 'photo', type: 'image' }]))
      .toEqual([{ ...photo('photo'), isCover: true }]);
  });

  it('preserves a selected pending or saved cover when adding more photos', () => {
    const current = [{ ...photo('chosen'), isCover: true }];
    expect(appendCreationPhotos(current, 0, [{ uri: 'new' }])).toEqual([...current, photo('new')]);
    expect(appendCreationPhotos([], 1, [{ uri: 'new' }], true)).toEqual([photo('new')]);
  });

  it('rejects oversized photos before they can enter the creation draft', () => {
    expect(() => appendCreationPhotos([], 0, [{ uri: 'huge', fileSize: MAX_EVENT_MEDIA_BYTES + 1 }]))
      .toThrow('media_size');
  });

  it('counts unapproved uploads when reopening a saved draft and excludes rejected or removed media', () => {
    const receipt = (id: string, status: MeetupMediaUpload['status']): MeetupMediaUpload => ({ id, status, createdAt: '2026-10-14T12:00:00Z', reason: null });
    const uploads = [receipt('first', 'reserved'), receipt('second', 'processing'), receipt('third', 'appealed'), receipt('rejected', 'rejected'), receipt('removed', 'approved')];
    const waiting = pendingCreationUploads([], uploads);
    expect(waiting.map(upload => upload.id)).toEqual(['first', 'second', 'third']);
    expect(appendCreationPhotos([], waiting.length, [{ uri: 'overflow' }])).toEqual([]);
  });

  it('deduplicates an upload that becomes approved between receipts and media reads', () => {
    const receipt: MeetupMediaUpload = { id: 'approved', status: 'processing', createdAt: '2026-10-14T12:00:00Z', reason: null };
    expect(pendingCreationUploads(['approved'], [receipt])).toEqual([]);
    expect(pendingCreationUploads([], [receipt, receipt])).toEqual([receipt]);
  });
});
