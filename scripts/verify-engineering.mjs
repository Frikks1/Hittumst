// Run the local engineering checks and tie the result to the exact working tree.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts/verification');
fs.mkdirSync(output,{recursive:true});
function fingerprint(){
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
    .filter(name=>/^(apps|packages|scripts|supabase|\.github)\//.test(name)||['package.json','package-lock.json','Dockerfile','render.yaml','eslint.config.mjs','.dockerignore'].includes(name))
    .filter(name=>!/(^|\/)\.env(\.|$)/.test(name)||name.endsWith('.env.example')).sort();
  const hash=createHash('sha256');
  for(const name of files){
    hash.update(name+'\0');
    const target=path.join(root,name);
    hash.update(fs.existsSync(target)?fs.readFileSync(target):'<deleted>');
    hash.update('\0');
  }
  return {sha256:hash.digest('hex'),files:files.length};
}
const before=fingerprint();
const report={scope:'local-engineering',startedAt:new Date().toISOString(),passed:false,source:before,
  limitations:['Working-tree verification; remote CI, hosted providers, store review and physical devices are separate gates.']};
const target=path.join(output,'engineering-check.json');
fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
if(!process.env.FFMPEG_PATH||!process.env.FFPROBE_PATH)throw new Error('Set FFMPEG_PATH and FFPROBE_PATH so real media processing is tested.');
const log=fs.createWriteStream(path.join(output,'engineering-check.log'));
const binary=process.platform==='win32'?(process.env.ComSpec??'cmd.exe'):'npm';
const args=process.platform==='win32'?['/d','/s','/c','npm','run','check']:['run','check'];
try {
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>log.write(chunk));child.stderr.on('data',chunk=>log.write(chunk));
    child.on('error',reject);child.on('close',resolve);
  });
  await new Promise(resolve=>log.end(resolve));
  const after=fingerprint();
  report.sourceUnchanged=after.sha256===before.sha256;
  report.exitCode=code;
  report.passed=code===0&&report.sourceUnchanged;
  const body=fs.readFileSync(path.join(output,'engineering-check.log'));
  report.logSha256=createHash('sha256').update(body).digest('hex');
  const plain=body.toString('utf8').replace(/\u001b\[[0-9;]*m/g,'');
  report.workspaceTests=[...plain.matchAll(/Tests\s+(\d+) passed/g)].map(match=>Number(match[1]));
  report.toolingTests=[...plain.matchAll(/ℹ pass (\d+)/g)].map(match=>Number(match[1]));
  report.totalTests=[...report.workspaceTests,...report.toolingTests].reduce((a,b)=>a+b,0);
  if(!report.passed)process.exitCode=1;
} catch(error){log.end();report.failure=error.message;process.exitCode=1;}
finally {
  report.completedAt=new Date().toISOString();
  fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
