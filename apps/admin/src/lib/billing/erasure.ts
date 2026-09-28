import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
const uuid=z.string().uuid();
const customerSchema=z.object({id:z.string().min(1).max(1500),deleted_at:z.number().nullable().optional()});
const aliasesSchema=z.object({items:z.array(z.object({id:z.string().min(1).max(1500)})).max(100),next_page:z.string().nullable().optional()});
async function readJson(response:Response):Promise<unknown>{
 const reader=response.body?.getReader();if(!reader)throw Error('billing_erasure_provider_invalid');
 const chunks:Uint8Array[]=[];let count=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>262144){await reader.cancel();throw Error('billing_erasure_provider_invalid');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
/** V2 reads never create a customer, unlike GET /v1/subscribers. */
export async function eraseRevenueCatCustomer(db:SupabaseClient,accountId:string,jobId:string,claimId:string){
 uuid.parse(accountId);uuid.parse(jobId);uuid.parse(claimId);
 const guard=async(aliases:string[]=[])=>{
  const {data,error}=await db.rpc('billing_provider_guard',{p_account:accountId,p_job:jobId,p_claim:claimId,p_erasing:true,p_aliases:aliases});
  if(error||!data||data.state!=='ready')throw Error(data?.state==='alias_review_required'?'billing_erasure_alias_review_required':'billing_erasure_pending');
  return data as {required:boolean;environment?:string|null};
 };
 const allowed=await guard();
 if(!allowed.required&&!process.env.REVENUECAT_ENVIRONMENT&&!process.env.REVENUECAT_SECRET_KEY)return;
 const environment=process.env.REVENUECAT_ENVIRONMENT;
 if((process.env.HITTUMST_APP_ENV==='production'?environment!=='PRODUCTION':environment!=='SANDBOX')||(allowed.environment&&allowed.environment!==environment))throw Error('billing_erasure_environment_mismatch');
 const project=process.env.REVENUECAT_PROJECT_ID,key=process.env.REVENUECAT_ERASURE_KEY;
 if(!project||!/^proj[a-zA-Z0-9_-]+$/.test(project)||!key||key.length<20)throw Error('billing_erasure_unavailable');
 const origin=`https://api.revenuecat.com/v2/projects/${encodeURIComponent(project)}/customers/${encodeURIComponent(accountId)}`;
 const call=(url:string,method='GET')=>fetch(url,{method,headers:{Authorization:`Bearer ${key}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
 const existing=await call(origin);if(existing.status===404)return;if(!existing.ok)throw Error('billing_erasure_provider_pending');
 const customer=customerSchema.parse(await readJson(existing));if(customer.deleted_at!=null)return;
 const identities=new Set<string>([accountId]);if(uuid.safeParse(customer.id).success)identities.add(customer.id.toLowerCase());
 let cursor:string|undefined;
 for(let page=0;page<10;page++){
  const response=await call(`${origin}/aliases?limit=100${cursor?`&starting_after=${encodeURIComponent(cursor)}`:''}`);
  if(response.status===404)return;if(!response.ok)throw Error('billing_erasure_provider_pending');
  const aliases=aliasesSchema.parse(await readJson(response));
  for(const alias of aliases.items)if(uuid.safeParse(alias.id).success)identities.add(alias.id.toLowerCase());
  if(!aliases.next_page)break;
  const next=aliases.items.at(-1)?.id;if(!next||next===cursor||page===9)throw Error('billing_erasure_aliases_incomplete');cursor=next;
 }
 // Do not erase another active member's merged customer. Keep the deletion durable for operator review.
 await guard([...identities]);
 const removed=await call(origin,'DELETE');if(removed.status===404)return;if(!removed.ok)throw Error('billing_erasure_provider_pending');
 // Deletion is asynchronous. Confirm using a non-creating lookup and retry via the durable deletion queue.
 const confirmed=await call(origin);if(confirmed.status===404)return;
 if(confirmed.ok&&customerSchema.parse(await readJson(confirmed)).deleted_at!=null)return;
 throw Error('billing_erasure_provider_pending');
}
