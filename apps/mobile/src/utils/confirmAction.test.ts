import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAction } from './confirmAction';

const mocks = vi.hoisted(() => ({ platform: { OS: 'web' }, alert: vi.fn() }));
vi.mock('react-native', () => ({ Platform: mocks.platform, Alert: { alert: mocks.alert } }));

const labels = {
  title: 'Open meeting link?',
  message: 'You are leaving Hittumst for example.com.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Open link',
};

beforeEach(() => { vi.clearAllMocks(); mocks.platform.OS = 'web'; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('cross-platform action confirmation', () => {
  it('opens an accepted web action once and shows its destination in the prompt', () => {
    const prompt = vi.fn(() => true);
    const open = vi.fn();
    vi.stubGlobal('confirm', prompt);
    confirmAction({ ...labels, onConfirm: open });
    expect(prompt).toHaveBeenCalledOnce();
    expect(prompt).toHaveBeenCalledWith(expect.stringContaining('example.com'));
    expect(open).toHaveBeenCalledOnce();
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('does not execute a cancelled web action', () => {
    const open = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    confirmAction({ ...labels, onConfirm: open });
    expect(open).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'])('waits for the native confirmation button on %s', platform => {
    mocks.platform.OS = platform;
    const open = vi.fn();
    const prompt = vi.fn();
    vi.stubGlobal('confirm', prompt);
    confirmAction({ ...labels, onConfirm: open });
    expect(open).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    const [, message, buttons] = mocks.alert.mock.calls[0]!;
    expect(message).toContain('example.com');
    expect(buttons[0]).toMatchObject({ text: 'Cancel', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: 'Open link', style: 'default' });
    buttons[1].onPress();
    expect(open).toHaveBeenCalledOnce();
  });
});
