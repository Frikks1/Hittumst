import { describe, expect, it } from 'vitest';
import { toggleProfileIdentity } from './profileExtras';

describe('orientation disclosure choices', () => {
  it('replaces disclosed choices with either privacy choice', () => {
    expect(toggleProfileIdentity('prefer_not_to_say', ['gay', 'queer'])).toEqual(['prefer_not_to_say']);
    expect(toggleProfileIdentity('not_applicable', ['bi'])).toEqual(['not_applicable']);
  });

  it('switches between privacy choices without selecting both', () => {
    expect(toggleProfileIdentity('not_applicable', ['prefer_not_to_say'])).toEqual(['not_applicable']);
  });

  it('clears a privacy choice when someone chooses an orientation', () => {
    expect(toggleProfileIdentity('queer', ['prefer_not_to_say'])).toEqual(['queer']);
    expect(toggleProfileIdentity('bi', ['gay'])).toEqual(['gay', 'bi']);
  });

  it('lets someone deselect a choice', () => {
    expect(toggleProfileIdentity('prefer_not_to_say', ['prefer_not_to_say'])).toEqual([]);
  });
});
