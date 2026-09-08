import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'apps/mobile/assets/brand');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'assets/brand/rummal-mark.svg'),'utf8');
const opaque=source.replace('rx="64"','');
const paths=source.match(/<path\b[^>]*\/>/g);
if(paths?.length!==3)throw new Error('Expected the established Hittumst vector mark.');
const foreground='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g transform="translate(35.84 35.84) scale(.72)">'+paths.join('')+'</g></svg>';
const mask=paths.map((p,i)=>p.replace(/fill="[^"]*"/,'fill="'+(i?'black':'white')+'"')).join('');
const mono='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><mask id="mark">'+mask+'</mask></defs><g transform="translate(35.84 35.84) scale(.72)"><rect width="256" height="256" fill="white" mask="url(#mark)"/></g></svg>';
for(const [name,svg,size] of [['icon.png',opaque,1024],['adaptive-foreground.png',foreground,1024],['monochrome.png',mono,1024],['notification.png',mono,96],['favicon.png',opaque,64]]){
 let renderer=sharp(Buffer.from(svg)).resize(size,size);
 if(name==='icon.png'||name==='favicon.png')renderer=renderer.removeAlpha();
 await renderer.png().toFile(path.join(out,name));
 const metadata=await sharp(path.join(out,name)).metadata();
 console.log(name,metadata.width+'x'+metadata.height);
}
