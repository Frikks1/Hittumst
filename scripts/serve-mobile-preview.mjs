import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.MOBILE_PREVIEW_ROOT ?? 'apps/mobile/dist');
const port=Number(process.env.MOBILE_PREVIEW_PORT ?? 8810);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const types={'.js':'text/javascript','.html':'text/html','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon','.json':'application/json'};
createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,`.${pathname}`);
  if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403).end();return;}
  let file=target;let bytes;try{bytes=await readFile(file);}catch{file=path.join(root,'index.html');bytes=await readFile(file);}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
 }catch{res.writeHead(500).end();}
}).listen(port,'127.0.0.1',()=>console.log('Local mobile preview ready on port '+port));
