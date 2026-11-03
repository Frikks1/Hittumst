import { describe, expect, it } from 'vitest';
import { mainProfilePhotos, selectMainProfilePhoto } from './mainProfilePhoto';

describe('one main profile photo', () => {
  const photos = [
    { id: 'a', position: 1, status: 'approved' as const },
    { id: 'b', position: 2, status: 'approved' as const },
    { id: 'c', position: 3, status: 'pending' as const },
    { id: 'd', position: 4, status: 'rejected' as const },
  ];
  it('selects an approved cover before legacy position', () => {
    expect(mainProfilePhotos({ photos, coverPhotoId: 'b' })).toEqual([photos[1]]);
  });
  it.each(['missing', 'c', 'd'])('falls back when cover %s is unavailable', coverPhotoId => {
    expect(selectMainProfilePhoto({ photos, coverPhotoId })).toBe(photos[0]);
  });
  it('never promotes archived extras, including a stale cover', () => {
    expect(mainProfilePhotos({ photos: photos.map(photo => ({ ...photo, archivedAt: '2026-10-14' })), coverPhotoId: 'a' })).toEqual([]);
  });
  it('keeps the current picture visible during pending or rejected replacement', () => {
    expect(mainProfilePhotos({ photos })).toEqual([photos[0]]);
    expect(mainProfilePhotos({ photos: [...photos].reverse() })).toEqual([photos[0]]);
  });
  it('uses stable IDs to resolve equal or missing positions without mutating inputs', () => {
    const candidates = [{ id: 'b', status: 'approved' as const }, { id: 'a', status: 'approved' as const }];
    expect(selectMainProfilePhoto({ photos: candidates })?.id).toBe('a');
    expect(candidates[0]?.id).toBe('b');
  });
});
