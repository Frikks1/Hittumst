import { describe, expect, it, vi } from 'vitest';
import { createNotificationDispatcher } from './notificationDelivery';
import { parseNotificationTarget } from './notificationTarget';
const id = '10000000-0000-4000-8000-000000000001';
function setup() {
  let account: string | null = 'me';
  const resolve = vi.fn().mockResolvedValue({ type: 'conversation', id });
  const navigate = vi.fn(); const clear = vi.fn().mockResolvedValue(undefined);
  const dispatch = createNotificationDispatcher({ account: () => account, resolve, navigate, clear });
  return { dispatch, resolve, navigate, clear, changeAccount: (value: string | null) => { account = value; } };
}
describe('private notification routing', () => {
  it.each(['conversation', 'group', 'meetup'])('accepts only a typed authorized %s target', type => {
    expect(parseNotificationTarget({ type, id, url: 'https://attacker.test' })).toEqual({ type, id });
  });
  it.each([{ type: 'url', id }, { type: 'group', id: '../../settings' }, { type: 'conversation', id: null }, null])('rejects arbitrary targets', target => {
    expect(() => parseNotificationTarget(target)).toThrow('notification_unavailable');
  });
  it('resolves exactly the notification selected, without a bounded inbox lookup', async () => {
    const { dispatch, resolve, navigate } = setup(); await dispatch(id);
    expect(resolve).toHaveBeenCalledWith(id); expect(navigate).toHaveBeenCalledWith({ type: 'conversation', id });
  });
  it('coalesces delivery and cold-start duplicates', async () => {
    const { dispatch, resolve, navigate } = setup(); await Promise.all([dispatch(id), dispatch(id)]); await dispatch(id);
    expect(resolve).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledOnce();
  });
  it('does not route a response belonging to a previous account', async () => {
    const { dispatch, resolve, navigate, clear, changeAccount } = setup(); let done!: (value: unknown) => void;
    resolve.mockReturnValue(new Promise(value => { done = value; })); const opened = dispatch(id);
    changeAccount('other'); done({ type: 'group', id }); await opened;
    expect(navigate).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
  });
  it('does not resolve pushes when signed out or a malformed id is supplied', async () => {
    const { dispatch, resolve, clear, changeAccount } = setup(); await dispatch('https://attacker.test'); expect(clear).toHaveBeenCalledOnce();
    changeAccount(null); await dispatch(id); expect(resolve).not.toHaveBeenCalled();
  });
  it('never routes a revoked target and permits a retry after transient failure', async () => {
    const { dispatch, resolve, navigate } = setup(); resolve.mockRejectedValueOnce(new Error('notification_unavailable'));
    await dispatch(id); expect(navigate).not.toHaveBeenCalled(); await dispatch(id); expect(navigate).toHaveBeenCalledOnce();
  });
});
