import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRelease } from './release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const buildOnly=process.argv.includes('--build');
if(buildOnly&&!['production','staging'].includes(process.env.EXPO_PUBLIC_APP_ENV)){
  if(process.env.EAS_BUILD_PROFILE==='preview'){console.log('Internal demo preview: public-launch preflight not applicable.');process.exit(0);}
}
const app=JSON.parse(fs.readFileSync(path.join(root,'apps/mobile/app.json'),'utf8')).expo;
const gates=buildOnly?null:JSON.parse(fs.readFileSync(path.join(root,'docs/launch-readiness.json'),'utf8'));
const issues=inspectRelease(process.env,app,gates);
for(const asset of [app.icon,app.android?.adaptiveIcon?.foregroundImage,app.android?.adaptiveIcon?.monochromeImage]){if(asset&&!fs.existsSync(path.resolve(root,'apps/mobile',asset)))issues.push('Configured native icon file is missing.');}
if(issues.length){console.error('Release is blocked:\n'+issues.map(issue=>' - '+issue).join('\n'));process.exitCode=1;}
else console.log(buildOnly?'Build configuration checks passed. This does not establish launch approval.':'Recorded launch gates and configuration passed. Reconfirm store and advertising approvals before publishing.');
