import { readVoiceBody } from '@/lib/voice/http';
import { revokeVoiceParticipant, voiceCommand, voiceWebhookReceiver } from '@/lib/voice/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const headers = { 'Cache-Control':'no-store' };
  let receiver: ReturnType<typeof voiceWebhookReceiver>;
  try { receiver = voiceWebhookReceiver(); } catch { return Response.json({ error:'voice_unavailable' }, { status:503, headers }); }
  let event: Awaited<ReturnType<typeof receiver.receive>>;
  try {
    event = await receiver.receive(await readVoiceBody(request, 65536), request.headers.get('authorization') ?? '');
    if (!event.id || !event.createdAt || Math.abs(Date.now() / 1000 - Number(event.createdAt)) > 7 * 86400) throw new Error('invalid_event');
  } catch { return Response.json({ error:'invalid_webhook' }, { status:401, headers }); }
  try {
    const roomName = event.room?.name ?? '';
    const identity = event.participant?.identity ?? '';
    // Verify again even on duplicate webhook delivery, so a failed provider removal is retryable.
    if (event.event === 'participant_joined' && /^group-[0-9a-f-]{36}$/.test(roomName)) {
      const known = /^[0-9a-f-]{36}$/.test(identity) && await voiceCommand('validate', identity, { roomName }) === true;
      if (!known) await revokeVoiceParticipant(roomName, identity);
    }
    await voiceCommand('webhook', null, { id:event.id, event:event.event, roomName, identity });
    return Response.json({ received:true }, { headers });
  } catch { return Response.json({ error:'webhook_retry_required' }, { status:503, headers }); }
}

