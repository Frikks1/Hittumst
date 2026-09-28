'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export async function reviewMediaAppeal(form: FormData) {
  const staff = await requireAdmin();
  if (staff.demo) redirect('/media-appeals?state=demo');
  const input = z
    .object({
      id: z.string().uuid(),
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().min(20).max(500),
    })
    .safeParse({ id: form.get('id'), decision: form.get('decision'), reason: form.get('reason') });
  if (!input.success) redirect('/media-appeals?state=invalid');
  const db = await createClient();
  const result = await db.rpc('admin_review_media', {
    upload_id: input.data.id,
    approved: input.data.decision === 'approve',
    reason: input.data.reason,
  });
  if (result.error) redirect('/media-appeals?state=unavailable');
  revalidatePath('/media-appeals');
  redirect('/media-appeals?state=recorded');
}
