// Build the deployment image with synthetic public values; never read .env files or use provider credentials.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = randomUUID().replaceAll('-', ''),
  tag = 'hittumst-worker-verification:' + token,
  name = 'hittumst-worker-check-' + token,
  webName = 'hittumst-web-check-' + token;
const destination = path.join(root, 'artifacts/operations');
const runtime = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      'PATH',
      'Path',
      'SystemRoot',
      'WINDIR',
      'ComSpec',
      'PATHEXT',
      'TEMP',
      'TMP',
      'LOCALAPPDATA',
      'APPDATA',
      'USERPROFILE',
      'HOME',
      'ProgramFiles',
      'ProgramFiles(x86)',
      'PROCESSOR_ARCHITECTURE',
      'NUMBER_OF_PROCESSORS',
    ].includes(key),
  ),
);
const report = {
  schemaVersion: 1,
  scope: 'local-docker-runtime-verification',
  startedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  limitations: [
    'Synthetic public build values only; no provider requests, deployed configuration, workload or signed-device verification.',
  ],
};
await mkdir(destination, { recursive: true });
const reportPath = path.join(destination, 'docker-runtime.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
async function docker(args, timeout = 60000) {
  const linuxRoot = root
    .replace(/^([A-Za-z]):/, (_, drive) => '/mnt/' + drive.toLowerCase())
    .replaceAll('\\', '/');
  const binary = process.platform === 'win32' ? 'wsl.exe' : 'docker';
  const prefix =
    process.platform === 'win32'
      ? ['-d', 'Ubuntu', '-u', 'root', '--cd', linuxRoot, '--', 'docker']
      : [];
  return new Promise((resolve, reject) => {
    let output = '',
      timedOut = false;
    const child = spawn(binary, [...prefix, '--context', 'default', ...args], {
      cwd: root,
      env: runtime,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    const collect = (chunk) => {
      output += chunk.toString('utf8');
      if (output.length > 32 * 1024 * 1024) child.kill();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}
let created = false;
try {
  const context = await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (context.code !== 0 || !/^(unix:\/\/\/|npipe:\/\/)/.test(context.output.trim()))
    throw new Error('local_docker_required');
  console.log('Building isolated runtime image with synthetic public configuration.');
  created = true;
  const build = await docker(
    [
      'build',
      '--progress=plain',
      '--tag',
      tag,
      '--build-arg',
      'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co',
      '--build-arg',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_container_fixture',
      '--build-arg',
      'NEXT_PUBLIC_APP_URL=https://hittumst.example',
      '--build-arg',
      'NEXT_PUBLIC_SUPPORT_EMAIL=support@example.test',
      '.',
    ],
    1800000,
  );
  await writeFile(path.join(destination, 'docker-build.log'), build.output, { mode: 0o600 });
  report.checks.push({
    name: 'deployment image builds',
    passed: build.code === 0 && !build.timedOut,
  });
  if (build.code !== 0 || build.timedOut) throw new Error('container_build_failed');
  const restriction = [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '64',
    '--memory',
    '512m',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
  ];
  const worker = await docker([
    ...restriction,
    '--name',
    name,
    '--entrypoint',
    'node',
    tag,
    'apps/admin/dist-worker/worker.mjs',
  ]);
  await writeFile(path.join(destination, 'docker-worker-startup.log'), worker.output, {
    mode: 0o600,
  });
  report.checks.push({
    name: 'isolated worker loads dependencies and rejects missing credentials',
    passed:
      worker.code !== 0 &&
      !worker.timedOut &&
      worker.output.includes('Error: worker_configuration_required') &&
      !/MODULE_NOT_FOUND|Cannot find (?:module|package)/.test(worker.output),
  });
  for (const executable of ['ffmpeg', 'ffprobe']) {
    const result = await docker([...restriction, '--entrypoint', executable, tag, '-version']);
    report.checks.push({
      name: executable + ' available in runtime image',
      passed:
        result.code === 0 &&
        !result.timedOut &&
        result.output.toLowerCase().includes(executable + ' version'),
    });
  }
  // Exercise the exact standalone web filesystem, without workspace node_modules,
  // host ports, provider credentials or any route to an external network.
  const web = await docker([
    ...restriction.filter((argument) => argument !== '--rm'),
    '--detach',
    '--name',
    webName,
    '--env',
    'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co',
    '--env',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_container_fixture',
    '--env',
    'NEXT_PUBLIC_APP_URL=https://hittumst.example',
    '--env',
    'NEXT_PUBLIC_SUPPORT_EMAIL=support@example.test',
    '--env',
    'NEXT_PUBLIC_RUMMAL_DEMO_MODE=false',
    '--env',
    'HITTUMST_APP_ENV=staging',
    '--env',
    'HITTUMST_PUBLIC_RELEASE=false',
    '--env',
    'HITTUMST_POLICIES_APPROVED=false',
    '--env',
    'WORKER_EXECUTION_ROLE=web',
    '--env',
    'WORKER_SCHEDULER=render',
    '--env',
    'CRON_SECRET=container-verification-only-no-provider-credential',
    tag,
  ]);
  report.checks.push({
    name: 'standalone web container starts',
    passed: web.code === 0 && !web.timedOut,
  });
  if (web.code === 0 && !web.timedOut) {
    const probeSource = String.raw`
      const origin='http://127.0.0.1:10000';
      const checks=[];let accountHtml="";
      (async()=>{
        const deadline=Date.now()+45000;let ready=false;
        while(Date.now()<deadline){
          try{const response=await fetch(origin+'/api/operations/live',{redirect:'manual',signal:AbortSignal.timeout(1500)});
            await response.arrayBuffer();if(response.status===200&&Date.now()<=deadline){ready=true;break;}}
          catch{}
          await new Promise(resolve=>setTimeout(resolve,250));
        }
        checks.push({name:'standalone web becomes live within 45 seconds',passed:ready});
        if(ready){
          for(const [route,status] of [['/account',200],['/privacy',200],['/api/operations/live',200],['/api/operations/ready',401],['/finance',307]]){
            try{
              const response=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(20000)});
              const body=await response.text();let passed=response.status===status;
              if(route==='/account')accountHtml=body;
              if(route==='/account'||route==='/privacy')passed=passed&&body.includes('Hittumst')&&/<h1(?:\s|>)/i.test(body);
              if(route==='/finance'){
                const location=response.headers.get('location');
                const target=location?new URL(location,origin):null;
                passed=[303,307,308].includes(response.status)&&target?.origin===origin&&target.pathname==='/login';
              }
              checks.push({name:'standalone '+route+' response',passed:Boolean(passed),status:response.status});
            }catch{checks.push({name:'standalone '+route+' response',passed:false,error:'request_failed'});}
          }
          function attribute(tag,name){
            for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))if(match[1].toLowerCase()===name)return match[2]??match[3];
          }
          function localAsset(value){
            try{if(!value||value.length>2048)return null;const url=new URL(value.replaceAll('&amp;','&'),origin);
              return url.origin===origin&&!url.username&&!url.password&&url.pathname.startsWith('/_next/static/')?url:null;
            }catch{return null;}
          }
          const style=[...accountHtml.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0])
            .filter(tag=>attribute(tag,'rel')?.toLowerCase().split(/\s+/).includes('stylesheet'))
            .map(tag=>localAsset(attribute(tag,'href'))).find(url=>url?.pathname.endsWith('.css'));
          const script=[...accountHtml.matchAll(/<script\b[^>]*>/gi)].map(match=>localAsset(attribute(match[0],'src')))
            .find(url=>url?.pathname.endsWith('.js'));
          for(const [kind,url,mime] of [['stylesheet',style,/^text\/css(?:;|$)/i],['JavaScript chunk',script,/^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i]]){
            try{
              if(!url)throw new Error('local_asset_missing');
              const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
              const contentType=response.headers.get('content-type')??'';const body=await response.text();
              checks.push({name:'standalone '+kind+' asset response',passed:response.status===200&&mime.test(contentType)&&body.trim().length>0,status:response.status});
            }catch{checks.push({name:'standalone '+kind+' asset response',passed:false,error:'asset_failed'});}
          }
        }
        console.log(JSON.stringify({checks}));
        process.exitCode=checks.every(check=>check.passed)?0:1;
      })().catch(()=>{console.log(JSON.stringify({checks:[{name:'standalone web probe',passed:false,error:'probe_failed'}]}));process.exitCode=1;});
    `;
    const probe = await docker(['exec', webName, 'node', '-e', probeSource], 220000);
    const allowed = new Set([
      'standalone web becomes live within 45 seconds',
      'standalone stylesheet asset response',
      'standalone JavaScript chunk asset response',
      ...['/account', '/privacy', '/api/operations/live', '/api/operations/ready', '/finance'].map(
        (route) => 'standalone ' + route + ' response',
      ),
    ]);
    let parsed;
    try {
      parsed = JSON.parse(probe.output.trim());
    } catch {}
    const valid =
      Array.isArray(parsed?.checks) &&
      parsed.checks.length <= 8 &&
      parsed.checks.every((check) => allowed.has(check.name) && typeof check.passed === 'boolean');
    report.checks.push({
      name: 'standalone web probe completed',
      passed: probe.code === 0 && !probe.timedOut && valid && parsed.checks.length === 8,
    });
    if (valid)
      for (const check of parsed.checks) {
        report.checks.push({
          name: check.name,
          passed: check.passed,
          ...(Number.isInteger(check.status) ? { status: check.status } : {}),
        });
      }
  }
  const webLogs = await docker(['logs', '--tail', '100', webName]);
  // Raw logs are not copied into evidence. Only fixed diagnostic categories survive.
  report.webDiagnostics = {
    missingRuntimeDependency: /MODULE_NOT_FOUND|Cannot find (?:module|package)/.test(
      webLogs.output,
    ),
    readOnlyFilesystemError: /EROFS|read-only file system/i.test(webLogs.output),
  };
  report.checks.push({
    name: 'standalone web has no missing dependency or read-only filesystem error',
    passed:
      !report.webDiagnostics.missingRuntimeDependency &&
      !report.webDiagnostics.readOnlyFilesystemError,
  });
  report.passed = report.checks.every((check) => check.passed);
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  report.failureCode = ['local_docker_required', 'container_build_failed'].includes(error.message)
    ? error.message
    : 'container_verification_failed';
  process.exitCode = 1;
} finally {
  if (created) {
    await docker(['rm', '--force', name, webName]).catch(() => {});
    await docker(['image', 'rm', tag]).catch(() => {});
  }
  report.completedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
