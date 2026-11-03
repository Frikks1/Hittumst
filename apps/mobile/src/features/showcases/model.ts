import type { Showcase, ShowcaseEntry, ShowcaseTemplate, ShowcasePickers } from '@rummal/shared';

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}

export function defaultEntryKind(template: ShowcaseTemplate): ShowcaseEntry['kind'] {
  return template === 'hittingar'
    ? 'event'
    : template === 'people'
      ? 'person'
      : template === 'groups'
        ? 'group'
        : 'story';
}

export function newEntry(id: string, kind: ShowcaseEntry['kind']): ShowcaseEntry {
  return {
    id,
    kind,
    title: '',
    body: '',
    meetupIds: [],
    albumIds: [],
    albums: [],
    showMembers: kind === 'group',
    groupMembers: [],
    review: '',
    reviewIdentified: false,
    rating: null,
    showCount: false,
    verifiedCount: null,
    media: [],
    approvalStatus: 'draft',
    meetups: [],
    requirementMeetups: [],
    requirementsInformational: true,
  };
}

/** Remove derived disclosure state as soon as an entry is edited. */
export function patchEntry(entry: ShowcaseEntry, patch: Partial<ShowcaseEntry>): ShowcaseEntry {
  return { ...entry, ...patch, approvalStatus: 'draft', verifiedCount: null };
}

/** Refresh authorization-derived media without replacing text, captions, ordering,
 * or removals made in the unsaved draft. Newly selected media must be reauthorized. */
export function refreshDraftMedia(draft: Showcase, fresh: Showcase): Showcase {
  const serverEntries = new Map(fresh.entries.map((entry) => [entry.id, entry]));
  return {
    ...draft,
    entries: draft.entries.map((entry) => {
      const serverEntry = serverEntries.get(entry.id);
      const serverMedia = new Map((serverEntry?.media ?? []).map((media) => [media.id, media]));
      return {
        ...entry,
        albums: (serverEntry?.albums ?? []).filter((album) => entry.albumIds.includes(album.id)),
        groupMembers: entry.showMembers ? (serverEntry?.groupMembers ?? []) : [],
        meetups: (serverEntry?.meetups ?? []).filter((meetup) =>
          entry.meetupIds.includes(meetup.id),
        ),
        requirementMeetups: (serverEntry?.requirementMeetups ?? []).filter(
          (meetup) => meetup.id === entry.requirements?.meetupId,
        ),
        media: entry.media.map((media) => {
          const current = serverMedia.get(media.id);
          return {
            ...media,
            url: current?.url,
            posterUrl: current?.posterUrl,
            status: current?.status,
            bucket: current?.bucket,
            storagePath: current?.storagePath,
            posterPath: current?.posterPath,
          };
        }),
      };
    }),
  };
}

export function validForSave(showcase: Showcase): boolean {
  return (
    Boolean(showcase.title.trim()) &&
    showcase.entries.every((entry) => {
      const requirements = entry.requirements;
      return (
        (!entry.review.trim() || entry.reviewIdentified) &&
        (entry.kind !== 'person' || Boolean(entry.personId)) &&
        (entry.kind !== 'group' || Boolean(entry.groupId)) &&
        (entry.kind !== 'event' || entry.meetupIds.length > 0) &&
        (!requirements ||
          ((requirements.minAge === undefined ||
            (requirements.minAge >= 18 && requirements.minAge <= 120)) &&
            (requirements.maxAge === undefined ||
              (requirements.maxAge >= 18 && requirements.maxAge <= 120)) &&
            (requirements.minAge === undefined ||
              requirements.maxAge === undefined ||
              requirements.minAge <= requirements.maxAge)))
      );
    })
  );
}

export function selectedSharedMeetupMode(
  selected: string[],
  eligible: string[],
): 'none' | 'all' | 'choose' {
  if (!selected.length) return 'none';
  const ids = new Set(selected);
  return ids.size === eligible.length && eligible.every((id) => ids.has(id)) ? 'all' : 'choose';
}

export function showcaseAlbumRoute(
  album: ShowcaseEntry['albums'][number],
  owner: boolean,
): string | null {
  return owner ? `/albums/${album.id}` : album.shareId ? `/album-share/${album.shareId}` : null;
}

export function selectableAudiencePeople(pickers: ShowcasePickers, ownerId?: string) {
  return [
    ...new Map(
      [...pickers.friends, ...pickers.groups.flatMap((group) => group.members)]
        .filter((person) => person.id !== ownerId)
        .map((person) => [person.id, person]),
    ).values(),
  ];
}
