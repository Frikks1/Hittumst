import { describe, expect, it } from 'vitest';
import * as commerce from '@/app/api/commerce/route';
import * as billing from '@/app/api/billing/sync/route';
import * as finance from '@/app/api/finance/review/route';
import * as settlement from '@/app/api/jobs/commerce/route';
import * as reconciliation from '@/app/api/jobs/billing/route';
import * as webhook from '@/app/api/webhooks/revenuecat/route';
describe('removed monetary endpoints', () => {
  for (const [name, route] of Object.entries({ commerce, billing, finance, settlement, reconciliation, webhook })) {
    it(name + ' refuses old clients, jobs and provider callbacks', async () => {
      for (const handler of [route.GET, route.POST]) {
        const response = handler();
        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({ error: 'money_features_removed' });
      }
    });
  }
});
