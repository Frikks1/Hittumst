import { commerceDatabase } from '@/lib/commerce';
import { AppleReturnError, appleWebsiteOrigin, finishAppleReauthorization, type AppleReturnMode } from '@/lib/apple-authorize';
import { readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  let mode:AppleReturnMode='web'; let complete=false;
  try {
    const form=new URLSearchParams(await readVoiceBody(request,16384));
    mode=await finishAppleReauthorization(commerceDatabase(),form.get('state')??'',form.get('code')??'');
    complete=true;
  } catch(error) { if(error instanceof AppleReturnError)mode=error.returnMode; }
  const status=complete?'complete':'failed';
  let destination='rummal://privacy?appleAuthorization='+status;
  if(mode==='web') {
    try { destination=appleWebsiteOrigin()+'/account?appleAuthorization='+status; }
    catch { return Response.json({error:'apple_authorization_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}); }
  }
  return new Response(null,{status:303,headers:{Location:destination,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
