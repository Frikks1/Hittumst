import { describe, expect, it, vi } from 'vitest';
import { createRefreshCoordinator } from './refreshCoordinator';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
describe('refresh/write race coordination', () => {
  it('does not overwrite a confirmed mutation with an earlier snapshot', async () => {
    const initial = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValueOnce('after write');
    const apply = vi.fn(); const reject = vi.fn();
    const coordinator = createRefreshCoordinator<string>();
    const complete = coordinator.request({ read, apply, reject });
    coordinator.invalidate(); initial.resolve('before write');
    await complete;
    expect(apply.mock.calls).toEqual([['after write']]); expect(read).toHaveBeenCalledTimes(2);
  });
  it('serializes and coalesces overlapping refresh requests', async () => {
    const first = deferred<string>(); const apply = vi.fn(); const reject = vi.fn();
    const coordinator = createRefreshCoordinator<string>();
    const middle = vi.fn(async () => 'middle'); const last = vi.fn(async () => 'last');
    const complete = coordinator.request({ read: () => first.promise, apply, reject });
    coordinator.request({ read: middle, apply, reject }); coordinator.request({ read: last, apply, reject });
    expect(last).not.toHaveBeenCalled(); first.resolve('first'); await complete;
    expect(middle).not.toHaveBeenCalled(); expect(apply.mock.calls).toEqual([['first'], ['last']]);
  });
  it('ignores a departed-account response and applies the new account refresh', async () => {
    const old = deferred<string>(); const oldApply = vi.fn(); const nextApply = vi.fn(); const reject = vi.fn();
    const coordinator = createRefreshCoordinator<string>();
    const complete = coordinator.request({ read: () => old.promise, apply: oldApply, reject });
    coordinator.cancel(); coordinator.request({ read: async () => 'new account', apply: nextApply, reject });
    old.resolve('private old account'); await complete;
    expect(oldApply).not.toHaveBeenCalled(); expect(nextApply).toHaveBeenCalledWith('new account');
  });
  it('drains a refresh requested while the previous promise is settling', async () => {
    const first = deferred<string>(); const apply = vi.fn(); const reject = vi.fn();
    const coordinator = createRefreshCoordinator<string>();
    const complete = coordinator.request({ read: () => first.promise, apply, reject });
    void first.promise.then(() => coordinator.request({ read: async () => 'queued while settling', apply, reject }));
    first.resolve('first'); await complete;
    expect(apply.mock.calls).toEqual([['first'], ['queued while settling']]);
  });
  it('reports current failures and remains usable for retry', async () => {
    const coordinator = createRefreshCoordinator<string>(); const reject = vi.fn(); const apply = vi.fn();
    await coordinator.request({ read: async () => { throw new Error('offline'); }, apply, reject });
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
    await coordinator.request({ read: async () => 'recovered', apply, reject });
    expect(apply).toHaveBeenCalledWith('recovered');
  });
});
