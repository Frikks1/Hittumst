import { describe,expect,it } from 'vitest';
import { mergeMessages, validMessageBody } from './chatDelivery';
import type { ChatMessage } from '@/types/domain';
const message: ChatMessage={id:'1',conversationId:'c',senderId:'me',body:'Hello',kind:'text',createdAt:'2026-09-07T12:00:00Z',status:'sending'};
describe('chat delivery reconciliation',()=>{
  it('merges insert and realtime acknowledgement without duplicates',()=>{
    expect(mergeMessages([message],[{...message,status:'sent'},{...message,status:'sent'}])).toEqual([{...message,status:'sent'}]);
  });
  it('keeps a delivery confirmed by realtime after an HTTP timeout',()=>{
    expect(mergeMessages([{...message,status:'sent'}],[{...message,status:'failed'}])[0]?.status).toBe('sent');
  });
  it('preserves pending drafts when initial history arrives',()=>{
    expect(mergeMessages([message],[{...message,id:'old',createdAt:'2026-09-07T11:00:00Z',status:'sent'}]).map(m=>m.id)).toEqual(['old','1']);
  });
  it('enforces the database text limit in Unicode characters',()=>{
    expect(validMessageBody('  ')).toBe(false);expect(validMessageBody('x'.repeat(2001))).toBe(false);
    expect(validMessageBody('😊'.repeat(2000))).toBe(true);
  });
});
