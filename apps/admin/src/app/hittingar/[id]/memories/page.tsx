import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicSite } from '@/components/public-site';
import { MemoryWallPage } from '@/components/memory-wall';
import { getRuntimeConfig } from '@/lib/env';
import { getPublicSiteConfig, siteLanguage } from '@/lib/public-site/config';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string | string[] }> };
export const dynamic = 'force-dynamic';
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const en = siteLanguage((await searchParams).lang) === 'en';
  return { title: { absolute: `Hittumst · ${en ? 'Wall of memories' : 'Minningaveggur'}` }, description: en ? 'Photos, videos and shared moments from a Hittingur.' : 'Myndir, myndbönd og sameiginlegar minningar frá Hittingi.', robots: { index: false, follow: false } };
}
export default async function MemoriesPage({ params, searchParams }: Props) {
  const { id } = await params;
  const language = siteLanguage((await searchParams).lang);
  const mode = getRuntimeConfig().mode;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && !(mode === 'demo' && id === 'demo')) notFound();
  return <PublicSite language={language} path={`/hittingar/${id}/memories`} config={getPublicSiteConfig()}><MemoryWallPage meetupId={id} language={language} demo={mode === 'demo'} /></PublicSite>;
}
