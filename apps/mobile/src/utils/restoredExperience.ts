/** Later experiments are kept in storage, but have no active app entry point. */
export function isParkedExperienceRoute(segments: readonly string[]): boolean {
  return segments[0] === 'appearance' || segments[0] === 'showcases'
    || segments[0] === 'hittingar' && (['strax', 'following', 'host', 'feedback'].includes(segments[1] ?? '')
      || ['memories', 'feedback'].includes(segments[2] ?? ''));
}
