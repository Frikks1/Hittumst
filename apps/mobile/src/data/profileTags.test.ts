import { describe, expect, it } from 'vitest';
import { profileTagById, profileTags } from './profileTags';

describe('profile tag catalog snapshot', () => {
  it('contains the complete four-category 2026-08-31 catalog', () => {
    expect(profileTags).toHaveLength(195);
    expect(profileTags.filter((tag) => tag.category === 'kinks')).toHaveLength(100);
    expect(profileTags.filter((tag) => tag.category === 'hobbies')).toHaveLength(29);
    expect(profileTags.filter((tag) => tag.category === 'personality')).toHaveLength(30);
    expect(profileTags.filter((tag) => tag.category === 'other')).toHaveLength(36);
  });

  it('preserves exact English labels while exposing stable ids', () => {
    expect(profileTagById.get('apres-ski')?.label).toBe('Apres ski');
    expect(profileTagById.get('condomsonly')?.label).toBe('Condomsonly');
    expect(profileTagById.get('t4t')?.label).toBe('T4T');
  });
});

