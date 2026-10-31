import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../out/',import.meta.url));
const port=Number(process.env.PORT||3000);
const mime={'.html':'text/html; charset=utf-8','.txt':'text/plain; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end()}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end('Bad request')}
 const target=resolve(root,'.'+pathname);
 if(target!==resolve(root)&&!target.startsWith(resolve(root)+sep)){res.writeHead(403);return res.end('Forbidden')}
 if(pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(404);return res.end('Not found')}
 for(const file of [target,target+'.html',resolve(target,'index.html')]){
  try{if(!(await stat(file)).isFile())continue;const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff'});return res.end(req.method==='HEAD'?undefined:bytes)}catch{}
 }
 res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});let body='Not found';try{body=await readFile(resolve(root,'404.html'))}catch{}res.end(req.method==='HEAD'?undefined:body)
});
server.listen(port,'0.0.0.0',()=>console.log(`Aula Clara: http://localhost:${port}`));
