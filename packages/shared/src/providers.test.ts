import { expect, it } from 'vitest';
import { fromProviderAmount, toProviderAmount, SandboxProvider } from './providers';
it('converts explicit provider units without rounding money', () => {
  expect(toProviderAmount(1995, 100).value).toBe(199500);
  expect(fromProviderAmount(toProviderAmount(4995, 1))).toBe(4995);
  expect(() => fromProviderAmount({ currency: 'ISK', value: 101, unitsPerIsk: 100 })).toThrow();
});
it('repeated sandbox provider calls use stable references', async () => {
  const p = new SandboxProvider();
  expect(await p.submit('same', toProviderAmount(500, 1))).toEqual(
    await p.submit('same', toProviderAmount(500, 1)),
  );
  expect(await p.quote()).toEqual({ feeIsk: 0, minimumIsk: 1, maximumIsk: 100000000 });
});
