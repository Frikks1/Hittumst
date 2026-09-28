import { describe, expect, it } from 'vitest';
import { privateCrashEvent } from './crashPrivacy';
describe('private crash reports', () => {
  it('retains error class and offsets but drops content, identity and arbitrary fields', () => {
    const event = privateCrashEvent({
      event_id: 'a'.repeat(32), user: { id: 'private-member', email: 'member@example.test' },
      message: 'private-message', request: { url: 'https://private-media.example/token' },
      breadcrumbs: [{ message: 'private-chat' }], tags: { latitude: '64.123' },
      extra: { password: 'private-password', diagnosisIds:['schizophrenia'], legalName:'Synthetic Patient' }, contexts: { device: { id: 'private-device' } },
      exception: { values: [{ type: 'TypeError', value: 'private-message',
        stacktrace: { frames: [{ filename: 'https://private.example/token', function: 'private-name', lineno: 12, colno: 9, vars: { secret: 'private' } }] } }] },
    }, 'hittumst.1', 'staging');
    expect(JSON.stringify(event)).not.toMatch(/private|member@example|64.123|password|latitude|schizophrenia|Synthetic Patient/);
    expect(event?.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: 'app://index.bundle', lineno: 12, colno: 9 });
    expect(event?.exception?.values?.[0]?.type).toBe('TypeError');
  });
  it('drops non-crash events and arbitrary error names', () => {
    expect(privateCrashEvent({ message: 'chat' }, 'r', 'staging')).toBeNull();
    expect(privateCrashEvent({ exception: { values: [{ type: 'secret@email.test' }] } }, 'r', 'staging')?.exception?.values?.[0]?.type).toBe('Error');
  });
});
