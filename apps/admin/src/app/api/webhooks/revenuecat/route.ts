import {createHash} from 'node:crypto';
import {verifyRevenueCat} from '@/lib/revenuecat';
import {billingEventContext,billingEventSchema} from '@/lib/billing/model';
import {billingCommand,billingConfig} from '@/lib/billing/server';
import {readVoiceBody as readBoundedBody} from '@/lib/voice/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 const headers={'Cache-Control':'no-store'};
 const secret=process.env.REVENUECAT_WEBHOOK_SECRET;
 if(!secret || secret.length<32)return Response.json({error:'billing_unavailable'},{status:503,headers});
 let raw:string;
 try{raw=await readBoundedBody(request,262144);}catch{return Response.json({error:'invalid_webhook'},{status:400,headers});}
 if(!verifyRevenueCat(raw,request.headers.get('x-revenuecat-webhook-signature'),secret))return Response.json({error:'unauthorized'},{status:401,headers});
 let parsed:ReturnType<typeof billingEventSchema.parse>;
 try{parsed=billingEventSchema.parse(JSON.parse(raw));}catch{return Response.json({error:'invalid_webhook'},{status:400,headers});}
 try {
  billingConfig();const event=parsed.event;
  // All event kinds trigger the same authoritative snapshot path, including TRANSFER, billing issues and refunds.
  const receipt=await billingCommand('receipt',{eventId:event.id,eventType:event.type,eventEnvironment:event.environment??'UNKNOWN',
   hash:createHash('sha256').update(raw).digest('hex'),context:billingEventContext(event)});
  // Reply only once the event and any work are durably committed. Provider availability is not needed here.
  return Response.json({received:true,...receipt},{headers});
 }catch(error){return Response.json({error:error instanceof Error&&error.message==='billing_receipt_conflict'?'receipt_conflict':'receipt_pending_reconciliation'},
  {status:error instanceof Error&&error.message==='billing_receipt_conflict'?409:503,headers});}
}
