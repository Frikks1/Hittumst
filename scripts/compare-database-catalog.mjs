import { readFileSync, writeFileSync } from 'node:fs';
const read = name => JSON.parse(readFileSync(new URL(`../tmp/${name}-catalog.json`,import.meta.url),'utf8'));
const hosted = new Map(read('hosted').map(entry=>[entry.key,entry]));
const local = new Map(read('local').map(entry=>[entry.key,entry]));
const differences=[];
const canonical = entry => entry && JSON.stringify(entry.definition, (_key,value)=>typeof value==='string'?value.replaceAll('\r\n','\n'):value);
let lineEndingOnly=0;
for(const key of new Set([...hosted.keys(),...local.keys()])) {
  const a=hosted.get(key),b=local.get(key);
  if(a?.fingerprint!==b?.fingerprint) {
    if(canonical(a)===canonical(b))lineEndingOnly++;
    else differences.push({key,state:!a?'local_only':!b?'hosted_only':'different',hosted:a?.definition,local:b?.definition});
  }
}
const result={hostedObjects:hosted.size,localObjects:local.size,equal:hosted.size-differences.filter(d=>d.state!=='local_only').length,lineEndingOnly,differences};
writeFileSync(new URL('../tmp/catalog-comparison.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,differences:differences.map(({key,state})=>({key,state}))},null,2));
if(differences.length)process.exitCode=1;
