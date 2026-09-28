import type { SupabaseClient } from '@supabase/supabase-js';
import { openAppleToken, revokeAppleToken } from './apple-tokens';

export async function revokeAppleAccount(db: SupabaseClient, accountId: string) {
  const result = await db.rpc('apple_token_get', { account_id: accountId });
  if (result.error || !result.data) throw new Error('apple_revocation_pending');

  const record = result.data.token;
  // Apple TN3194: missing credentials must not prevent deleting the app account.
  // The client provides Apple's manual access-revocation instructions in this case.
  if (!record) return;
  if (!record.sealedToken || !record.clientId) throw new Error('apple_revocation_pending');
  await revokeAppleToken(openAppleToken(record.sealedToken, accountId, record.clientId), record.clientId);
  // Keep encrypted token until Auth deletion succeeds; retries can revoke it again safely.
}


