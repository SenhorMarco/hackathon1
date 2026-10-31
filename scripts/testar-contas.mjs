// HTTP authorization checks against a simulated Supabase. No real credentials.
// Run after npm run build: node scripts/testar-contas.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createServerClient } from '@supabase/ssr';

const teacher='11111111-1111-4111-8111-111111111111';
const student='22222222-2222-4222-8222-222222222222';
const room='33333333-3333-4333-8333-333333333333';
const exam='44444444-4444-4444-8444-444444444444';
const other='55555555-5555-4555-8555-555555555555';
const user=id=>({id,aud:'authenticated',role:'authenticated',email:`${id}@example.test`,email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()});
const jwt=id=>[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'fake-signature'].join('.');
const mock=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const chunks=[];for await(const c of req)chunks.push(c);
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname==='/auth/v1/token'){
  const body=JSON.parse(Buffer.concat(chunks));const id=body.email.startsWith('student')?student:teacher;
  return send(200,{access_token:jwt(id),refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:user(id)});
 }
 if(url.pathname==='/auth/v1/user'){
  const token=req.headers.authorization?.replace('Bearer ','');
  try { const {sub}=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));return send(200,user(sub)); }catch{return send(401,{message:'Unauthorized'});}
 }
 if(url.pathname==='/rest/v1/perfis'){
  const id=url.searchParams.get('id').slice(3);return send(200,{id,nome:'Test user',papel:id===student?'aluno':'professor'});
 }
 if(url.pathname==='/rest/v1/turmas')return send(200,url.searchParams.get('id')===`eq.${room}`&&url.searchParams.get('professor_id')===`eq.${teacher}`?{id:room}:null);
 if(url.pathname==='/rest/v1/provas'){
  if(url.searchParams.has('turmas.professor_id'))return send(200,url.searchParams.get('id')===`eq.${exam}`?{turmas:{professor_id:teacher}}:null);
  return send(200,[]);
 }
 return send(404,{message:'Unexpected mock route: '+url.pathname});
});
mock.listen(0,'127.0.0.1');await once(mock,'listening');
const provider=`http://127.0.0.1:${mock.address().port}`;
const port=3187,base=`http://localhost:${port}`;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:provider,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key',SUPABASE_URL:provider,SUPABASE_SERVICE_ROLE_KEY:'test-service'},stdio:['ignore','pipe','pipe']});
let logs='';app.stdout.on('data',s=>logs+=s);app.stderr.on('data',s=>logs+=s);
async function cookie(email){
 const jar=new Map();const client=createServerClient(provider,'test-key',{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(v=>jar.set(v.name,v.value))}});
 const {error}=await client.auth.signInWithPassword({email,password:'test-password'});assert.equal(error,null);
 return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');
}
try{
 let ready=false;for(let i=0;i<60;i++){try{await fetch(base+'/login');ready=true;break}catch{await delay(500)}}assert.ok(ready,logs);
 const teacherCookie=await cookie('teacher@example.test'),studentCookie=await cookie('student@example.test');
 assert.equal((await fetch(base+'/api/exams?turma_id='+room)).status,401);
 assert.equal((await fetch(base+'/api/exams?turma_id='+room,{headers:{cookie:studentCookie}})).status,403);
 assert.equal((await fetch(base+'/api/exams?turma_id='+room,{headers:{cookie:teacherCookie}})).status,200);
 assert.equal((await fetch(base+'/api/exams?turma_id='+other,{headers:{cookie:teacherCookie}})).status,404);
 assert.equal((await fetch(base+'/api/exams/'+other+'/file',{headers:{cookie:teacherCookie}})).status,404);
 assert.equal((await fetch(base+'/api/uploads',{method:'POST',headers:{cookie:teacherCookie,origin:'https://other.example'}})).status,403);
 assert.equal((await fetch(base+'/api/uploads',{method:'POST',headers:{cookie:studentCookie,origin:base}})).status,403);
 const page=await fetch(base+'/professor/dashboard',{redirect:'manual'});
 if(page.status===307)assert.equal(page.headers.get('location'),'/login');
 else {const html=await page.text();assert.match(html,/NEXT_REDIRECT/);assert.match(html,/\/login/);assert.doesNotMatch(html,/account-bar/);}
 console.log('Passed: anonymous access, roles, class ownership, exam ownership, cross-origin writes and protected pages.');
}catch(error){console.error(logs);throw error;}finally{app.kill();mock.closeAllConnections();mock.close();}
