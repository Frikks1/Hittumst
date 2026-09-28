import {memberCors,memberPreflight} from '@/lib/auth/member-cors';
import {memberDatabase} from '@/lib/auth/member-database';
import {billingCommand,billingConfig,processBillingJob,purchaseReadiness} from '@/lib/billing/server';
import {readVoiceBody as readBoundedBody} from '@/lib/voice/http';
import {z} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const accessSchema=z.object({accountId:z.string().uuid(),configured:z.boolean(),environment:z.enum(['SANDBOX','PRODUCTION']).optional(),jobId:z.string().uuid().nullable().optional(),status:z.string().optional()});
async function handle(request:Request,enqueue:boolean) {
 const cors=memberCors(request,enqueue?'POST':'GET');
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:cors.headers});
 if(!cors.allowed)return reply({error:'forbidden_origin'},403);
 const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')??'')?.[1];
 if(!token)return reply({error:'authentication_required'},401);
 if(enqueue){try{const raw=await readBoundedBody(request,1024);if(raw.trim()&&Object.keys(z.object({}).strict().parse(JSON.parse(raw))).length)throw Error();}catch{return reply({error:'invalid_request'},400);}}
 try {
  const member=memberDatabase(token);
  const {data,error}=await member.rpc('billing_sync_access',{p_enqueue:enqueue});
  if(error)return reply({error:error.message==='rate_limit_exceeded'?'billing_rate_limited':error.code==='42501'?'authentication_required':'billing_unavailable'},error.message==='rate_limit_exceeded'?429:error.code==='42501'?403:503);
  const access=accessSchema.parse(data);
  if(!access.configured)return reply({purchaseAllowed:false,reason:'billing_unavailable',...(enqueue?{status:'queued'}:{})},enqueue?503:200);
  let config:ReturnType<typeof billingConfig>;
  try{config=billingConfig();}catch{return reply({purchaseAllowed:false,reason:'billing_unavailable'},enqueue?503:200);}
  if(access.environment!==config.environment)return reply({purchaseAllowed:false,reason:'billing_environment_unavailable'},503);
  const readiness=purchaseReadiness(config.environment);
  if(!enqueue)return reply(readiness);
  if(!access.jobId)throw Error('billing_job_missing');
  try {await processBillingJob(access.jobId);}catch{return reply({status:'queued',...readiness},202);}
  const status=await billingCommand('status',{jobId:access.jobId});
  return reply({status:status==='verified'?'verified':status==='processing'?'processing':'queued',...readiness,...status==='review'?{reason:'billing_review_required'}:{}},status==='verified'?200:202);
 }catch{return reply({error:'billing_unavailable',purchaseAllowed:false},503);}
}
export function GET(request:Request){return handle(request,false);}
export function POST(request:Request){return handle(request,true);}
export function OPTIONS(request:Request){return memberPreflight(request,request.headers.get('access-control-request-method')==='GET'?'GET':'POST');}

