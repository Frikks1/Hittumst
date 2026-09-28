import { createHash } from 'node:crypto';
import { z } from 'zod';
export type BillingEnvironment='SANDBOX'|'PRODUCTION';
export type PaidTier='flottari_plebbi'|'plebba_kongur';
const identity=z.string().min(1).max(200);
export const billingEventSchema=z.object({event:z.object({
 id:z.string().min(1).max(200),type:z.string().min(1).max(100),environment:z.enum(['SANDBOX','PRODUCTION']).nullish(),
 app_user_id:identity.nullish(),original_app_user_id:identity.nullish(),aliases:z.array(identity).max(200).nullish(),
 transferred_from:z.array(identity).max(200).nullish(),transferred_to:z.array(identity).max(200).nullish(),
 app_id:identity.nullish(),event_timestamp_ms:z.number().int().positive().safe().nullish(),
})});
export function billingEventContext(event:z.infer<typeof billingEventSchema>['event']) {
 const ids=(values:(string|null|undefined)[])=>Array.from(new Set(values.filter((value):value is string=>typeof value==='string'&&z.string().uuid().safeParse(value).success).map(value=>value.toLowerCase()))).sort();
 const from=ids(event.transferred_from??[]),to=ids(event.transferred_to??[]);
 return {identities:ids([event.app_user_id,event.original_app_user_id,...event.aliases??[],...from,...to]),transferFrom:from,transferTo:to,source:'webhook',eventType:event.type,eventTimestampMs:event.event_timestamp_ms??null};
}
const date=z.string().datetime({offset:true});
const subscriptionSchema=z.object({is_sandbox:z.boolean(),purchase_date:date,expires_date:date.nullable(),
 grace_period_expires_date:date.nullish(),billing_issues_detected_at:date.nullish(),refunded_at:date.nullish(),
 period_type:z.string(),store:z.string(),store_transaction_id:z.union([z.string().min(1),z.number().int().safe()]).nullish(),ownership_type:z.string().nullish()});
const entitlementSchema=z.object({product_identifier:z.string(),purchase_date:date,expires_date:date.nullable(),grace_period_expires_date:date.nullish()});
export const subscriberSchema=z.object({request_date_ms:z.number().int().positive(),subscriber:z.object({
 original_app_user_id:identity,subscriptions:z.record(z.string(),z.unknown()),entitlements:z.record(z.string(),z.unknown())})});
export type ProductMap=Record<string,{tier:PaidTier;entitlement:string}>;
export type BillingPeriod={key:string;tier:PaidTier;startsAt:string;endsAt:string;accessUntil:string;paid:boolean;refunded:boolean;active:boolean};
export type BillingSnapshot={accountId:string;providerUpdatedAt:string;periods:BillingPeriod[];needsReview:boolean};
export function normalizeSubscriber(accountId:string,payload:unknown,environment:BillingEnvironment,products:ProductMap,now=Date.now()):BillingSnapshot {
 z.string().uuid().parse(accountId);
 const response=subscriberSchema.parse(payload);
 if(Math.abs(response.request_date_ms-now)>300000)throw new Error('billing_snapshot_stale');
 const result:BillingSnapshot={accountId,providerUpdatedAt:new Date(response.request_date_ms).toISOString(),periods:[],needsReview:false};
 for(const [product,rawSubscription]of Object.entries(response.subscriber.subscriptions)) {

  const mapping=products[product];if(!mapping)continue;
  const subscription=subscriptionSchema.parse(rawSubscription);
  if(subscription.is_sandbox!==(environment==='SANDBOX'))continue;
  if(!subscription.expires_date || subscription.store_transaction_id==null || !['app_store','play_store','test_store'].includes(subscription.store)) {result.needsReview=true;continue;}
  if(environment==='PRODUCTION'&&subscription.store==='test_store')throw new Error('billing_environment_mismatch');
  const start=Date.parse(subscription.purchase_date),end=Date.parse(subscription.expires_date);
  if(end<=start)throw new Error('billing_invalid_period');
  const rawEntitlement=response.subscriber.entitlements[mapping.entitlement];
  const entitlement=rawEntitlement==null?undefined:entitlementSchema.parse(rawEntitlement);
  const matches=entitlement?.product_identifier===product;
  const access=Math.max(end,Date.parse(subscription.grace_period_expires_date??'')||0);
  const entitlementEnd=matches?Math.max(Date.parse(entitlement.expires_date??'')||0,Date.parse(entitlement.grace_period_expires_date??'')||0):0;
  const refunded=subscription.refunded_at!=null;
  const paid=['normal','prepaid'].includes(subscription.period_type.toLowerCase())&&!subscription.billing_issues_detected_at&&!refunded&&subscription.ownership_type!=='FAMILY_SHARED';
  result.periods.push({key:createHash('sha256').update(`${subscription.store}:${String(subscription.store_transaction_id)}`).digest('hex'),tier:mapping.tier,
   startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),accessUntil:new Date(Math.min(access,entitlementEnd||access)).toISOString(),paid,refunded,
   active:!!matches&&!refunded&&start<=now&&Math.min(access,entitlementEnd)>now});
 }
 return result;
}





