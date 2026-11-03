import { describe, expect, it } from 'vitest';
import { sharedConversationInterests } from './chatStarters';

describe('shared conversation starters', () => {
  it('matches Unicode and case variations without duplicating interests', () => {
    expect(sharedConversationInterests({ interests: ['Music', 'café', 'Hiking'] }, { interests: ['music', 'Music', ' café ', 'Cinema', 'Hiking'] })).toEqual(['music', 'café', 'Hiking']);
  });
  it('does not invent common interests and limits suggestions', () => {
    expect(sharedConversationInterests({ interests: ['Art'] }, { interests: ['Gaming'] })).toEqual([]);
    expect(sharedConversationInterests({ interests: ['a', 'b', 'c', 'd'] }, { interests: ['a', 'b', 'c', 'd'] })).toEqual(['a', 'b', 'c']);
  });
});
