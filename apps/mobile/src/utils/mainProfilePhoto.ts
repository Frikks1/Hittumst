export type MainProfilePhotoCandidate = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  position?: number;
  archivedAt?: string | null;
};

/** The public avatar is the approved, current cover; legacy extras remain private. */
export function selectMainProfilePhoto<T extends MainProfilePhotoCandidate>(profile: {
  photos: readonly T[];
  coverPhotoId?: string | null;
}): T | undefined {
  const approved = profile.photos.filter(photo => photo.status === 'approved' && !photo.archivedAt);
  return approved.find(photo => photo.id === profile.coverPhotoId)
    ?? [...approved].sort((first, second) => (first.position ?? Number.MAX_SAFE_INTEGER)
      - (second.position ?? Number.MAX_SAFE_INTEGER) || first.id.localeCompare(second.id))[0];
}

export function mainProfilePhotos<T extends MainProfilePhotoCandidate>(profile: {
  photos: readonly T[];
  coverPhotoId?: string | null;
}): T[] {
  const main = selectMainProfilePhoto(profile);
  return main ? [main] : [];
}
