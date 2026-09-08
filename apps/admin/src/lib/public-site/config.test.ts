import { describe, expect, it } from 'vitest';
import { getPublicSiteConfig } from './config';

const approved = {
  HITTUMST_POLICIES_APPROVED: 'true', HITTUMST_OPERATOR_NAME: 'Synthetic operator', HITTUMST_OPERATOR_ADDRESS: 'Test address',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@example.test', HITTUMST_CHILD_SAFETY_EMAIL: 'safety@example.test',
  NEXT_PUBLIC_APP_URL: 'https://example.test', HITTUMST_POLICY_DATE: '2026-09-08',
  HITTUMST_SUPPORT_COVERAGE_IS: 'Prófun', HITTUMST_SUPPORT_COVERAGE_EN: 'Test hours',
  HITTUMST_RETENTION_NOTICE_IS: 'Prófun', HITTUMST_RETENTION_NOTICE_EN: 'Test retention',
  HITTUMST_TRANSFER_NOTICE_IS: 'Prófun', HITTUMST_TRANSFER_NOTICE_EN: 'Test safeguards',
};
describe('public release configuration', () => {
  it('keeps a preparation site without invented contacts or store links', () => {
    expect(getPublicSiteConfig({})).toMatchObject({ released: false, policiesApproved: false, supportEmail: undefined, iosUrl: undefined });
  });
  it('requires complete publisher disclosures even for a policy-only pilot', () => {
    for (const key of Object.keys(approved).filter(key => key !== 'HITTUMST_POLICIES_APPROVED')) {
      expect(() => getPublicSiteConfig({ ...approved, [key]: '' })).toThrow();
    }
  });
  it('rejects unapproved launch and lookalike store links', () => {
    expect(() => getPublicSiteConfig({ ...approved, HITTUMST_PUBLIC_RELEASE: 'true', HITTUMST_POLICIES_APPROVED: 'false' })).toThrow();
    const release = { ...approved, HITTUMST_PUBLIC_RELEASE: 'true', HITTUMST_IOS_STORE_URL: 'https://apps.apple.com/is/app/test/id123', HITTUMST_ANDROID_STORE_URL: 'https://play.google.com/store/apps/details?id=is.rummal.app' };
    expect(getPublicSiteConfig(release).released).toBe(true);
    expect(() => getPublicSiteConfig({ ...release, HITTUMST_IOS_STORE_URL: 'https://apps.apple.com.example.test/fake' })).toThrow();
  });
});
