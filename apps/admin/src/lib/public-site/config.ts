import { z } from 'zod';

export type SiteLanguage = 'is' | 'en';
export function siteLanguage(value: string | string[] | undefined): SiteLanguage { return value === 'en' ? 'en' : 'is'; }
export function siteHref(path: string, language: SiteLanguage) { return language === 'en' ? `${path}?lang=en` : path; }

const secureUrl = z.url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; });
const storeUrl = (host: string) => secureUrl.refine(value => new URL(value).hostname === host);
const text = z.string().trim().min(3);
const launchDetails = z.object({
  operator: text, address: text, supportEmail: z.email(), childSafetyEmail: z.email(),
  siteUrl: secureUrl, policyDate: z.iso.date(), coverageIs: text, coverageEn: text,
  retentionIs: text, retentionEn: text, transfersIs: text, transfersEn: text,
});

export function getPublicSiteConfig(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const details = {
    operator: environment.HITTUMST_OPERATOR_NAME?.trim(), address: environment.HITTUMST_OPERATOR_ADDRESS?.trim(),
    supportEmail: environment.NEXT_PUBLIC_SUPPORT_EMAIL?.trim(), childSafetyEmail: environment.HITTUMST_CHILD_SAFETY_EMAIL?.trim(),
    siteUrl: environment.NEXT_PUBLIC_APP_URL?.trim(), policyDate: environment.HITTUMST_POLICY_DATE?.trim(),
    coverageIs: environment.HITTUMST_SUPPORT_COVERAGE_IS?.trim(), coverageEn: environment.HITTUMST_SUPPORT_COVERAGE_EN?.trim(),
    retentionIs: environment.HITTUMST_RETENTION_NOTICE_IS?.trim(), retentionEn: environment.HITTUMST_RETENTION_NOTICE_EN?.trim(),
    transfersIs: environment.HITTUMST_TRANSFER_NOTICE_IS?.trim(), transfersEn: environment.HITTUMST_TRANSFER_NOTICE_EN?.trim(),
  };
  const policiesApproved = environment.HITTUMST_POLICIES_APPROVED === 'true';
  const released = environment.HITTUMST_PUBLIC_RELEASE === 'true';
  if (policiesApproved || released) launchDetails.parse(details);
  if (released && !policiesApproved) throw new Error('Approve the published policies before enabling the public release.');
  const iosUrl = environment.HITTUMST_IOS_STORE_URL?.trim() || undefined;
  const androidUrl = environment.HITTUMST_ANDROID_STORE_URL?.trim() || undefined;
  if (released) {
    if (!iosUrl && !androidUrl) throw new Error('A public release requires at least one published store listing.');
    if (iosUrl) storeUrl('apps.apple.com').parse(iosUrl);
    if (androidUrl) storeUrl('play.google.com').parse(androidUrl);
  }
  return { ...details, supportEmail: z.email().safeParse(details.supportEmail).success ? details.supportEmail : undefined,
    childSafetyEmail: z.email().safeParse(details.childSafetyEmail).success ? details.childSafetyEmail : undefined,
    policiesApproved, released, iosUrl: released ? iosUrl : undefined, androidUrl: released ? androidUrl : undefined };
}
export type PublicSiteConfig = ReturnType<typeof getPublicSiteConfig>;
