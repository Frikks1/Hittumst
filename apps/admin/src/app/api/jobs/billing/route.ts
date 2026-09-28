import {timingSafeEqual} from 'node:crypto';
import {billingConfig,processBillingJob} from '@/lib/billing/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 const headers={'Cache-Control':'no-store'};
 if(process.env.WORKER_SCHEDULER==='render'&&process.env.WORKER_EXECUTION_ROLE!=='worker')return Response.json({error:'dedicated_worker_required'},{status:503,headers});
 const secret=process.env.CRON_SECRET;const actual=Buffer.from(request.headers.get('authorization')??'');const expected=Buffer.from(`Bearer ${secret}`);
 if(!secret||secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:'unauthorized'},{status:401,headers});
 if(!process.env.REVENUECAT_ENVIRONMENT)return Response.json({processed:0,pending:false,sandbox:false,disabled:true},{headers});
 try{const config=billingConfig();const result=await processBillingJob();return Response.json({...result,sandbox:config.environment==='SANDBOX'},{headers});}
 catch{return Response.json({error:'billing_reconciliation_pending'},{status:503,headers});}
}
