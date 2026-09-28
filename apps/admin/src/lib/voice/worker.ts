import { z } from 'zod';
import { isProviderNotFound, revokeVoiceParticipant, voiceCommand, voiceProvider } from './server';
const queueSchema = z.object({ revocations: z.array(z.object({ id:z.string().uuid(), roomName:z.string() })), rooms:z.array(z.object({ id:z.string().uuid(), roomName:z.string() })) });
export async function reconcileVoice(markHealthy=true) {
  const provider = voiceProvider();
  // A heartbeat certifies provider reachability even when the work queue is empty.
  await provider.listRooms(['voice-health-check']);
  const queue = queueSchema.parse(await voiceCommand('reconcile'));
  let revoked = 0, ended = 0;
  // Small batches avoid hammering the provider; failed entries stay durable for the next run.
  for (let offset = 0; offset < queue.revocations.length; offset += 8) {
    await Promise.all(queue.revocations.slice(offset, offset + 8).map(async item => {
      await revokeVoiceParticipant(item.roomName, item.id);
      await voiceCommand('revoked', item.id);
      revoked++;
    }));
  }
  for (let offset = 0; offset < queue.rooms.length; offset += 8) {
    await Promise.all(queue.rooms.slice(offset, offset + 8).map(async item => {
      try { await provider.deleteRoom(item.roomName); } catch (error) { if (!isProviderNotFound(error)) throw error; }
      await voiceCommand('deleted', item.id);
      ended++;
    }));
  }
  if (markHealthy && await voiceCommand('healthy') !== true) throw new Error('voice_backlog');
  return { revoked, ended };
}

