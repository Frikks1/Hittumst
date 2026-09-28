'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { attendanceReviewDecisionSchema } from '@/lib/community-attendance';

export async function resolveAttendanceReview(form: FormData) {
  const staff = await requireAdmin();
  if (staff.demo) redirect('/attendance-reviews?state=demo');
  const decision = form.get('decision');
  const input = attendanceReviewDecisionSchema.safeParse({
    id: form.get('id'), approved: decision === 'approve', reason: form.get('reason'),
  });
  if (!input.success || !['approve', 'reject'].includes(String(decision))) redirect('/attendance-reviews?state=invalid');
  const client = await createClient();
  const { error } = await client.rpc('staff_resolve_meetup_attendance_review', {
    p_request_id: input.data.id, p_approved: input.data.approved, p_reason: input.data.reason,
  });
  if (error) redirect('/attendance-reviews?state=unavailable');
  revalidatePath('/attendance-reviews');
  redirect('/attendance-reviews?state=recorded');
}
