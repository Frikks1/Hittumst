import Link from 'next/link';
import { ArrowUpRight, HeartHandshake } from 'lucide-react';
import type { ReactNode } from 'react';
import { type PublicSiteConfig, type SiteLanguage, siteHref } from '@/lib/public-site/config';
import styles from './public-site.module.css';

export { styles as publicStyles };
export const publicDocuments = {
  privacy: ['Persónuvernd', 'Privacy'], terms: ['Skilmálar', 'Terms'], community: ['Samfélagsreglur', 'Community standards'],
  'child-safety': ['Öryggi barna', 'Child safety'], support: ['Aðstoð', 'Support'], 'delete-account': ['Eyða aðgangi', 'Delete account'],
} as const;
export type PublicDocument = keyof typeof publicDocuments;

export function PublicSite({ language, path, config, children }: { language: SiteLanguage; path: string; config: PublicSiteConfig; children: ReactNode }) {
  const en = language === 'en';
  return <div className={styles.site} lang={language}>
    <a className={styles.skip} href="#main">{en ? 'Skip to content' : 'Fara í efni'}</a>
    <header className={styles.header}>
      <Link className={styles.brand} href={siteHref('/', language)} aria-label={en ? 'Hittumst home' : 'Hittumst forsíða'}><HeartHandshake aria-hidden="true" /><span>Hittumst<span className={styles.brandDot}>.</span></span></Link>
      <nav aria-label={en ? 'Main navigation' : 'Aðalvalmynd'}><Link href={siteHref('/support', language)}>{en ? 'Support' : 'Aðstoð'}</Link><Link className={styles.language} href={siteHref(path, en ? 'is' : 'en')} hrefLang={en ? 'is' : 'en'} lang={en ? 'is' : 'en'}>{en ? 'Íslenska' : 'English'}</Link></nav>
    </header>
    {!config.policiesApproved && <div className={styles.preparation}>{en ? 'In preparation. Policy drafts are awaiting approval before the pilot.' : 'Í undirbúningi. Drög að reglum bíða samþykktar áður en prófanir hefjast.'}</div>}
    {children}
    <footer className={styles.footer}>
      <div><Link className={styles.footerBrand} href={siteHref('/', language)}>Hittumst.</Link><p>{en ? 'Nearby connections. Shared experiences.' : 'Ný kynni. Sameiginlegar upplifanir.'}</p><span>18+ · {en ? 'Icelandic & English' : 'Íslenska og enska'}</span></div>
      <nav aria-label={en ? 'Information and policies' : 'Upplýsingar og reglur'}>{Object.entries(publicDocuments).map(([slug, label]) => <Link key={slug} href={siteHref(`/${slug}`, language)}>{label[en ? 1 : 0]}</Link>)}</nav>
      <div className={styles.footerBottom}><span>{config.operator ?? (en ? 'Preparing for launch in Iceland' : 'Undirbúningur fyrir opnun á Íslandi')}</span><Link href="/login">{en ? 'Staff sign-in' : 'Innskráning starfsfólks'} <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
    </footer>
  </div>;
}

export function SupportLink({ config, language, subject }: { config: PublicSiteConfig; language: SiteLanguage; subject?: string }) {
  return config.supportEmail ? <a className={styles.contact} href={`mailto:${config.supportEmail}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>{config.supportEmail}<ArrowUpRight size={18} aria-hidden="true" /></a> : <p className={styles.muted}>{language === 'en' ? 'The monitored support address will be published here before invitations open.' : 'Vaktað netfang aðstoðar verður birt hér áður en boð eru send út.'}</p>;
}
