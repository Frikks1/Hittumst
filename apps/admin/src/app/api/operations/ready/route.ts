import { captureDiagnostic } from '@/lib/diagnostics';
import { createClient } from '@supabase/supabase-js';
import { operationsHealth } from '@/lib/operations';
import { evaluateReadiness } from '@/lib/operations-readiness';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const identity=operationsHealth(process.env,request.headers.get('authorization'));
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(identity.status!==200) return Response.json(identity.body,{status:identity.status,headers});
 try {
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!key?.startsWith('sb_secret_')) throw new Error('missing');
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false},
   global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  const {data,error}=await db.rpc('get_worker_health');
  if(error) throw new Error('unavailable');
  const result=evaluateReadiness(data);
  return Response.json(result,{status:result.status==='ok'?200:503,headers});
 } catch { captureDiagnostic('operations_backend_unavailable'); return Response.json({status:'degraded',issues:['backend_unavailable']},{status:503,headers}); }
}

