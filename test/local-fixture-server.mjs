// Local QA only. This transport never calls a real provider or reads credentials.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {sqliteD1,migrate} from './sqlite-d1.mjs';
import {handleJudgeAPI} from '../lib/judge-handler.mjs';
import {usedUnits} from '../lib/judge-store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const fixturePassword='local-browser-test-not-a-real-access-code';
export async function startFixture(port=0){
 const DB=migrate(sqliteD1());
 const env={DB,JUDGE_PASSWORD:fixturePassword,YOUCAM_API_KEY:'local-fixture-not-a-real-provider-key',YOUCAM_ENABLE_UPLOAD:'true',SERVER_UNIT_LIMIT:'32'};
 const calls=[];let files=0,creates=0;
 const result=await readFile(path.join(root,'public/demo-results/navy.jpg'));
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url);calls.push({method:options.method||'GET',path:u.pathname});
  if(await usedUnits(DB)<2)throw Error('Provider protocol preceded reservation');
  if(u.pathname==='/s2s/v2.0/file'){
   files++;const f=JSON.parse(options.body).files[0];
   return Response.json({data:{files:[{file_id:'offline-file-'+files,requests:[{method:'PUT',url:'https://yce-us.s3.amazonaws.com/offline-input-'+files,headers:{'Content-Type':f.content_type,'Content-Length':String(f.file_size)}}]}]}});
  }
  if(options.method==='PUT')return new Response('',{status:200});
  if(u.pathname==='/s2s/v2.0/task/cloth-v4'){creates++;return Response.json({data:{task_id:'offline-task-'+creates}})}
  if(u.pathname.startsWith('/s2s/v2.0/task/cloth-v4/'))return Response.json({data:{task_status:'success',results:{url:'https://yce-us.s3.amazonaws.com/offline-result.jpg'}}});
  if(u.pathname==='/offline-result.jpg')return new Response(result,{headers:{'Content-Type':'image/jpeg','Content-Length':String(result.length)}});
  throw Error('Unknown offline fixture path');
 };
 const mime={'.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.html':'text/html; charset=utf-8'};
 const server=http.createServer(async(incoming,outgoing)=>{
  try{
   const origin='http://127.0.0.1:'+server.address().port,url=new URL(incoming.url,origin);
   const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
   const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
   let response;
   if(url.pathname.startsWith('/api/'))response=await handleJudgeAPI(new Request(url,{method:incoming.method,headers,...(['GET','HEAD'].includes(incoming.method)?{}:{body:Buffer.concat(chunks)})}),env,{fetchImpl});
   else if(url.pathname==='/'){
    let html=await readFile(path.join(root,'assets/fitting-room.html'),'utf8');
    html=html.replace('</head>','<link rel="stylesheet" href="/judge.css"></head>').replace('<body>','<body><p role="status" id="offline-test-banner">OFFLINE JUDGING TEST — no provider requests or units</p>').replace('</body>','<script type="module" src="/judge-access.mjs"></script></body>');
    response=new Response(html,{headers:{'Content-Type':mime['.html']}});
   }else if(url.pathname==='/judge'){
    response=new Response('<!doctype html><html><body><p>OFFLINE JUDGING TEST — no provider requests or units</p><form action="/api/judge/login" method="post"><label>Access code<input name="password" type="password"></label><button>Open the fitting room</button></form></body></html>',{headers:{'Content-Type':mime['.html']}});
   }else{
    const relative=decodeURIComponent(url.pathname).slice(1),file=path.resolve(root,'public',relative),base=path.resolve(root,'public')+path.sep;
    if(!file.startsWith(base)||!mime[path.extname(file)])response=new Response('Not found',{status:404});
    else response=new Response(await readFile(file),{headers:{'Content-Type':mime[path.extname(file)]}});
   }
   outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));
  }catch{outgoing.writeHead(500,{'Content-Type':'text/plain'});outgoing.end('Offline test server error')}
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port,DB,calls,get creates(){return creates},async close(){await new Promise(resolve=>server.close(resolve));DB.close()}};
}
