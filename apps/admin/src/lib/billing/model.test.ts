import {describe,it,expect} from 'vitest';
import {billingEventSchema,billingEventContext,normalizeSubscriber,type ProductMap} from './model';
const account='10000000-0000-4000-8000-000000000001';
const now=Date.parse('2026-09-21T12:00:00Z');
const products:ProductMap={plus:{tier:'flottari_plebbi',entitlement:'plus'},premium:{tier:'plebba_kongur',entitlement:'premium'}};
function payload(overrides:Record<string,unknown>={}){return {request_date_ms:now,subscriber:{original_app_user_id:account,subscriptions:{premium:{is_sandbox:false,purchase_date:'2026-09-01T00:00:00Z',expires_date:'2026-10-01T00:00:00Z',period_type:'normal',store:'app_store',store_transaction_id:'store-transaction-1',...overrides}},entitlements:{premium:{product_identifier:'premium',purchase_date:'2026-09-01T00:00:00Z',expires_date:'2026-10-01T00:00:00Z'}}}};}
const normalize=(value:unknown)=>normalizeSubscriber(account,value,'PRODUCTION',products,now);
describe('authoritative subscription snapshots',()=>{
 it('accepts transfers without app_user_id and filters anonymous aliases',()=>{
  const event=billingEventSchema.parse({event:{id:'transfer',type:'TRANSFER',transferred_from:[account,'$RCAnonymousID:ignored'],transferred_to:['AAAAAAAA-0000-4000-8000-000000000002'],aliases:[account],event_timestamp_ms:now}}).event;
  expect(billingEventContext(event)).toMatchObject({identities:[account,'aaaaaaaa-0000-4000-8000-000000000002'],transferFrom:[account],eventTimestampMs:now});
 });
 it.each(['BILLING_ISSUE','CANCELLATION','EXPIRATION','REFUND','FUTURE_PROVIDER_EVENT'])('queues %s without needing a sale-shaped receipt',type=>{
  expect(billingEventSchema.safeParse({event:{id:'id',type,app_user_id:account}}).success).toBe(true);
 });
 it('produces the same transaction key for aliases and different keys for stores',()=>{
  const first=normalize(payload());expect(first.periods[0]).toMatchObject({tier:'plebba_kongur',paid:true,active:true,refunded:false});
  expect(normalizeSubscriber('10000000-0000-4000-8000-000000000002',payload(),'PRODUCTION',products,now).periods[0]?.key).toBe(first.periods[0]?.key);
  expect(normalize(payload({store:'play_store'})).periods[0]?.key).not.toBe(first.periods[0]?.key);
 });
 it('isolates sandbox and never admits Test Store into production',()=>{
  expect(normalize(payload({is_sandbox:true})).periods).toEqual([]);
  expect(()=>normalize(payload({store:'test_store'}))).toThrow('billing_environment_mismatch');
 });
 it('preserves grace access without representing the failed charge as a funded period',()=>{
  const input=payload({expires_date:'2026-09-20T00:00:00Z',grace_period_expires_date:'2026-09-25T00:00:00Z',billing_issues_detected_at:'2026-09-20T00:00:00Z'});
  input.subscriber.entitlements.premium.expires_date='2026-09-25T00:00:00Z';
  expect(normalize(input).periods[0]).toMatchObject({active:true,paid:false,accessUntil:'2026-09-25T00:00:00.000Z'});
 });
 it('refunds and missing entitlements remove access regardless of expiration',()=>{
  expect(normalize(payload({refunded_at:'2026-09-21T00:00:00Z'})).periods[0]).toMatchObject({active:false,paid:false,refunded:true});
  const input=payload();input.subscriber.entitlements.premium.product_identifier='other';expect(normalize(input).periods[0]?.active).toBe(false);
 });
 it.each([{period_type:'trial'},{period_type:'intro'},{ownership_type:'FAMILY_SHARED'}])('does not record cash allowance eligibility for %j',override=>expect(normalize(payload(override)).periods[0]).toMatchObject({active:true,paid:false}));
 it('holds unidentifiable transactions for review and rejects stale snapshots',()=>{
  expect(normalize(payload({store_transaction_id:null}))).toMatchObject({needsReview:true,periods:[]});
  const input=payload();input.request_date_ms=now-300001;expect(()=>normalize(input)).toThrow('billing_snapshot_stale');
 });
 it('ignores unmapped products and expired entitlements',()=>{
  expect(normalizeSubscriber(account,payload(),'PRODUCTION',{},now).periods).toEqual([]);
  const unrelated=payload();Object.assign(unrelated.subscriber.subscriptions,{unmapped:{future_provider_schema:true}});expect(normalize(unrelated).periods).toHaveLength(1);
  const input=payload({expires_date:'2026-09-20T00:00:00Z'});input.subscriber.entitlements.premium.expires_date='2026-09-20T00:00:00Z';expect(normalize(input).periods[0]?.active).toBe(false);
 });
});

