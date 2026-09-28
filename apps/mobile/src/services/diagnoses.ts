import { z } from 'zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { diagnosisRecordSchema, diagnosisSubmissionSchema } from '@rummal/shared';
import { supabase } from './supabase';
import { runtimeEnv } from './env';
// Dedicated private bucket: never use the profile/media moderation upload service.
async function action(
  action: string,
  input: Record<string, unknown> = {},
  client: SupabaseClient | null = supabase,
) {
  if (!client) throw Error('review_unavailable');
  const result = await client.rpc('diagnosis_action', { action, input });
  if (result.error) throw Error('diagnosis_request_failed');
  return result.data;
}
export async function diagnosisReleaseEnabled() {
  if (!supabase) return false;
  const { data, error } = await (supabase as SupabaseClient).rpc('discovery_release_status');
  return !error && data === true;
}
export async function listDiagnoses() {
  return supabase ? z.array(diagnosisRecordSchema).parse(await action('list')) : [];
}
export async function withdrawDiagnosis(id: string) {
  await action('withdraw', { id });
}
export async function discloseDiagnosis(id: string, enabled: boolean) {
  await action('disclosure', { id, enabled });
}
export async function submitDiagnosis(
  input: z.infer<typeof diagnosisSubmissionSchema>,
  uri: string,
  mime: string,
  accountId: string,
) {
  const validated = diagnosisSubmissionSchema.parse(input);
  const session = await supabase?.auth.getSession();
  if (!session?.data.session || session.data.session.user.id !== accountId)
    throw Error('account_changed');
  const token = session.data.session.access_token;
  // Freeze the caller for the whole upload: account switching cannot transfer health evidence.
  const client = createClient(runtimeEnv.supabaseUrl!, runtimeEnv.supabasePublishableKey!, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  if (!['image/jpeg', 'image/png'].includes(mime)) throw Error('invalid_evidence');
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw Error('invalid_evidence');
  const reservation = z
    .object({ id: z.string().uuid(), path: z.string() })
    .parse(await action('reserve', validated, client));
  try {
    const { error } = await client.storage
      .from('diagnosis-evidence')
      .upload(reservation.path, bytes, { contentType: mime, upsert: false, cacheControl: '0' });
    if (error) throw Error('upload_failed');
    await action('submit', { id: reservation.id }, client);
  } catch {
    await action('withdraw', { id: reservation.id }, client).catch(() => undefined);
    throw Error('submission_failed');
  }
}
