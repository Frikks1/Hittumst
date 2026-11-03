import { describe, expect, it } from 'vitest';
import { emptyOnboardingDraft, parseOnboardingDraft, resumedOnboardingStep } from './onboardingDraft';

describe('recoverable onboarding fields', () => {
  it('drops old consent flags and revisits current consent before submission', () => {
    const restored = parseOnboardingDraft({ ...emptyOnboardingDraft(), step: 4, dob: '1990-01-01',
      displayName: 'Ari', identity: ['queer'], lookingFor: ['friends'], termsAccepted: true,
      privacyAccepted: true, guidelinesAccepted: true, sensitiveDataConsent: true });
    expect(restored).toMatchObject({ displayName: 'Ari', dob: '1990-01-01', identity: ['queer'] });
    expect(resumedOnboardingStep(restored!)).toBe(2);
    expect(Object.keys(restored!)).not.toContain('termsAccepted');
    expect(Object.keys(restored!)).not.toContain('sensitiveDataConsent');
  });
  it('rejects unsupported versions and bounds corrupt saved form fields', () => {
    expect(parseOnboardingDraft({ version: 0 })).toBeNull();
    const restored = parseOnboardingDraft({ version: 1, step: 999, region: 'secret', dob: 'bad',
      identity: ['queer', 'fake', 'queer'], lookingFor: ['friends', 'fake'],
      displayName: 'a'.repeat(100), socials: [{ platform: 'fake', handle: 'x' }] });
    expect(restored).toMatchObject({ step: 4, region: 'capital', dob: '', identity: ['queer'], lookingFor: ['friends'], socials: [] });
    expect(restored!.displayName).toHaveLength(50);
  });
});
