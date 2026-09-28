'use client';
import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';
import {attachmentFilename} from '@/lib/account-download';

function save(blob: Blob,name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=name; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
type Media = { id:string; downloadPath:string };
export function AccountPortal({initialEnglish=false}:{initialEnglish?:boolean}) {
  const [en,setEn]=useState(initialEnglish);
  const [client,setClient]=useState<SupabaseClient|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const [email,setEmail]=useState(''); const [otp,setOtp]=useState('');
  const [codeSent,setCodeSent]=useState(false); const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const [media,setMedia]=useState<Media[]>([]);
  const [appleManual,setAppleManual]=useState(false);
  const copy=(is:string,english:string)=>en?english:is;
  useEffect(()=>{
    const status=new URL(window.location.href).searchParams.get('appleAuthorization');
    if (status) {
      setMessage(status==='complete'
        ? initialEnglish?'Apple authorization confirmed. Review and confirm deletion again.':'Apple-heimild staðfest. Farðu yfir og staðfestu eyðingu aftur.'
        : initialEnglish?'Apple authorization was not completed. Try again.':'Apple-heimild var ekki lokið. Reyndu aftur.');
      window.history.replaceState(null,'',window.location.pathname);
    }
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key?.startsWith('sb_publishable_')) return;
    const db=createClient(url,key,{global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})},auth:{storage:window.sessionStorage,storageKey:'hittumst-member-portal',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    setClient(db);
    let alive=true;
    void db.auth.getUser().then(result=>{ if(alive) setUser(result.data.user); }).catch(()=>{if(alive){setUser(null);setMessage(initialEnglish?'Sign-in could not be checked. Try again.':'Ekki tókst að staðfesta innskráningu. Reyndu aftur.');}});
    const listener=db.auth.onAuthStateChange((_event,session)=>{if(alive){setUser(session?.user??null);setMedia([]);setConfirmation('');}});
    return()=>{alive=false;listener.data.subscription.unsubscribe();db.auth.stopAutoRefresh();};
  },[initialEnglish]);
  async function request(path:string,body?:unknown) {
    if (!client || !user) throw new Error('authentication_required');
    const session=await client.auth.getSession();
    if (!session.data.session || session.data.session.user.id!==user.id) throw new Error('authentication_required');
    const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+session.data.session.access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
    const current=await client.auth.getSession();
    const deletionAccepted=response.status===202&&path==='/api/account/lifecycle'&&typeof body==='object'&&body!==null&&'action' in body&&body.action==='delete';
    if (current.data.session?.user.id!==user.id && !(deletionAccepted&&!current.data.session)) throw new Error('authentication_required');
    if (!response.ok) {
      const detail=await response.json().catch(()=>({}));
      throw new Error(typeof detail.error==='string'?detail.error:'request_failed');
    }
    return response;
  }
  async function run(action:()=>Promise<void>) {
    if (busy) return; setBusy(true);setMessage('');
    try { await action(); } catch(error) {
      setMessage(error instanceof Error && error.message==='deletion_requires_support'
        ? copy('Ekki tókst að ljúka beiðninni. Hafðu samband við aðstoð vegna inneignar eða takmarkana á aðgangi.','The request needs support review, for example for remaining balances or account restrictions.')
        : copy('Ekki tókst að ljúka aðgerðinni. Reyndu aftur eða hafðu samband við aðstoð.','The action could not be completed. Try again or contact support.'));
    } finally {setBusy(false);}
  }
  return <main style={{maxWidth:680,margin:'40px auto',padding:24,lineHeight:1.6}}>
    <nav style={{display:'flex',justifyContent:'space-between',gap:16}}><Link href="/">Hittumst</Link><button className="button button-secondary" onClick={()=>setEn(!en)}>{en?'Íslenska':'English'}</button></nav>
    <h1>{copy('Gögnin þín og aðgangur','Your data and account')}</h1>
    <p>{copy('Skráðu þig inn til að sækja eigin gögn eða óska eftir eyðingu. Ekki nota sameiginlega tölvu.','Sign in to download your own data or request deletion. Avoid shared computers.')}</p>
    {!client && <p role="status">{copy('Þjónustan er ekki tilbúin. Hafðu samband við aðstoð.','The service is not configured. Contact support.')}</p>}
    {client && !user && <form onSubmit={event=>{event.preventDefault();void run(async()=>{
      if (!codeSent) {
        await client.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false}});
        setCodeSent(true); setMessage(copy('Ef aðgangur er til færðu kóða í tölvupósti.','If an account exists, you will receive a code by email.'));
      } else {
        const result=await client.auth.verifyOtp({email:email.trim(),token:otp.trim(),type:'email'});
        if(result.error)throw result.error;setUser(result.data.user);setOtp('');
      }
    });}}>
      <label style={{display:'block'}}>{copy('Netfang aðgangs','Account email')}<input style={{display:'block',width:'100%',padding:12,margin:'8px 0 20px'}} type="email" autoComplete="email" required value={email} disabled={busy||codeSent} onChange={event=>setEmail(event.target.value)} /></label>
      {codeSent&&<label style={{display:'block'}}>{copy('Kóði úr tölvupósti','Email code')}<input style={{display:'block',width:'100%',padding:12,margin:'8px 0 20px'}} autoComplete="one-time-code" inputMode="numeric" required value={otp} onChange={event=>setOtp(event.target.value)} /></label>}
      <button className="button button-primary" disabled={busy}>{codeSent?copy('Staðfesta','Verify'):copy('Senda kóða','Send code')}</button>
      {codeSent&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>{setCodeSent(false);setOtp('');}}>{copy('Breyta netfangi / reyna aftur','Change email / retry')}</button>}
    </form>}
    {user&&<>
      <p>{copy('Innskráður aðgangur:','Signed in:')} {user.email}</p>
      <section><h2>{copy('Sækja gögn','Download data')}</h2>
      <p>{copy('Útflutningurinn inniheldur persónuupplýsingar. Geymdu hann á öruggum stað.','Your export contains personal information. Store it securely.')}</p>
      <button className="button button-primary" disabled={busy} onClick={()=>void run(async()=>{
        const response=await request('/api/account/lifecycle'); const data=await response.json();
        save(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'hittumst-account.json');
        setMedia(Array.isArray(data.mediaManifest)?data.mediaManifest.filter((item:Media)=>/^\/api\/account\/media\/[0-9a-f-]{36}$/.test(item.downloadPath)):[]);
        setMessage(copy('Gögn sótt. Þú getur sótt eigin miðla hér fyrir neðan.','Data downloaded. Your own media files can be downloaded below.'));
      })}>{copy('Sækja gögn sem JSON','Download JSON export')}</button>
      {media.length>0&&<ul>{media.map((item,index)=><li key={item.id}><button disabled={busy} className="button button-secondary" onClick={()=>void run(async()=>{const response=await request(item.downloadPath);save(await response.blob(),attachmentFilename(response.headers.get('Content-Disposition'),'hittumst-media-'+(index+1)+'.bin'));})}>{copy('Sækja miðil','Download media')} {index+1}</button></li>)}</ul>}
      </section>
      <section><h2>{copy('Eyða aðgangi','Delete account')}</h2>
      <p>{copy('Aðgangur lokast strax þegar beiðnin er skráð. Eyðing gagna heldur áfram í bakgrunni. Sum fjárhags- og öryggisgögn geta þurft lögmæta varðveislu.','Access closes when the request is recorded. Data deletion continues in the background. Some financial and safety records may require lawful retention.')}</p>
      <p>{copy('Segðu einnig upp áskrift í App Store eða Google Play. Eyðing aðgangs er ekki sjálfkrafa uppsögn hjá versluninni.','Also cancel any subscription in the App Store or Google Play. Account deletion does not automatically cancel store billing.')}</p>
      <p>{copy('Ef Apple-heimild er ekki varðveitt má samt eyða aðganginum. Eftir eyðingu skaltu fjarlægja Hittumst undir Innskráning með Apple í Apple-aðgangsstillingum.','If Apple authorization credentials are unavailable, you can still delete your account. After deletion, remove Hittumst under Sign in with Apple in your Apple Account settings.')} <a href="https://support.apple.com/102571" target="_blank" rel="noreferrer">{copy('Leiðbeiningar Apple','Apple instructions')}</a></p>
      {user.identities?.some(identity=>identity.provider==='apple')&&<button className="button button-secondary" disabled={busy} onClick={()=>void run(async()=>{
        const result=await (await request('/api/account/apple',{action:'reauthorize',returnMode:'web'})).json();
        const url=new URL(result.url);if(url.origin!=='https://appleid.apple.com'||url.pathname!=='/auth/authorize')throw new Error('invalid_authorization');
        window.location.assign(url.href);
      })}>{copy('Endurnýja Apple-heimild (valfrjálst)','Refresh Apple authorization (optional)')}</button>}
      <label>{copy('Skrifaðu DELETE til að staðfesta','Type DELETE to confirm')}<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" style={{display:'block',padding:12,margin:'8px 0 16px'}} /></label>
      <button className="button button-danger" disabled={busy||confirmation!=='DELETE'} onClick={()=>void run(async()=>{
        const result=await (await request('/api/account/lifecycle',{action:'delete',confirmation:'DELETE'})).json();
        setAppleManual(result.appleManualRevocationRequired===true);
        await client!.auth.signOut({scope:'local'});setUser(null);setCodeSent(false);setMedia([]);
        setMessage(copy('Beiðni skráð. Aðgangi hefur verið lokað; eyðing gagna er í vinnslu.','Request recorded. Access has been closed; data deletion is in progress.'));
      })}>{copy('Staðfesta eyðingu','Confirm deletion')}</button>
      </section>
      <button style={{marginTop:24}} className="button button-secondary" disabled={busy} onClick={()=>void run(async()=>{const result=await client!.auth.signOut({scope:'local'});if(result.error)throw result.error;setUser(null);setMedia([]);})}>{copy('Skrá út','Sign out')}</button>
    </>}
    {appleManual&&<p>{copy('Fjarlægðu einnig Hittumst úr Innskráning með Apple í Apple-aðgangsstillingum.','Also remove Hittumst from Sign in with Apple in your Apple Account settings.')} <a href="https://support.apple.com/102571" target="_blank" rel="noreferrer">{copy('Leiðbeiningar Apple','Apple instructions')}</a></p>}
    {message&&<p role="status" aria-live="polite">{message}</p>}
    <p><Link href={'/support?lang='+(en?'en':'is')}>{copy('Aðstoð','Support')}</Link> · <Link href={'/privacy?lang='+(en?'en':'is')}>{copy('Persónuvernd','Privacy')}</Link></p>
  </main>;
}


