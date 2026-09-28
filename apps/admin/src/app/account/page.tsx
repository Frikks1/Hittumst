import type { Metadata } from 'next';
import { AccountPortal } from '@/components/account-portal';
export const metadata: Metadata = { title:'Hittumst — Account', robots:{ index:false,follow:false } };
export const dynamic = 'force-dynamic';
export default async function AccountPage({searchParams}:{searchParams:Promise<{lang?:string}>}) {
  const {lang}=await searchParams;
  return <AccountPortal initialEnglish={lang==='en'} />;
}
