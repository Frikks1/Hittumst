import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
import { MfaForm } from '@/components/mfa-form';
import { getStaffSession } from '@/lib/auth/session';

export const metadata = { title: 'Verify staff access' };
export const dynamic = 'force-dynamic';
export default async function MfaPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login?reason=staff-only');
  if (!staff.mfaRequired) redirect('/dashboard');
  return <main className="login-panel"><section className="login-panel-inner">
    <BrandMark /><h1>Verify staff access</h1>
    <p>Use your authenticator app to open the safety desk.</p>
    <MfaForm />
    <p>If you have lost your authenticator, contact your safety lead for identity verification and account recovery.</p>
    <form action="/auth/signout" method="post"><button className="button" type="submit">Sign out</button></form>
  </section></main>;
}
