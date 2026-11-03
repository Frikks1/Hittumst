'use server';
import { z } from 'zod';
import { staffCommunityInputSchema } from '@rummal/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { communityCoverReservationSchema, feedModerationInputSchema } from '@/lib/social-feed';

export async function savePublicCommunity(form: FormData) {
  const staff = await requireAdmin();
  if (staff.demo) redirect('/communities?state=demo');
  const input = staffCommunityInputSchema.safeParse({
    id: form.get('id'),
    name: form.get('name'),
    description: form.get('description'),
    status: form.get('status'),
    reason: form.get('reason'),
  });
  if (!input.success) redirect('/communities?state=invalid');
  const client = await createClient();
  const saved = await client.rpc('social_feed_staff_save', {
    p_id: input.data.id,
    p_name: input.data.name,
    p_description: input.data.description,
    p_status: input.data.status,
    p_reason: input.data.reason,
  });
  if (saved.error) redirect('/communities?state=unavailable');
  const file = form.get('cover');
  if (file instanceof File && file.size) {
    const request = z.uuid().safeParse(form.get('coverRequest'));
    if (
      !request.success ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 10485760
    )
      redirect('/communities?state=invalidImage');
    const reserved = await client.rpc('reserve_media_upload', {
      target_type: 'community_cover',
      target_id: input.data.id,
      media_type: 'image',
      metadata: { requestId: request.data },
    });
    const parsed = communityCoverReservationSchema.safeParse(reserved.data);
    if (reserved.error || !parsed.success) redirect('/communities?state=imageUnavailable');
    if (!parsed.data.alreadyUploaded) {
      const upload = await client.storage
        .from(parsed.data.bucket)
        .upload(parsed.data.path, await file.arrayBuffer(), {
          contentType: file.type,
          upsert: false,
          cacheControl: '0',
        });
      if (upload.error && String(upload.error.statusCode) !== '409')
        redirect('/communities?state=imageUnavailable');
    }
  }
  revalidatePath('/communities');
  redirect('/communities?state=saved');
}
export async function moderateCommunityContent(form: FormData) {
  const staff = await requireAdmin();
  if (staff.demo) redirect('/communities?state=demo');
  const input = feedModerationInputSchema.safeParse({
    kind: form.get('kind'),
    id: form.get('id'),
    hidden: form.get('action') === 'hide',
    reason: form.get('reason'),
  });
  if (!input.success || !['hide', 'restore'].includes(String(form.get('action'))))
    redirect('/communities?state=invalid');
  const client = await createClient();
  const result = await client.rpc('social_feed_staff_moderate', {
    p_kind: input.data.kind,
    p_id: input.data.id,
    p_hidden: input.data.hidden,
    p_reason: input.data.reason,
  });
  if (result.error) redirect('/communities?state=unavailable');
  revalidatePath('/communities');
  redirect('/communities?state=saved');
}
