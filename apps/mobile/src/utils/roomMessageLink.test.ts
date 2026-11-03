import { describe, expect, it } from 'vitest';
import { prepareRoomMessageLink, type RoomLinkSnapshot } from './roomMessageLink';

const now = Date.parse('2026-10-07T16:00:00Z');
function fixture(): RoomLinkSnapshot {
  return {
    active: true,
    room: { id: 'room', isPaused: false, canPost: true, readingClosesAt: '2026-10-07T17:00:00Z' },
    messages: [
      { id: 'earlier', roomId: 'room', body: 'First https://example.com/first', linkHostnames: ['example.com'] },
      { id: 'clicked', roomId: 'room', body: 'Next https://example.com/second', linkHostnames: ['example.com'] },
    ],
  };
}

describe('room message link confirmation', () => {
  it('opens the clicked message destination when another message shares its hostname', () => {
    const snapshot = fixture();
    const confirm = prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => now);
    expect(confirm?.()).toBe('https://example.com/second');
  });

  it('does not fall back to another message after the clicked message is removed during confirmation', () => {
    let snapshot = fixture();
    const confirm = prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => now);
    snapshot = { ...snapshot, messages: snapshot.messages.filter(message => message.id !== 'clicked') };
    expect(confirm?.()).toBeNull();
  });

  it.each(['hidden', 'changed', 'hostname_removed', 'different_room'])('rejects a message that becomes %s during confirmation', change => {
    const snapshot = fixture();
    const confirm = prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => now);
    const clicked = snapshot.messages[1]!;
    if (change === 'hidden') clicked.hiddenAt = '2026-10-07T16:01:00Z';
    if (change === 'changed') clicked.body = 'Replaced https://example.com/replacement';
    if (change === 'hostname_removed') clicked.linkHostnames = [];
    if (change === 'different_room') clicked.roomId = 'other-room';
    expect(confirm?.()).toBeNull();
  });

  it.each(['background', 'unavailable', 'expired'])('rejects a room that becomes %s during confirmation', change => {
    const snapshot = fixture();
    const confirm = prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => now);
    if (change === 'background') snapshot.active = false;
    if (change === 'unavailable') snapshot.room = null;
    if (change === 'expired') snapshot.room!.readingClosesAt = new Date(now).toISOString();
    expect(confirm?.()).toBeNull();
  });

  it('keeps already readable links available while posting is paused', () => {
    const snapshot = fixture();
    const confirm = prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => now);
    snapshot.room!.isPaused = true;
    snapshot.room!.canPost = false;
    expect(confirm?.()).toBe('https://example.com/second');
  });

  it('rechecks the clock when reading access expires during confirmation', () => {
    const snapshot = fixture();
    let clock = now;
    const confirm = prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => clock);
    clock += 60 * 60 * 1000;
    expect(confirm?.()).toBeNull();
  });

  it('requires the selected hostname to remain an allowed HTTP(S) destination', () => {
    const snapshot = fixture();
    expect(prepareRoomMessageLink(() => snapshot, 'clicked', 'other.example', () => now)).toBeNull();
    snapshot.messages[1]!.body = 'javascript:alert(1)';
    expect(prepareRoomMessageLink(() => snapshot, 'clicked', 'example.com', () => now)).toBeNull();
  });
});
