import { communityCoverSchema, type CommunityCover } from '@rummal/shared';
import { supabase } from './supabase';

/** Only paths returned by an authorized RPC are signed; Storage rechecks access. */
export async function signCommunityCovers(covers: (CommunityCover | null | undefined)[]): Promise<(CommunityCover | null)[]> {
  const parsed = covers.map(cover => cover ? communityCoverSchema.parse(cover) : null);
  const paths = [...new Set(parsed.flatMap(cover => cover ? [cover.storagePath, cover.posterPath].filter((path): path is string => Boolean(path)) : []))];
  if (!paths.length || !supabase) return parsed;
  const { data, error } = await supabase.storage.from('meetup-media').createSignedUrls(paths, 300);
  // A failed thumbnail must not hide the event or prevent joining.
  if (error) return parsed.map(cover => cover ? { ...cover, url: undefined, posterUrl: undefined } : null);
  const urls = new Map(data.flatMap(row => row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : []));
  return parsed.map(cover => cover ? {
    ...cover,
    url: cover.storagePath ? urls.get(cover.storagePath) : cover.url,
    posterUrl: cover.posterPath ? urls.get(cover.posterPath) : cover.posterUrl,
  } : null);
}
