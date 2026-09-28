import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {commerceDatabase,requireSandbox} from '@/lib/commerce';
import {normalizeSubscriber,type BillingEnvironment,type BillingSnapshot,type ProductMap} from './model';
export function billingConfig(env:Record<string,string|undefined>=process.env) {
 const environment=env.REVENUECAT_ENVIRONMENT;
 if(!['SANDBOX','PRODUCTION'].includes(environment??'') || (env.HITTUMST_APP_ENV==='production' ? environment!=='PRODUCTION' : environment!=='SANDBOX'))throw new Error('billing_environment_unavailable');
 if(!env.REVENUECAT_SECRET_KEY || env.REVENUECAT_SECRET_KEY.length<20)throw new Error('billing_unavailable');
 const products:ProductMap={};
 for(const [prefix,tier]of [['PLUS','flottari_plebbi'],['PREMIUM','plebba_kongur']] as const) {
  const values=(env[`REVENUECAT_${prefix}_PRODUCTS`]??env[`REVENUECAT_${prefix}_PRODUCT`]??'').split(',').map(x=>x.trim()).filter(Boolean);
  const entitlement=env[`REVENUECAT_${prefix}_ENTITLEMENT`];
  if(!values.length || !entitlement || entitlement.length>200)throw new Error('billing_catalog_unavailable');
  for(const product of values){if(product.length>200 || products[product])throw new Error('billing_catalog_conflict');products[product]={tier,entitlement};}
 }
 return {environment:environment as BillingEnvironment,key:env.REVENUECAT_SECRET_KEY,products};
}
export function purchaseReadiness(environment:BillingEnvironment) {
 if(environment==='PRODUCTION')return {purchaseAllowed:false,reason:'financial_provider_approval_required'};
 try{requireSandbox();return {purchaseAllowed:true};}catch{return {purchaseAllowed:false,reason:'sandbox_not_configured'};}
}
export async function billingCommand(action:string,input:Record<string,unknown>={}) {
 const config=billingConfig();
 const {data,error}=await commerceDatabase().rpc('billing_service',{p_action:action,p_input:{...input,environment:config.environment}});
 if(error)throw new Error(error.message==='billing_receipt_conflict'?'billing_receipt_conflict':'billing_database_unavailable');
 return data;
}
export async function fetchBillingSnapshot(accountId:string):Promise<BillingSnapshot> {
 z.string().uuid().parse(accountId);const config=billingConfig();
 const response=await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(accountId)}`,{
  headers:{Authorization:`Bearer ${config.key}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
 });
 if(!response.ok)throw new Error('billing_provider_unavailable');
 // Persist only normalized subscription facts, never arbitrary subscriber attributes or the raw response.
 const reader=response.body?.getReader();if(!reader)throw new Error('billing_provider_invalid');
 const chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1_048_576){await reader.cancel();throw new Error('billing_provider_invalid');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return normalizeSubscriber(accountId,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),config.environment,config.products);
}
const jobSchema=z.object({id:z.string().uuid(),claimId:z.string().uuid(),environment:z.enum(['SANDBOX','PRODUCTION']),context:z.object({identities:z.array(z.string().uuid()).max(602),transferFrom:z.array(z.string().uuid()),transferTo:z.array(z.string().uuid()),source:z.string()})});
export async function processBillingJob(jobId?:string) {
 const claimId=randomUUID();const candidate=await billingCommand('claim',{claimId,...jobId?{jobId}:{}});
 if(!candidate)return {processed:0,pending:false,status:'processing' as const};
 const job=jobSchema.parse(candidate);
 try {
  const snapshots:BillingSnapshot[]=[];
  for(let offset=0;offset<job.context.identities.length;offset+=4){
   if(await billingCommand('renew',{jobId:job.id,claimId})!==true)throw new Error('billing_claim_expired');
   const batch=await Promise.allSettled(job.context.identities.slice(offset,offset+4).map(async accountId=>{
    const {data,error}=await commerceDatabase().rpc('billing_provider_guard',{p_account:accountId,p_job:job.id,p_claim:claimId});
    if(error||!data)throw Error('billing_claim_expired');
    if(data.state==='deleted')return {accountId,providerUpdatedAt:new Date().toISOString(),periods:[],needsReview:false};
    const validUntil=Date.parse(data.validUntil);
    if(data.state!=='allowed'||!Number.isFinite(validUntil)||validUntil<Date.now()+15000)throw Error('billing_claim_expired');
    return fetchBillingSnapshot(accountId);
   }));
   // Retain the lease until every in-flight lookup settles, even if one has already failed.
   for(const result of batch){if(result.status==='rejected')throw result.reason;snapshots.push(result.value);}
  }
  const result=await billingCommand('apply',{jobId:job.id,claimId,snapshots}) as {status?:string}|false;
  if(!result)throw new Error('billing_claim_expired');
  return {processed:1,pending:true,status:result.status==='verified'?'verified' as const:'queued' as const};
 }catch(error){await billingCommand('retry',{jobId:job.id,claimId});throw error;}
}



